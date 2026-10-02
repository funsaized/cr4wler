/** Real MV3 integration. Never modifies policy or adds permissions to the manifest. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serve } from './serve.mjs';
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-extension-'));
const server = await serve();
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173');
  const original = await page.locator('main').innerHTML();
  const originalURL = page.url();
  const requests = [];
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
  const target = (await cdp.send('Target.getTargets')).targetInfos.find(
    (t) => t.type === 'page' && t.url === originalURL,
  );
  await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
  console.log('Real toolbar action triggered; activeTab granted to fixture.');
  // The real popup is rendered, and actual Chrome scripting/messaging execute the
  // same content controller. No fake chrome object or host permission is added.
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('button', { name: 'Summon your spider' }).waitFor();
  await popup.locator('#summon').click();
  await page.waitForSelector('[data-cr4wler-root]');
  await page.waitForFunction(
    () => document.querySelector('[data-cr4wler-root]')?.shadowRoot?.querySelector('.piece'),
    {},
    { timeout: 12000 },
  );
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('main').innerHTML(), original);
  await popup.locator('#pause').click();
  const frozen = await page.locator('[data-cr4wler-root] .pieces').evaluate((el) => el.innerHTML);
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator('[data-cr4wler-root] .pieces').evaluate((el) => el.innerHTML),
    frozen,
  );
  await popup.locator('#pause').click();
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
  console.log(
    'ACTUAL EXTENSION PASS: load, denied-before-gesture, toolbar grant, popup Summon/Pause/Resume, real isolated-world grabs, Escape, exact DOM restore, unchanged forms, zero page requests/navigation/actions.',
  );
} catch (error) {
  console.error(`ACTUAL EXTENSION CHECK BLOCKED/FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  server.close();
}
