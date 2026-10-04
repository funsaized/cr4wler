/** Headed installed interruption and demo first-use checks. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { serve } from './serve.mjs';
const dir = 'artifacts/extension-evidence/first-run';
await mkdir(dir, { recursive: true });
const server = await serve(0),
  base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-first-run-'));
const evidence = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contentSha256: createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex'),
  surface:
    'Headed installed MV3; real engine clocks, dock handlers; synthetic fixtures; separately hosted demo',
  interruptions: [],
  passed: false,
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: `${dir}/raw`, size: { width: 1280, height: 900 } },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  evidence.browser = context.browser().version();
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  const matrixVideo = page.video();
  for (const other of context.pages()) if (other !== page) await other.close();
  await page.goto(`${base}/anticipation.html?autostart=off`);
  const original = await page.locator('main').innerHTML();
  const tab = (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find(
    (t) => t.url === page.url(),
  );
  await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#follow-mouse').check();
  await popup.locator('#summon').click();
  await page.bringToFront();
  await page.locator('[data-cr4wler-root] .tip button').click();
  const debug = await context.newCDPSession(page),
    worlds = [];
  debug.on('Runtime.executionContextCreated', (e) => worlds.push(e.context.id));
  await debug.send('Runtime.enable');
  let world;
  for (const contextId of worlds) {
    const r = await debug.send('Runtime.evaluate', {
      contextId,
      expression: '!!globalThis.__cr4wler',
      returnByValue: true,
    });
    if (r.result.value) world = contextId;
  }
  assert.ok(world);
  const inspect = async (expression) => {
    const r = await debug.send('Runtime.evaluate', {
      contextId: world,
      expression,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const command = async (action, settings) =>
    worker.evaluate(
      async ({ tabId, action, settings }) =>
        chrome.tabs.sendMessage(tabId, { type: 'CR4WLER', action, settings }),
      {
        tabId: await popup.evaluate(async () => {
          const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
          return t.id;
        }),
        action,
        settings,
      },
    );
  // All actions go through the installed controller or actual dock button handler.
  // Inspection reads the real phase; no seeded clock, geometry or substitute animation.
  await command('restore');
  for (const species of ['curious', 'dreamy', 'feral']) {
    const videoStart = Date.now();
    for (const stage of [
      'arrive',
      'scan',
      'notice',
      'investigate',
      'lock',
      'prepare',
      'strike',
      'settle',
      'aftermath',
      'recover',
    ]) {
      await page.evaluate(() => scrollTo(0, 0));
      await command('summon', { personality: species, intensity: 0.65, followMouse: true });
      if (stage !== 'arrive') {
        if (stage !== 'scan') {
          const p = await page.locator('#target-a').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x + 80, y: r.y + 16 };
          });
          await page.mouse.move(p.x, p.y);
        } else await page.mouse.move(80, 50);
        if (stage === 'recover') {
          await page.waitForTimeout(1900);
          await page.mouse.move(700, 600);
          await page.mouse.wheel(0, 700);
        }
      }
      const deadline = Date.now() + 14000;
      let paused;
      while (Date.now() < deadline) {
        paused = await inspect(
          `(() => {const e=__cr4wler;if(e.mode!==${JSON.stringify(stage)})return null;e.root.querySelector('.pause').click();return {phase:e.mode,time:e.time,phaseTime:e.phaseTime,count:e.fragments.length,current:e.current?.progress ?? null,paused:e.status().paused};})()`,
        );
        if (paused) break;
        await page.waitForTimeout(8);
      }
      assert.ok(paused, `${species} reaches ${stage}`);
      assert.equal(paused.paused, true);
      await page.waitForTimeout(150);
      assert.deepEqual(
        await inspect(
          '({phase:__cr4wler.mode,time:__cr4wler.time,phaseTime:__cr4wler.phaseTime,count:__cr4wler.fragments.length,current:__cr4wler.current?.progress ?? null,paused:__cr4wler.status().paused})',
        ),
        paused,
      );
      if (['prepare', 'strike', 'recover'].includes(stage))
        await page.screenshot({ caret: 'initial', path: `${dir}/${species}-${stage}-paused.png` });
      const switched = species === 'curious' ? 'dreamy' : 'curious';
      await command('configure', { personality: switched });
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 1);
      assert.equal((await command('status')).paused, true);
      // Double Restore is idempotent, and no animation work resurrects it.
      await inspect("__cr4wler.root.querySelector('.restore').click()");
      await command('restore');
      await page.waitForTimeout(50);
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      assert.equal(await page.locator('main').innerHTML(), original);
      evidence.interruptions.push({ species, stage, paused, switched, exactRestore: true });
    }
    evidence[`${species}MatrixDurationMs`] = Date.now() - videoStart;
  }
  // Keep one native tab open while opening the next walkthrough surface.
  // Ordinary demo auto-start, fresh origin storage, actual keyboard and touch controls.
  const demo = await context.newPage(),
    demoVideo = demo.video();
  await page.close();
  await matrixVideo.saveAs(`${dir}/installed-matrix-normal.webm`);
  await popup.close();
  await demo.goto(base);
  assert.equal(await demo.locator('[data-cr4wler-root]').count(), 1);
  await demo.waitForTimeout(1500);
  await demo.screenshot({ caret: 'initial', path: `${dir}/site-first-use.png` });
  await demo.locator('[data-cr4wler-root] .tip button').focus();
  await demo.keyboard.press('Enter');
  for (const species of ['curious', 'dreamy', 'feral']) {
    await demo.locator('#demo-personality').selectOption(species);
    await demo.locator('#demo-follow').check();
    await demo.mouse.move(480, 410);
    await demo.waitForTimeout(1600);
    await demo.locator('#demo-pause').focus();
    await demo.keyboard.press('Enter');
    assert.equal(await demo.locator('#demo-pause').innerText(), 'Resume');
    await demo.screenshot({ caret: 'initial', path: `${dir}/site-${species}.png` });
    await demo.keyboard.press('Enter');
  }
  await demo.locator('#fixture-input').fill('My edited note survives Restore');
  await demo.locator('#fixture-editor').fill('My editable words survive too');
  await demo.locator('#demo-restore').click();
  assert.equal(
    await demo.locator('#fixture-input').inputValue(),
    'My edited note survives Restore',
  );
  assert.equal(await demo.locator('#fixture-editor').innerText(), 'My editable words survive too');
  await demo.reload();
  assert.equal(await demo.locator('[data-cr4wler-root] .tip').count(), 0);
  assert.equal(await demo.locator('#demo-personality').inputValue(), 'feral');
  evidence.touchLayout = [];
  for (const width of [320, 390]) {
    const mobileContext = await context.browser().newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
      ...(width === 390
        ? { recordVideo: { dir: `${dir}/touch-raw`, size: { width, height: 844 } } }
        : {}),
    });
    const mobile = await mobileContext.newPage(),
      mobileVideo = mobile.video();
    await mobile.goto(base);
    assert.equal(
      await mobile.evaluate(
        () => matchMedia('(any-hover: none) and (any-pointer: coarse)').matches,
      ),
      true,
    );
    assert.match(
      await mobile.locator('[data-cr4wler-root] .tip').innerText(),
      /explores on its own/,
    );
    assert.match(await mobile.locator('.follow-toggle').innerText(), /mouse or trackpad/);
    await mobile.screenshot({ caret: 'initial', path: `${dir}/site-touch-${width}-first-use.png` });
    await mobile.locator('[data-cr4wler-root] .pause').tap();
    // Let Chrome's transient touch highlight fade before the stable paused pixels.
    await mobile.waitForTimeout(350);
    assert.equal(await mobile.locator('#demo-pause').innerText(), 'Resume');
    assert.equal(await mobile.locator('#demo-description').isVisible(), true);
    assert.equal(await mobile.locator('.restore-help').isVisible(), true);
    for (const species of ['curious', 'dreamy', 'feral']) {
      await mobile.locator('#demo-personality').selectOption(species);
      await mobile.screenshot({
        caret: 'initial',
        path: `${dir}/site-touch-${width}-${species}-paused.png`,
      });
      if (width === 390 && species === 'dreamy')
        await mobile.screenshot({ caret: 'initial', path: `${dir}/site-touch-paused.png` });
      for (const long of [false, true]) {
        const activity = mobile.locator('[data-cr4wler-root] .activity');
        const originalActivity = await activity.innerText();
        if (long) {
          // Layout-only stress copy from an existing limit message; clocks/geometry stay real.
          await activity.evaluate((el, species) => {
            el.textContent = `${species} · 512 marks · scrapbook full · Restore to explore again`;
          }, species);
        }
        const bounds = await mobile.locator('[data-cr4wler-root]').evaluate((host) => {
          const rect = (selector) => {
            const r = host.shadowRoot.querySelector(selector).getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom,
            };
          };
          return {
            dock: rect('.dock'),
            hint: rect('.tip'),
            pause: rect('.pause'),
            restore: rect('.restore'),
            activity: rect('.activity'),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.ok(bounds.dock.width >= width - 25 && bounds.dock.right <= width);
        assert.ok(bounds.activity.width >= 100);
        assert.ok(bounds.hint.bottom + 8 <= bounds.dock.y);
        for (const button of [bounds.pause, bounds.restore])
          assert.ok(button.height >= 44 && button.width >= 44);
        assert.equal(bounds.overflow, false);
        if (long) {
          await mobile.screenshot({
            caret: 'initial',
            path: `${dir}/site-touch-${width}-${species}-long.png`,
          });
          await activity.evaluate((el, text) => {
            el.textContent = text;
          }, originalActivity);
        }
        evidence.touchLayout.push({ width, species, longActivityCopy: long, bounds });
      }
    }
    await mobile.locator('[data-cr4wler-root] .tip button').tap();
    await mobile.locator('[data-cr4wler-root] .pause').tap();
    assert.equal(await mobile.locator('#demo-pause').innerText(), 'Pause');
    await mobile.locator('[data-cr4wler-root] .pause').tap();
    await mobile.locator('[data-cr4wler-root] .restore').tap();
    assert.equal(await mobile.locator('[data-cr4wler-root]').count(), 0);
    if (width === 390)
      await mobile.screenshot({ caret: 'initial', path: `${dir}/site-touch-restored.png` });
    await mobileContext.close();
    if (mobileVideo) await mobileVideo.saveAs(`${dir}/site-touch-normal.webm`);
  }
  await demo.close();
  await demoVideo.saveAs(`${dir}/site-normal.webm`);
  evidence.demo = {
    autoStart: true,
    allSpecies: true,
    keyboard: true,
    editableFields: true,
    reloadPreferences: true,
    hintOnce: true,
    touch: true,
    reducedMotion: true,
  };
  evidence.passed = true;
  console.log(
    'FIRST-RUN PASS: installed phase Pause/Restore matrix and headed demo keyboard/touch/persistence walkthrough.',
  );
} catch (error) {
  evidence.error = error.message;
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close().catch((error) => {
    evidence.cleanupError = error.message;
  });
  server.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(`${dir}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
}
