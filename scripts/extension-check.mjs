/** Real MV3 integration. Never changes policy or manifest permissions. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serve } from './serve.mjs';
import { preparePointerSession, runPointerSession } from './pointer-session.mjs';
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-extension-'));
const server = await serve();
const dir = 'artifacts/extension-evidence';
await mkdir(dir, { recursive: true });
let context, fixturePage, fixtureVideo, currentTheme;
const evidence = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  surface:
    'Actual installed unpacked extension; real Chrome APIs; CDP toolbar action; pointer-driven dense fixtures',
  passed: false,
  sessions: [],
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
  for (const theme of ['light', 'night']) {
    currentTheme = theme;
    const page = await context.newPage();
    fixturePage = page;
    fixtureVideo = page.video();
    await page.goto(
      `http://127.0.0.1:4173/reference.html${theme === 'night' ? '?theme=night' : ''}`,
    );
    await page.evaluate(() => document.querySelector('#reference-volume-8').scrollIntoView());
    await page.bringToFront();
    const original = await page.locator('main').innerHTML(),
      originalURL = page.url();
    const requests = [],
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => requests.push(r.url()));
    await page.evaluate(() => {
      globalThis.siteActions = { click: 0, input: 0, change: 0, submit: 0 };
      for (const event of Object.keys(siteActions))
        document.querySelector('main').addEventListener(event, () => siteActions[event]++, true);
    });
    await preparePointerSession(page);
    const denied = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(denied, true, 'activeTab requires a toolbar gesture on each new tab');
    const target = (
      await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
    ).targetInfos.find((t) => t.type === 'tab' && t.url === originalURL);
    await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
    const popup = await context.newPage();
    await page.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const controls = {
      setPersonality: async (value) => popup.locator(`[data-personality="${value}"]`).click(),
      setFollow: async (value) => popup.locator('#follow-mouse').setChecked(value),
      summon: async () => popup.locator('#summon').click(),
      pause: async () => popup.locator('#pause').click(),
    };
    const result = await runPointerSession(page, controls, dir, `extension-${theme}`);
    assert.equal(await page.locator('main').innerHTML(), original, 'source DOM restores exactly');
    assert.equal(page.url(), originalURL);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
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
    evidence.sessions.push({ theme, ...result, exactRestore: true, requests, errors });
    await page.close();
    await fixtureVideo.saveAs(`${dir}/extension-${theme}-demo.webm`);
    fixturePage = null;
    fixtureVideo = null;
    await popup.close();
  }
  evidence.browser = context.browser().version();
  evidence.viewport = { width: 1440, height: 1000 };
  evidence.passed = true;
  console.log(
    'ACTUAL EXTENSION PASS: light/night exact hover preemption, responsive pointer hunts, three temperaments, bidirectional edge scrolling and immediate stops, persistent deep-scroll return, real activeTab/popup APIs, exact restore, protected inputs, no observed site actions/network/navigation.',
  );
} catch (error) {
  evidence.error = error.message;
  console.error(`ACTUAL EXTENSION CHECK BLOCKED/FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (fixturePage && !fixturePage.isClosed()) await fixturePage.close();
  if (fixtureVideo) await fixtureVideo.saveAs(`${dir}/extension-${currentTheme}-demo.webm`);
  await context?.close();
  await writeFile(`${dir}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
  await rm(profile, { recursive: true, force: true });
  server.close();
}
