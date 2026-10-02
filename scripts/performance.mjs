/** Same real pointer scenario without video or screenshots. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
import { preparePointerSession, runPointerSession } from './pointer-session.mjs';
const server = await serve(),
  browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:4173/reference.html?theme=night');
  await page.evaluate(() => document.querySelector('#reference-volume-8').scrollIntoView());
  await preparePointerSession(page);
  const controls = {
    setPersonality: async (value) => page.locator('#demo-personality').selectOption(value),
    setFollow: async (value) => page.locator('#demo-follow').setChecked(value),
    summon: async () => page.locator('#demo-summon').click(),
    pause: async () => page.locator('[data-cr4wler-root] .pause').click(),
  };
  const start = Date.now();
  const result = await runPointerSession(page, controls, 'artifacts', 'performance', {
    screenshots: false,
  });
  const evidence = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    surface:
      'Dense night fixture, real pointer hunts, temperament changes and edge scrolling; no video or screenshots',
    browser: browser.version(),
    durationSeconds: (Date.now() - start) / 1000,
    ...result,
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/performance.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  server.close();
}
