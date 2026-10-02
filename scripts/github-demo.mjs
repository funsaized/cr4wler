/** Native Chromium window capture: actual public GitHub page and installed extension. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { preparePointerSession } from './pointer-session.mjs';

const url = 'https://github.com/funsaized/cr4wler';
const dir = 'artifacts/github-demo';
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-github-'));
await mkdir(dir, { recursive: true });
const evidence = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtimeSourceTree: execFileSync('git', ['rev-parse', 'HEAD:src'], { encoding: 'utf8' }).trim(),
  surface: 'Actual installed MV3 extension on its real public GitHub repository',
  url,
  freshSignedOutProfile: true,
  window: { width: 1440, height: 1080 },
  capture: {
    method: 'FFmpeg x11grab of the actual headed Chromium window',
    requestedFps: 30,
    codec: 'Lossless RGB H.264 (CRF 0)',
    includesNativeTabsAndAddressBar: true,
  },
  passed: false,
  timeline: [],
  hoverTargets: [],
};
let context, page, popup, recorder, recordingDone, started;
async function startWindowRecording() {
  assert.ok(process.env.DISPLAY, 'A real X11 display is required for native-window capture');
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-f',
    'x11grab',
    '-framerate',
    '30',
    '-video_size',
    '1440x1080',
    '-draw_mouse',
    '0',
    '-i',
    process.env.DISPLAY,
    '-c:v',
    'libx264rgb',
    '-preset',
    'fast',
    '-tune',
    'zerolatency',
    '-crf',
    '0',
    '-threads',
    '2',
    '-pix_fmt',
    'rgb24',
    '-fps_mode',
    'passthrough',
    '-progress',
    'pipe:1',
    `${dir}/window-source.mkv`,
  ];
  recorder = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '',
    readyResolve,
    readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  recorder.stderr.on('data', (data) => {
    diagnostics += data;
  });
  recorder.stdout.on('data', (data) => {
    const time = data.toString().match(/out_time_us=(\d+)/);
    if (time && started === undefined) {
      started = Date.now() - Number(time[1]) / 1000;
      readyResolve();
    }
  });
  recordingDone = new Promise((resolve, reject) => {
    recorder.on('error', (error) => {
      readyReject(error);
      reject(error);
    });
    recorder.on('exit', (code) => {
      if (code === 0) resolve();
      else {
        const error = new Error(`Window recorder exited ${code}: ${diagnostics}`);
        readyReject(error);
        reject(error);
      }
    });
  });
  recordingDone.catch(() => {});
  await Promise.race([
    ready,
    new Promise((_, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Window recorder did not produce a frame')),
        15000,
      );
      timeout.unref();
    }),
  ]);
  evidence.capture.command = args;
}
async function stopWindowRecording() {
  if (!recorder) return;
  recorder.stdin.write('q\n');
  await recordingDone;
  recorder = null;
}

async function mark(stage) {
  evidence.timeline.push({ stage, atSeconds: (Date.now() - started) / 1000 });
}
async function move(x, y, duration = 450) {
  const from = await page.evaluate(() => {
    const marker = document.querySelector('#recording-pointer');
    return { x: parseFloat(marker.style.left), y: parseFloat(marker.style.top) };
  });
  const steps = Math.ceil(duration / 35);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps);
    await page.waitForTimeout(duration / steps);
  }
}
async function feedVisibleWord() {
  const chosen = await page.evaluate(() => {
    const article = document.querySelector('article.markdown-body');
    const masks = [...CSS.highlights]
      .filter(([name]) => name.startsWith('cr4wler-') && !name.endsWith('-selection'))
      .flatMap(([, ranges]) => [...ranges]);
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    const candidates = [];
    for (let node, count = 0; count < 1200 && (node = walker.nextNode()); count++) {
      const element = node.parentElement;
      if (node.length < 8 || node.length > 12000 || !node.textContent.trim()) continue;
      if (
        element.closest(
          'button,form,input,textarea,select,[role="button"],[aria-hidden="true"],[data-cr4wler-ignore]',
        )
      )
        continue;
      if (masks.some((range) => range.startContainer === node)) continue;
      const start = node.textContent.search(/\S/);
      const character = document.createRange();
      character.setStart(node, start);
      character.setEnd(node, start + 1);
      const rect = character.getBoundingClientRect();
      if (rect.width < 2 || rect.top < 105 || rect.bottom > 810) continue;
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!element.contains(hit)) continue;
      const priority = element.matches('h2,h3') ? 0 : element.matches('p,li,strong') ? 1 : 2;
      candidates.push({ node, x, y, priority, text: node.textContent.slice(0, 80) });
      if (candidates.length >= 80) break;
    }
    candidates.sort((a, b) => a.priority - b.priority || Math.abs(a.y - 370) - Math.abs(b.y - 370));
    const candidate = candidates[0];
    if (!candidate) return null;
    globalThis.githubDemoTargets ??= [];
    const index = githubDemoTargets.push(candidate.node) - 1;
    return { index, x: candidate.x, y: candidate.y, text: candidate.text };
  });
  assert.ok(chosen, 'real visible unmodified repository text must be available');
  await mark(`curious-hover-${chosen.index + 1}`);
  await move(chosen.x, chosen.y, 650);
  await page.waitForFunction(
    (index) =>
      [...CSS.highlights].some(
        ([name, ranges]) =>
          name.startsWith('cr4wler-') &&
          !name.endsWith('-selection') &&
          [...ranges].some((range) => range.startContainer === githubDemoTargets[index]),
      ),
    chosen.index,
    { timeout: 12000 },
  );
  evidence.hoverTargets.push(chosen);
  await page.waitForTimeout(1300);
}

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    viewport: null,
    colorScheme: 'dark',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--enable-unsafe-extension-debugging',
      '--window-position=0,0',
      '--window-size=1440,1080',
    ],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  page = context.pages()[0];
  const pageCdp = await context.newCDPSession(page);
  const { windowId } = await pageCdp.send('Browser.getWindowForTarget');
  await pageCdp.send('Browser.setWindowBounds', {
    windowId,
    bounds: { left: 0, top: 0, width: 1440, height: 1080, windowState: 'normal' },
  });
  evidence.nativeWindowBounds = (
    await pageCdp.send('Browser.getWindowBounds', { windowId })
  ).bounds;
  evidence.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(evidence.viewport.width >= 1380 && evidence.viewport.width <= 1440);
  assert.ok(
    evidence.viewport.height < 1080 && evidence.viewport.height > 850,
    'Native browser chrome must occupy visible space',
  );
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.ok(response.ok(), `actual GitHub page HTTP ${response.status()}`);
  await page.waitForSelector('article.markdown-body');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  assert.equal(
    await page.evaluate(() => document.body.classList.contains('logged-out')),
    true,
    'fresh signed-out GitHub page only',
  );
  evidence.theme = await page.evaluate(() => ({
    colorMode: document.documentElement.dataset.colorMode,
    darkTheme: document.documentElement.dataset.darkTheme,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  const rgb = evidence.theme.background.match(/\d+/g).slice(0, 3).map(Number);
  assert.ok(
    evidence.theme.prefersDark && rgb.reduce((sum, value) => sum + value, 0) / 3 < 80,
    'GitHub must genuinely render in dark mode',
  );
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('article.markdown-body h2')].find(
      (node) => node.textContent.trim() === 'What makes it move',
    );
    if (!heading) throw Error('Expected actual repository README heading missing');
    scrollTo(0, heading.getBoundingClientRect().top + scrollY - 180);
  });
  await page.waitForTimeout(900);
  const originalArticle = await page.locator('article.markdown-body').innerHTML();
  evidence.startScrollY = await page.evaluate(() => scrollY);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    globalThis.githubDemoActions = { click: 0, input: 0, change: 0, submit: 0 };
    for (const type of Object.keys(githubDemoActions))
      document.addEventListener(type, () => githubDemoActions[type]++, true);
    globalThis.githubDemoMaxVisitors = 0;
    globalThis.githubDemoHosts = new Set();
    globalThis.githubDemoPersonalities = new Set();
    function sample() {
      const hosts = document.querySelectorAll('[data-cr4wler-root]');
      githubDemoMaxVisitors = Math.max(githubDemoMaxVisitors, hosts.length);
      for (const host of hosts) {
        githubDemoHosts.add(host);
        if (host.dataset.personality) githubDemoPersonalities.add(host.dataset.personality);
      }
      requestAnimationFrame(sample);
    }
    sample();
  });
  await preparePointerSession(page, { surface: 'github.com/funsaized/cr4wler · actual extension' });
  await page.locator('#recording-pointer').evaluate((marker) => {
    marker.style.width = marker.style.height = '20px';
    marker.style.borderWidth = '3px';
  });
  const tab = (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.find(
    (target) => target.type === 'tab' && target.url === url,
  );
  await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('[data-personality="feral"]').click();
  await popup.locator('#follow-mouse').setChecked(false);
  await popup.locator('#intensity').evaluate((input) => {
    input.value = '100';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.mouse.move(500, 440);
  await startWindowRecording();
  evidence.clipStartSeconds = (Date.now() - started) / 1000;
  await mark('summon-feral-max');
  await popup.locator('#summon').click();
  await page.bringToFront();
  await page.waitForSelector('[data-cr4wler-root]');
  await page.waitForFunction(
    () => document.querySelector('[data-cr4wler-root]').dataset.personality === 'feral',
  );
  await page.waitForFunction(
    () =>
      [...CSS.highlights.keys()].some(
        (name) => name.startsWith('cr4wler-') && !name.endsWith('-selection'),
      ),
    null,
    { timeout: 12000 },
  );
  await page.waitForTimeout(1700);
  await mark('feral-manual-scroll');
  const wheelStart = await page.evaluate(() => scrollY);
  for (const delta of [300, 260, 340, 220, 260]) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(1150);
  }
  evidence.manualScroll = { initial: wheelStart, after: await page.evaluate(() => scrollY) };
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}/feral.png`, caret: 'initial' });
  await mark('switch-curious-follow-on');
  await popup.locator('[data-personality="curious"]').click();
  await popup.locator('#follow-mouse').setChecked(true);
  await page.bringToFront();
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-cr4wler-root]');
    return host.dataset.personality === 'curious' && host.dataset.followMouse === 'true';
  });
  await feedVisibleWord();
  await feedVisibleWord();
  const edgeInitial = await page.evaluate(() => scrollY);
  await mark('curious-pointer-bottom-edge');
  await move(420, evidence.viewport.height - 5, 700);
  await page.waitForTimeout(2700);
  const edgeAdvanced = await page.evaluate(() => scrollY);
  assert.ok(edgeAdvanced > edgeInitial + 150, 'actual edge pointer must scroll GitHub');
  await move(420, 470, 550);
  await page.waitForTimeout(180);
  const edgeStopped = await page.evaluate(() => scrollY);
  await page.waitForTimeout(400);
  assert.ok(
    Math.abs((await page.evaluate(() => scrollY)) - edgeStopped) < 3,
    'inward pointer must stop scrolling',
  );
  await feedVisibleWord();
  await page.screenshot({ path: `${dir}/curious.png`, caret: 'initial' });
  await mark('curious-pointer-top-edge');
  await page.evaluate((y) => (globalThis.githubDemoReturnY = y), edgeInitial);
  await move(580, 5, 700);
  await page.waitForFunction(() => scrollY <= githubDemoReturnY + 45, null, { timeout: 6000 });
  await move(420, 480, 550);
  await page.waitForTimeout(1800);
  await mark('persistent-aftermath-returned');
  evidence.clipEndSeconds = (Date.now() - started) / 1000;
  await page.screenshot({ path: `${dir}/aftermath.png`, caret: 'initial' });
  const audit = await page.evaluate(() => pointerAudit);
  const hostAudit = await page.evaluate(() => ({
    maxVisitorCount: githubDemoMaxVisitors,
    uniqueVisitorHosts: githubDemoHosts.size,
    personalities: [...githubDemoPersonalities],
  }));
  assert.equal(hostAudit.maxVisitorCount, 1);
  assert.equal(hostAudit.uniqueVisitorHosts, 1);
  assert.deepEqual(hostAudit.personalities, ['feral', 'curious']);
  assert.deepEqual(audit.rig.types, ['jumping spider', 'widow']);
  assert.ok(
    audit.rig.finite && audit.rig.maxReachRatio <= 1.001 && audit.rig.maxBoneRatio <= 1.001,
  );
  assert.ok(evidence.manualScroll.after > evidence.manualScroll.initial + 1000);
  evidence.pointerScroll = {
    initial: edgeInitial,
    advanced: edgeAdvanced,
    stopped: edgeStopped,
    returned: await page.evaluate(() => scrollY),
  };
  await page.waitForTimeout(1200);
  await stopWindowRecording();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
  assert.equal(
    await page.locator('article.markdown-body').innerHTML(),
    originalArticle,
    'repository source DOM must restore exactly',
  );
  assert.equal(page.url(), url);
  const actions = await page.evaluate(() => githubDemoActions);
  assert.deepEqual(actions, { click: 0, input: 0, change: 0, submit: 0 });
  Object.assign(evidence, {
    passed: true,
    browser: context.browser().version(),
    hostAudit,
    rig: audit.rig,
    phases: audit.phases,
    effects: audit.effects,
    siteActions: actions,
    exactRestore: true,
    errors,
    framePacing: {
      samples: audit.frames.length,
      medianMs: [...audit.frames].sort((a, b) => a - b)[Math.floor(audit.frames.length / 2)],
      p95Ms: [...audit.frames].sort((a, b) => a - b)[Math.floor(audit.frames.length * 0.95)],
      longTasks: audit.longTasks,
    },
  });
  console.log(
    'GITHUB DEMO PASS: actual public signed-out dark repository, one instance, Feral max, Curious follow, real text grabs and pointer-only edge scrolling, exact restore and no site actions.',
  );
} catch (error) {
  evidence.error = error.message;
  console.error('GITHUB DEMO FAILED: ' + error.message);
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failed.png`, caret: 'initial' }).catch(() => {});
} finally {
  await stopWindowRecording().catch((error) => {
    evidence.recordingError = error.message;
    process.exitCode = 1;
  });
  await page?.close();
  await popup?.close();
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(`${dir}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log('GITHUB DEMO EVIDENCE ' + JSON.stringify(evidence));
}
