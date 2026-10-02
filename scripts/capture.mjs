import { chromium } from 'playwright';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty)
  throw Error('Commit source before capturing so the evidence has an exact source revision.');
await mkdir('artifacts/video', { recursive: true });
await mkdir('docs', { recursive: true });
const server = await serve();
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const viewport = { width: 1440, height: 1000 };
const context = await browser.newContext({
  viewport,
  recordVideo: { dir: 'artifacts/video', size: viewport },
});
const page = await context.newPage();
const errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.addInitScript(() => {
    let seed = 402;
    Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  });
  await page.goto('http://127.0.0.1:4173');
  // Playwright's default caret hiding leaves empty style attributes on editors.
  // Keep the caret unchanged so the recorder cannot mutate the source fixture.
  const before = await page.locator('main').innerHTML();
  await page.screenshot({ caret: 'initial', path: 'docs/playground-before.png' });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    globalThis.captureStats = { frames: [], longTasks: [] };
    const observer = new PerformanceObserver((list) =>
      captureStats.longTasks.push(...list.getEntries().map((e) => e.duration)),
    );
    observer.observe({ type: 'longtask', buffered: false });
    let previous = performance.now();
    const tick = (now) => {
      captureStats.frames.push(now - previous);
      previous = now;
      if (captureStats.frames.length < 5000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  page.on('request', (r) => requests.push(r.url()));
  const started = Date.now();
  await page.locator('#demo-personality').selectOption('feral');
  await page.locator('#demo-intensity').fill('85');
  await page.locator('#demo-intensity').dispatchEvent('input');
  await page.locator('#demo-summon').click();
  await page.waitForTimeout(6500);
  await page.mouse.move(600, 500, { steps: 10 });
  await page.locator('#demo-personality').selectOption('feral');
  await page.locator('#demo-intensity').fill('76');
  await page.locator('#demo-intensity').dispatchEvent('input');
  await page.waitForTimeout(11500);
  await page.screenshot({ caret: 'initial', path: 'docs/playground.png' });
  const fragmentCount = await page.locator('[data-cr4wler-root] .piece').count();
  await page.locator('#demo-follow').check();
  await page.mouse.move(500, 680, { steps: 24 });
  await page.waitForTimeout(1800);
  await page.mouse.move(740, 280, { steps: 24 });
  await page.waitForTimeout(1800);
  await page.locator('#demo-follow').uncheck();
  await page.locator('[data-cr4wler-root] .pause').click();
  await page.waitForTimeout(600);
  await page.locator('[data-cr4wler-root] .pause').click();
  await page.evaluate(() => scrollTo({ top: 580, behavior: 'smooth' }));
  await page.waitForTimeout(5500);
  await page.screenshot({ caret: 'initial', path: 'docs/playground-scrolled.png' });
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(900);
  await page.screenshot({ caret: 'initial', path: 'docs/playground-returned.png' });
  const effects = await page
    .locator('[data-cr4wler-root] .piece')
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.dataset.effect))]);
  await page.keyboard.press('Escape');
  const after = await page.locator('main').innerHTML();
  const restoreExact = after === before;
  if (!restoreExact) {
    await writeFile('artifacts/source-before.html', before);
    await writeFile('artifacts/source-after.html', after);
  }
  await page.waitForTimeout(800);
  const stats = await page.evaluate(() => captureStats);
  const sorted = stats.frames.filter((n) => n > 0).sort((a, b) => a - b);
  const metrics = {
    frameSamples: sorted.length,
    medianFrameMs: sorted[Math.floor(sorted.length * 0.5)],
    p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
    p99FrameMs: sorted[Math.floor(sorted.length * 0.99)],
    over50ms: sorted.filter((n) => n > 50).length,
    longTasks: stats.longTasks,
  };
  const video = page.video();
  await page.close();
  await context.close();
  await video.saveAs('docs/demo.webm');
  const popup = await browser.newPage({ viewport: { width: 368, height: 750 } });
  await popup.addInitScript(() => {
    globalThis.chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async () => {
          throw Error('inactive demo');
        },
      },
    };
  });
  await popup.goto('http://127.0.0.1:4173/popup.html');
  await popup.locator('body').screenshot({ caret: 'initial', path: 'docs/popup.png' });
  await popup.close();
  const evidence = {
    sourceCommit: commit,
    capturedAt: new Date().toISOString(),
    browser: browser.version(),
    surface:
      'Local playground. Not an installed extension. Popup screenshot uses mocked chrome.tabs.',
    viewport,
    elapsedMs: Date.now() - started,
    fragmentCount,
    effects,
    restoreExact,
    pageRequestsAfterActivation: requests,
    pageErrors: errors,
    metrics,
    extensionLoad: {
      status: 'blocked',
      reason: 'Loading of unpacked extensions is disabled by the administrator.',
    },
  };
  await writeFile('artifacts/evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  await copyFile('artifacts/evidence.json', 'docs/evidence.json');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  server.close();
}
