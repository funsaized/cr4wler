/** Honest installation smoke test. Fails (does not silently skip) if browser policy blocks it. */
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-extension-'));
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
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('button', { name: 'Summon your spider' }).waitFor();
  console.log(
    `Unpacked extension loaded successfully: ${id}. Popup rendered. Toolbar/activeTab still require the manual checklist in docs/TESTING.md.`,
  );
} catch (e) {
  console.error(`ACTUAL EXTENSION LOAD BLOCKED/FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
