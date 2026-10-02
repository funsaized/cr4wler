/** Real MV3 integration. Never modifies policy or adds permissions to the manifest. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serve } from './serve.mjs';
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-extension-'));
const server = await serve();
let context, fixtureVideo, fixturePage;
await mkdir('artifacts/extension-evidence', { recursive: true });
const evidence = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  surface: 'Actual installed unpacked extension; real Chrome APIs; CDP toolbar action',
  passed: false,
};
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: 'artifacts/extension-video', size: { width: 1440, height: 1000 } },
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  fixturePage = page;
  fixtureVideo = page.video();
  await page.goto('http://127.0.0.1:4173/reference.html');
  await page.bringToFront();
  const original = await page.locator('main').innerHTML();
  const originalURL = page.url();
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    globalThis.motionSamples = { frames: [], tasks: [], effects: [], phases: [] };
    new PerformanceObserver((list) =>
      motionSamples.tasks.push(
        ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    ).observe({ type: 'longtask' });
    let previous = performance.now();
    function tick(now) {
      motionSamples.frames.push(now - previous);
      previous = now;
      const host = document.querySelector('[data-cr4wler-root]');
      if (host) {
        const phase = host.dataset.phase;
        if (phase && motionSamples.phases.at(-1)?.phase !== phase)
          motionSamples.phases.push({ phase, at: now });
        for (const piece of host.shadowRoot.querySelectorAll('.piece')) {
          if (piece.dataset.effect && !motionSamples.effects.includes(piece.dataset.effect))
            motionSamples.effects.push(piece.dataset.effect);
        }
      }
      if (motionSamples.frames.length < 6000) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  page.on('request', (request) => requests.push(request.url()));
  await page.evaluate(() => {
    globalThis.siteActions = { click: 0, input: 0, change: 0, submit: 0 };
    for (const event of Object.keys(siteActions))
      document.querySelector('main').addEventListener(event, () => siteActions[event]++, true);
  });
  // Before the toolbar gesture, the shipped manifest must not allow injection.
  const denied = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(denied, true, 'activeTab must require a gesture');
  const target = (
    await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
  ).targetInfos.find((t) => t.type === 'tab' && t.url === originalURL);
  await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
  console.log('Real toolbar action triggered; activeTab granted to fixture.');
  // The real popup is rendered, and actual Chrome scripting/messaging execute the
  // same content controller. No fake chrome object or host permission is added.
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('button', { name: 'Summon your spider' }).waitFor();
  await popup.getByRole('button', { name: 'Feral' }).click();
  await popup.locator('#intensity').fill('85');
  await popup.locator('#intensity').dispatchEvent('change');
  await popup.locator('#summon').click();
  await page.bringToFront();
  await page.waitForSelector('[data-cr4wler-root]');
  await page.waitForFunction(
    () => document.querySelector('[data-cr4wler-root]')?.shadowRoot?.querySelector('.piece'),
    {},
    { timeout: 12000 },
  );
  await page.waitForTimeout(16000);
  await page.screenshot({
    path: 'artifacts/extension-evidence/extension-live.png',
    caret: 'initial',
  });
  assert.equal(await page.locator('main').innerHTML(), original);
  await popup.locator('#follow-mouse').check();
  await page.bringToFront();
  await page.mouse.move(820, 660, { steps: 24 });
  await page.waitForTimeout(2200);
  await page.mouse.move(420, 350, { steps: 24 });
  await page.waitForTimeout(2200);
  await popup.locator('#follow-mouse').uncheck();
  await popup.locator('#pause').click();
  const frozen = await page.locator('[data-cr4wler-root] .pieces').evaluate((el) => el.innerHTML);
  const retained = await page
    .locator('[data-cr4wler-root] .piece')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId));
  assert.ok(retained.length > 0);
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator('[data-cr4wler-root] .pieces').evaluate((el) => el.innerHTML),
    frozen,
  );
  await page.bringToFront();
  await page.evaluate(() => document.querySelector('#reference-volume-30').scrollIntoView());
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0);
  await popup.locator('#pause').click();
  await page.bringToFront();
  await page.waitForSelector('[data-cr4wler-root] .piece', { timeout: 14000 });
  await page.waitForTimeout(2500);
  await page.screenshot({
    path: 'artifacts/extension-evidence/extension-deep-scroll.png',
    caret: 'initial',
  });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(700);
  const returned = await page
    .locator('[data-cr4wler-root] .piece')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId));
  for (const id of retained) assert.ok(returned.includes(id), 'old visible aftermath must return');
  await page.screenshot({
    path: 'artifacts/extension-evidence/extension-trail-returned.png',
    caret: 'initial',
  });
  evidence.persistentRecordIds = retained;
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
  assert.equal(await page.locator('main').innerHTML(), original);
  assert.equal(page.url(), originalURL);
  assert.deepEqual(requests, []);
  assert.deepEqual(await page.evaluate(() => siteActions), {
    click: 0,
    input: 0,
    change: 0,
    submit: 0,
  });
  assert.equal(
    await page.locator('#fixture-input').inputValue(),
    'Please leave my words right here',
  );
  assert.equal(await page.locator('#fixture-password').inputValue(), 'demo-only-not-a-secret');
  assert.deepEqual(errors, []);
  await page.waitForTimeout(900);
  await page.screenshot({
    path: 'artifacts/extension-evidence/extension-restored.png',
    caret: 'initial',
  });
  const samples = await page.evaluate(() => motionSamples);
  const frames = samples.frames.filter((n) => n > 0).sort((a, b) => a - b);
  evidence.effects = samples.effects;
  evidence.phases = samples.phases;
  evidence.metrics = {
    frameSamples: frames.length,
    medianFrameMs: frames[Math.floor(frames.length * 0.5)],
    p95FrameMs: frames[Math.floor(frames.length * 0.95)],
    p99FrameMs: frames[Math.floor(frames.length * 0.99)],
    over50ms: frames.filter((n) => n > 50).length,
    longTasks: samples.tasks,
  };
  evidence.exactRestore = true;
  evidence.errors = errors;
  evidence.passed = true;
  evidence.browser = context.browser().version();
  evidence.requests = requests;
  console.log(
    'ACTUAL EXTENSION PASS: load, denied-before-gesture, toolbar grant, popup Summon/Pause/Resume, real isolated-world grabs, Escape, exact DOM restore, unchanged forms, zero page requests/navigation/actions.',
  );
} catch (error) {
  console.error(`ACTUAL EXTENSION CHECK BLOCKED/FAILED: ${error.message}`);
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  if (fixturePage && !fixturePage.isClosed()) await fixturePage.close();
  if (fixtureVideo) await fixtureVideo.saveAs('artifacts/extension-evidence/extension-demo.webm');
  await context?.close();
  await writeFile(
    'artifacts/extension-evidence/result.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  await rm(profile, { recursive: true, force: true });
  server.close();
}
