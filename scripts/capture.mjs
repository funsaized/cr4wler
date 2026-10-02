import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
import { preparePointerSession, runPointerSession } from './pointer-session.mjs';
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw Error('Commit source before capture so evidence has an exact revision.');
await mkdir('artifacts/video', { recursive: true });
const server = await serve(),
  browser = await chromium.launch({ channel: 'chromium', headless: true });
const viewport = { width: 1440, height: 1000 };
const context = await browser.newContext({
  viewport,
  recordVideo: { dir: 'artifacts/video', size: viewport },
});
const page = await context.newPage();
try {
  await page.goto('http://127.0.0.1:4173/reference.html?theme=night');
  await page.evaluate(() => document.querySelector('#reference-volume-8').scrollIntoView());
  const before = await page.locator('main').innerHTML();
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.screenshot({ path: 'docs/playground-before.png', caret: 'initial' });
  await preparePointerSession(page);
  const controls = {
    setPersonality: async (value) => page.locator('#demo-personality').selectOption(value),
    setFollow: async (value) => page.locator('#demo-follow').setChecked(value),
    summon: async () => page.locator('#demo-summon').click(),
    pause: async () => page.locator('[data-cr4wler-root] .pause').click(),
  };
  const result = await runPointerSession(page, controls, 'docs', 'playground');
  assert.equal(await page.locator('main').innerHTML(), before);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const evidence = {
    sourceCommit: commit,
    capturedAt: new Date().toISOString(),
    surface: 'Standalone pointer-controlled night reference playground; not an installed extension',
    browser: browser.version(),
    viewport,
    ...result,
    exactRestore: true,
    pageErrors: errors,
    pageRequestsAfterActivation: requests,
  };
  const video = page.video();
  await page.close();
  await video.saveAs('docs/demo.webm');
  await writeFile('docs/evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  const popup = await context.newPage();
  await popup.addInitScript(() => {
    globalThis.chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async () => {
          throw Error('Inactive fixture');
        },
      },
    };
  });
  await popup.goto('http://127.0.0.1:4173/popup.html');
  await popup.locator('body').screenshot({ path: 'docs/popup.png', caret: 'initial' });
  await popup.close();
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await context.close();
  await browser.close();
  server.close();
}
