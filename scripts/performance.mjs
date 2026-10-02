/** A sample without screenshots/video, to separate render work from capture overhead. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
const server = await serve();
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:4173');
  await page.evaluate(() => {
    globalThis.samples = { frames: [], tasks: [] };
    let last = performance.now();
    new PerformanceObserver((list) =>
      samples.tasks.push(
        ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    ).observe({ type: 'longtask' });
    function frame(now) {
      samples.frames.push(now - last);
      last = now;
      if (samples.frames.length < 1800) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  await page.locator('#demo-summon').click();
  await page.waitForTimeout(12000);
  const samples = await page.evaluate(() => samples);
  samples.frames.sort((a, b) => a - b);
  const result = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    surface: 'Local playground without video recording or screenshots',
    browser: browser.version(),
    durationSeconds: 12,
    frameSamples: samples.frames.length,
    medianFrameMs: samples.frames[Math.floor(samples.frames.length * 0.5)],
    p95FrameMs: samples.frames[Math.floor(samples.frames.length * 0.95)],
    longTasks: samples.tasks,
    fragments: await page.locator('[data-cr4wler-root] .piece').count(),
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/performance.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
