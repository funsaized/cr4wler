/** Headed native toolbar-popup checks; never changes extension policy or permissions. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from './serve.mjs';

const directory = 'artifacts/extension-evidence/popup';
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-native-popup-'));
const server = await serve();
let context, cdp;
const evidence = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  surface: 'Actual headed Chromium toolbar popup, installed MV3 extension, CDP toolbar gesture',
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
        confirmedActive: document.querySelector('#summon').textContent.includes('Your spider is here'),
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
    reducedMotion: 'reduce',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const site = await context.newPage();
  await site.goto('http://127.0.0.1:4173/reference.html');
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

  popup = await nativePopup(id, site);
  await until(
    () => popup.evaluate('document.querySelector("#summon").disabled'),
    'active status loads',
  );
  await delay(150);
  assert.equal(await targetExists(popup.targetId), true, 'status alone leaves controls open');
  assert.equal(await popup.evaluate('document.querySelector("#follow-mouse").checked'), true);
  assert.equal(await popup.evaluate('document.querySelector("#intensity").value'), '83');
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
  await site.keyboard.press('Escape');
  assert.equal(await site.locator('main').innerHTML(), original);
  assert.equal(await site.evaluate(() => siteCloseAttempts), 0);
  assert.equal(site.url(), originalURL);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  await site.screenshot({ path: `${directory}/restored-site.png` });

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
    [1, 1],
  );
  const image = await popup.send('Page.captureScreenshot');
  await writeFile(`${directory}/restricted-popup.png`, Buffer.from(image.data, 'base64'));
  evidence.failure = {
    popupStaysOpen: true,
    actionableError: true,
    retryEnabled: true,
    closeCalls: 0,
  };
  popup.dispose();
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
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(`${directory}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
}
