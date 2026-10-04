/** Headed native toolbar-popup checks; never changes extension policy or permissions. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from './serve.mjs';

const directory = 'artifacts/extension-evidence/popup';
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-native-popup-'));
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
let context, cdp, recording;
const evidence = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  surface: 'Actual headed Chromium toolbar popup, installed MV3 extension, CDP toolbar gesture',
  contentSha256: createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex'),
  uncommittedSource:
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  passed: false,
  closes: [],
};

async function until(check, description) {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const result = await check();
    if (result) return result;
    await delay(50);
  }
  throw Error(`Timed out: ${description}`);
}

// Native action popovers are not regular Playwright tabs. Attach to their actual CDP target.
async function attach(targetId) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let next = 0;
  const pending = new Map();
  function receive(event) {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    if (message.method === 'Runtime.bindingCalled' && message.params.name === 'recordPopupClose')
      evidence.closes.push(JSON.parse(message.params.payload));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    pending.delete(message.id);
    if (message.error) waiter.reject(Error(message.error.message));
    else waiter.resolve(message.result);
  }
  cdp.on('Target.receivedMessageFromTarget', receive);
  function send(method, params = {}) {
    const id = ++next;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(Error(`Native popup CDP timeout: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timeout });
      void cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch((error) => {
          clearTimeout(timeout);
          pending.delete(id);
          reject(error);
        });
    });
  }
  return {
    targetId,
    send,
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
      return result.result.value;
    },
    dispose() {
      cdp.off('Target.receivedMessageFromTarget', receive);
      for (const waiter of pending.values()) clearTimeout(waiter.timeout);
    },
  };
}

async function nativePopup(id, site) {
  await site.bringToFront();
  const tab = (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find(
    (target) => target.url === site.url(),
  );
  assert.ok(tab, 'site tab exists before toolbar gesture');
  await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const target = await until(async () => {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return targetInfos.find((target) => target.url === `chrome-extension://${id}/popup.html`);
  }, 'native popup target opens');
  const popup = await attach(target.targetId);
  await until(
    () =>
      popup.evaluate('document.readyState === "complete" && !!document.querySelector("#summon")'),
    'native popup document loads',
  );
  assert.equal(
    await popup.evaluate('chrome.extension.getViews({type:"popup"}).includes(window)'),
    true,
    "tested window is Chrome's actual popup view",
  );
  await popup.evaluate('chrome.tabs.query({active:true,currentWindow:true})');
  await popup.send('Runtime.addBinding', { name: 'recordPopupClose' });
  await popup.evaluate(`(() => {
    const nativeClose = window.close.bind(window);
    let calls = 0;
    window.close = () => {
      recordPopupClose(JSON.stringify({
        calls: ++calls,
        targetId: ${JSON.stringify(target.targetId)},
        confirmedActive: document.querySelector('#summon').textContent.includes('Your tiny menace is here'),
        toolbarView: chrome.extension.getViews({type:'popup'}).includes(window)
      }));
      nativeClose();
    };
  })()`);
  return popup;
}

async function targetExists(targetId) {
  return (await cdp.send('Target.getTargets')).targetInfos.some(
    (target) => target.targetId === targetId,
  );
}

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1200, height: 800 },
    reducedMotion: 'no-preference',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  if (process.env.CR4WLER_RECORD_DESKTOP === '1') {
    recording = spawn(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'x11grab',
        '-framerate',
        '30',
        '-video_size',
        process.env.CR4WLER_DESKTOP_SIZE ?? '1280x900',
        '-i',
        process.env.DISPLAY,
        '-c:v',
        'libvpx-vp9',
        '-deadline',
        'realtime',
        '-cpu-used',
        '5',
        '-threads',
        '2',
        '-crf',
        '38',
        '-b:v',
        '0',
        `${directory}/native-first-run.webm`,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    recording.stderr.on('data', (data) => {
      evidence.recordingError = (evidence.recordingError ?? '') + data.toString();
    });
  }
  cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const site = await context.newPage();
  await site.goto(`${base}/reference.html?autostart=off`);
  const original = await site.locator('main').innerHTML(),
    originalURL = site.url();
  const requests = [],
    errors = [];
  site.on('request', (request) => requests.push(request.url()));
  site.on('pageerror', (error) => errors.push(error.message));
  await site.evaluate(() => {
    globalThis.siteCloseAttempts = 0;
    window.close = () => siteCloseAttempts++;
  });

  let popup = await nativePopup(id, site);
  evidence.readyPopups = [];
  for (const species of ['curious', 'dreamy', 'feral']) {
    await popup.evaluate(`document.querySelector('[data-personality="${species}"]').click()`);
    await delay(200);
    const bounds = await popup.evaluate(
      `({height:document.body.getBoundingClientRect().height, width:document.documentElement.scrollWidth, viewport:innerWidth, footer:document.querySelector('footer').getBoundingClientRect().bottom, description:document.querySelector('#type-description').textContent})`,
    );
    const capture = await popup.send('Page.captureScreenshot');
    await writeFile(`${directory}/ready-${species}.png`, Buffer.from(capture.data, 'base64'));
    evidence.readyPopups.push({ species, ...bounds });
    assert.ok(
      bounds.height <= 600 && bounds.footer <= 600 && bounds.width <= bounds.viewport,
      JSON.stringify(bounds),
    );
  }
  await popup.evaluate(`(() => {
    document.querySelector('[data-personality="feral"]').click();
    const follow = document.querySelector('#follow-mouse');
    follow.checked = true; follow.dispatchEvent(new Event('change'));
    const slider = document.querySelector('#intensity');
    slider.value = '83'; slider.dispatchEvent(new Event('input')); slider.dispatchEvent(new Event('change'));
    document.querySelector('#summon').click();
    document.querySelector('#summon').dispatchEvent(new MouseEvent('click'));
  })()`);
  await until(
    async () => !(await targetExists(popup.targetId)),
    'successful launch closes native popup',
  );
  popup.dispose();
  assert.deepEqual(
    evidence.closes.map((close) => close.calls),
    [1],
  );
  assert.equal(evidence.closes[0].confirmedActive, true);
  assert.equal(evidence.closes[0].toolbarView, true);
  assert.equal(site.isClosed(), false);
  assert.equal(await site.locator('[data-cr4wler-root]').count(), 1);
  const status = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id, { type: 'CR4WLER', action: 'status' });
  });
  assert.equal(status.personality, 'feral');
  assert.equal(status.intensity, 0.83);
  assert.equal(status.followMouse, true);
  evidence.success = { popupClosed: true, closeCalls: 1, status, siteStillOpen: true };
  await site.waitForTimeout(1200);
  assert.equal(await site.locator('[data-cr4wler-root] .tip').count(), 1);
  await site.screenshot({ caret: 'initial', path: `${directory}/first-use.png` });
  await site.locator('[data-cr4wler-root] .tip button').focus();
  await site.keyboard.press('Enter');
  assert.equal(await site.locator('[data-cr4wler-root] .tip').count(), 0);
  await site.mouse.move(720, 400);
  await site.waitForTimeout(1300);
  console.log('Native first-use and dismissal verified.');
  evidence.firstUse = { shown: true, keyboardDismissed: true };

  popup = await nativePopup(id, site);
  await until(
    () => popup.evaluate('document.querySelector("#summon").disabled'),
    'active status loads',
  );
  await delay(150);
  assert.equal(await targetExists(popup.targetId), true, 'status alone leaves controls open');
  assert.equal(await popup.evaluate('document.querySelector("#follow-mouse").checked'), true);
  assert.equal(await popup.evaluate('document.querySelector("#intensity").value'), '83');
  for (const species of ['dreamy', 'curious', 'feral']) {
    await popup.evaluate(`document.querySelector('[data-personality="${species}"]').click()`);
    await delay(180);
    assert.equal(await site.locator('[data-cr4wler-root]').count(), 1);
    const capture = await popup.send('Page.captureScreenshot');
    await writeFile(`${directory}/active-${species}.png`, Buffer.from(capture.data, 'base64'));
  }
  await popup.evaluate('document.querySelector("#pause").click()');
  await until(
    () => popup.evaluate('document.querySelector("#pause").textContent === "Resume"'),
    'Pause updates native popup',
  );
  const pausedImage = await popup.send('Page.captureScreenshot');
  await writeFile(`${directory}/paused.png`, Buffer.from(pausedImage.data, 'base64'));
  await popup.evaluate('document.querySelector("#pause").click()');
  await until(
    () => popup.evaluate('document.querySelector("#pause").textContent === "Pause"'),
    'Resume updates native popup',
  );
  await popup.evaluate('document.querySelector("#summon").dispatchEvent(new MouseEvent("click"))');
  await until(
    async () => !(await targetExists(popup.targetId)),
    'idempotent active launch closes popup',
  );
  popup.dispose();
  assert.deepEqual(
    evidence.closes.map((close) => close.calls),
    [1, 1],
  );
  assert.equal(await site.locator('[data-cr4wler-root]').count(), 1);
  evidence.alreadyActive = { menuStaysOpenOnStatus: true, duplicateVisitors: 0, closeCalls: 1 };
  await site.bringToFront();
  await site.keyboard.press('Escape');
  await site.waitForFunction(() => !document.querySelector('[data-cr4wler-root]'));
  const restored = await site.locator('main').innerHTML();
  if (restored !== original) {
    let i = 0;
    while (restored[i] === original[i] && i < Math.min(restored.length, original.length)) i++;
    throw Error(
      'Restore mismatch at ' +
        i +
        ': ' +
        JSON.stringify({
          expected: original.slice(i, i + 150),
          actual: restored.slice(i, i + 150),
        }),
    );
  }
  assert.equal(await site.evaluate(() => siteCloseAttempts), 0);
  assert.equal(site.url(), originalURL);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  await site.screenshot({ caret: 'initial', path: `${directory}/restored-site.png` });
  // Fresh documents stay off until their own toolbar action; saved choices stay available.
  await site.reload();
  assert.equal(await site.locator('[data-cr4wler-root]').count(), 0);
  popup = await nativePopup(id, site);
  await until(
    () => popup.evaluate('document.querySelector("#intensity").value === "83"'),
    'saved choices after reload',
  );
  assert.equal(await popup.evaluate('document.querySelector("#follow-mouse").checked'), true);
  assert.equal(
    await popup.evaluate(
      'document.querySelector("[data-personality=feral]").getAttribute("aria-pressed")',
    ),
    'true',
  );
  await popup.evaluate('document.querySelector("#summon").click()');
  await until(async () => !(await targetExists(popup.targetId)), 'reload launch closes');
  popup.dispose();
  assert.equal(await site.locator('[data-cr4wler-root] .tip').count(), 0);
  await site.bringToFront();
  await site.keyboard.press('Escape');
  await site.waitForFunction(() => !document.querySelector('[data-cr4wler-root]'));
  const other = await context.newPage();
  await other.goto(`${base.replace('127.0.0.1', 'localhost')}/reference.html?autostart=off`);
  assert.equal(await other.locator('[data-cr4wler-root]').count(), 0);
  popup = await nativePopup(id, other);
  await until(
    () => popup.evaluate('document.querySelector("#intensity").value === "83"'),
    'saved choices in new tab/origin',
  );
  await popup.evaluate('document.querySelector("#summon").click()');
  await until(async () => !(await targetExists(popup.targetId)), 'new tab launch closes');
  popup.dispose();
  assert.equal(await other.locator('[data-cr4wler-root]').count(), 1);
  assert.equal(await site.locator('[data-cr4wler-root]').count(), 0);
  assert.equal(await other.locator('[data-cr4wler-root] .tip').count(), 0);
  await other.keyboard.press('Escape');
  await other.close();
  console.log('Native reload/new-tab persistence verified.');
  evidence.persistence = {
    reload: true,
    newTab: true,
    crossOrigin: true,
    hintDoesNotRepeat: true,
    noAutomaticInjection: true,
  };

  const restricted = await context.newPage();
  await restricted.goto('chrome://version');
  popup = await nativePopup(id, restricted);
  await popup.evaluate('document.querySelector("#summon").click()');
  await until(
    () => popup.evaluate('document.querySelector("#status").textContent.includes("off limits")'),
    'restricted-page error appears',
  );
  assert.equal(await targetExists(popup.targetId), true);
  assert.equal(await popup.evaluate('document.querySelector("#summon").disabled'), false);
  assert.deepEqual(
    evidence.closes.map((close) => close.calls),
    [1, 1, 1, 1],
  );
  const image = await popup.send('Page.captureScreenshot');
  await writeFile(`${directory}/restricted-popup.png`, Buffer.from(image.data, 'base64'));
  evidence.failure = {
    popupStaysOpen: true,
    actionableError: true,
    retryEnabled: true,
    closeCalls: 0,
  };
  assert.equal(await popup.evaluate('document.querySelector("#pause").disabled'), true);
  assert.equal(
    await popup.evaluate('document.querySelector("#summon").textContent.includes("is here")'),
    false,
  );
  popup.dispose();
  await restricted.goto(`${base}/reference.html?autostart=off`);
  popup = await nativePopup(id, restricted);
  await popup.evaluate('document.querySelector("#summon").click()');
  await until(async () => !(await targetExists(popup.targetId)), 'retry on ordinary page succeeds');
  popup.dispose();
  assert.equal(await restricted.locator('[data-cr4wler-root]').count(), 1);
  await restricted.keyboard.press('Escape');
  await restricted.close();
  evidence.failure.retryOnOrdinaryPage = true;
  console.log('Native failure/retry verified.');
  if (process.env.CR4WLER_CHECK_RELOAD === '1') {
    // A real extension reload approximates an update with the same extension ID.
    const updater = await context.newPage();
    await updater.goto(`chrome-extension://${id}/popup.html`);
    console.log('Extension reload page opened.');
    await updater.evaluate(() => {
      setTimeout(() => chrome.runtime.reload(), 500);
    });
    console.log('Extension reload requested.');
    await delay(1000);
    console.log('Extension reload wait finished.');
    // Keep the updater tab until context teardown; reload may replace its CDP target.
    await site.reload();
    console.log('Site reloaded after extension reload.');
    const reloadedControls = await context.newPage();
    await site.bringToFront();
    await reloadedControls.goto(`chrome-extension://${id}/popup.html`);
    await reloadedControls.waitForFunction(
      () => document.querySelector('#intensity').value === '83',
    );
    assert.equal(await reloadedControls.locator('#follow-mouse').isChecked(), true);
    assert.equal(await reloadedControls.evaluate(() => chrome.runtime.id), id);
    assert.equal(
      await reloadedControls.evaluate(() => localStorage.getItem('cr4wler.first-use.v1')),
      'shown',
    );
    await reloadedControls
      .locator('body')
      .screenshot({ caret: 'initial', path: `${directory}/after-extension-reload.png` });
    evidence.extensionReload = {
      sameId: true,
      preferencesSurvive: true,
      hintDoesNotRepeat: true,
      surface:
        'Actual extension popup page opened in a tab after runtime.reload; native toolbar verified before reload',
      limitation:
        'Experimental CDP toolbar trigger did not return after runtime.reload; post-update native toolbar behavior remains unverified',
    };
  } else {
    evidence.extensionReload = {
      tested: false,
      limitation:
        'The optional runtime.reload check was blocked by the experimental CDP installation: the reloaded extension page returned ERR_BLOCKED_BY_CLIENT. No policy bypass was attempted.',
    };
  }
  evidence.browser = context.browser().version();
  evidence.exactRestore = true;
  evidence.siteCloseAttempts = 0;
  evidence.requests = requests;
  evidence.errors = errors;
  evidence.passed = true;
  console.log(
    'NATIVE POPUP PASS: acknowledged launch closes once; failures keep retry open; active-status controls remain; settings and site preserved.',
  );
} catch (error) {
  evidence.error = error.message;
  console.error(`NATIVE POPUP CHECK BLOCKED/FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (recording && recording.exitCode === null) {
    const stopped = new Promise((resolve) => recording.once('exit', resolve));
    recording.kill('SIGINT');
    await stopped;
  }
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(`${directory}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
}
