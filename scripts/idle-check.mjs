/** Installed MV3 idle checks with controlled RNG choices. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { serve } from './serve.mjs';

const directory = 'artifacts/extension-evidence/idle';
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-idle-'));
const server = await serve(0),
  base = `http://127.0.0.1:${server.address().port}`;
const evidence = {
  base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contentSha256: createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex'),
  conditions:
    'Actual installed MV3 engine/renderer; synthetic idle.html at 1440×1000, DPR 1; toolbar grant and real popup APIs; followMouse on; real pointer held stationary inside the protected input at (144,260), with no movement during each 26s idle clip; seeds Curious 42, Feral/Dreamy 7 reset once before arrival ends. No clock/geometry manipulation. Read-only bounded diagnostics support assertions; screenshots and recordings are the visual evidence.',
  sessions: [],
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: `${directory}/raw`, size: { width: 1440, height: 1000 } },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  evidence.browser = context.browser().version();
  for (const p of context.pages()) await p.close();
  for (const personality of ['curious', 'feral', 'dreamy']) {
    const page = await context.newPage(),
      video = page.video(),
      openedAt = Date.now();
    let popup;
    const result = {
      personality,
      seed: personality === 'curious' ? 42 : 7,
      passed: false,
      actions: [],
    };
    evidence.sessions.push(result);
    try {
      await page.goto(`${base}/idle.html?autostart=off`);
      await page.mouse.move(-10, -10);
      const original = await page.locator('main').innerHTML(),
        url = page.url();
      const requests = [],
        errors = [];
      page.on('request', (r) => requests.push(r.url()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.evaluate(() => {
        globalThis.siteActions = 0;
        for (const event of ['click', 'input', 'change', 'submit'])
          document.querySelector('main').addEventListener(event, () => siteActions++, true);
      });
      await page.bringToFront();
      const tab = (
        await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
      ).targetInfos.find((t) => t.url === url);
      await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
      popup = await context.newPage();
      await page.bringToFront();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await popup.locator(`[data-personality="${personality}"]`).click();
      await popup.locator('#follow-mouse').check();
      await popup.locator('#summon').click();
      await page.waitForSelector('[data-cr4wler-root]');
      await page.bringToFront();
      const debug = await context.newCDPSession(page),
        worlds = [];
      debug.on('Runtime.executionContextCreated', (e) => worlds.push(e.context.id));
      await debug.send('Runtime.enable');
      let world;
      for (const contextId of worlds) {
        const r = await debug.send('Runtime.evaluate', {
          contextId,
          returnByValue: true,
          expression: '!!globalThis.__cr4wler',
        });
        if (r.result.value) world = contextId;
      }
      assert.ok(world, 'the installed engine lives in the extension isolated world');
      const inspect = async (expression) => {
        const response = await debug.send('Runtime.evaluate', {
          contextId: world,
          returnByValue: true,
          expression,
        });
        if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
        return response.result.value;
      };
      await inspect(`(() => {
        const e = __cr4wler, scheduler = e.spider.idleScheduler;
        scheduler.seed = ${result.seed}; scheduler.reset();
        globalThis.idleTrace = [];
        const frame = e.frame;
        e.frame = now => {
          const start = performance.now(); frame(now);
          if (e.spider && idleTrace.length < 4500) idleTrace.push({at:now,time:e.time,
            cost:performance.now()-start,mode:e.mode,count:e.fragments.length,pointer:e.pointerActive,
            rig:e.spider.diagnostics});
        };
      })()`);
      await page.mouse.move(144, 260);
      await page.waitForTimeout(3500);
      const clipAt = Date.now(),
        start = (clipAt - openedAt) / 1000;
      await page.screenshot({ path: `${directory}/${personality}-rest.png`, caret: 'initial' });
      const captured = new Set();
      while (Date.now() - clipAt < 26000) {
        const state = await inspect(
          '({idle:__cr4wler.spider.diagnostics.idle, pointer:__cr4wler.pointerActive,count:__cr4wler.fragments.length})',
        );
        assert.equal(
          state.pointer,
          true,
          'a real stationary pointer remains inside the protected input',
        );
        assert.equal(state.count, 0, 'idle does not destroy content');
        if (
          state.idle &&
          state.idle.elapsed / state.idle.duration > 0.4 &&
          !captured.has(state.idle.kind)
        ) {
          captured.add(state.idle.kind);
          result.actions.push({ kind: state.idle.kind, at: (Date.now() - clipAt) / 1000 });
          await page.screenshot({
            path: `${directory}/${personality}-${state.idle.kind}.png`,
            caret: 'initial',
          });
        }
        await page.waitForTimeout(55);
      }
      result.idleTrace = await inspect('idleTrace');
      assert.equal(await page.evaluate(() => scrollY), 0, 'idle never scrolls');
      assert.ok(
        result.idleTrace
          .filter((x) => x.time > 3)
          .every(
            (x) =>
              x.rig.finite &&
              x.rig.maxReach <= x.rig.reachLimit + 0.01 &&
              x.rig.maxBoneLength <= x.rig.boneLimit,
          ),
      );
      const active = result.idleTrace.filter((x) => x.rig.idle);
      assert.ok(active.length > 20);
      assert.ok(active.every((x) => x.rig.legs.filter((l) => l.phase === 'stance').length >= 7));
      const expected =
        personality === 'curious'
          ? ['groom', 'probe']
          : personality === 'feral'
            ? ['crouch', 'orient', 'reposition']
            : ['reposition', 'sway', 'tend'];
      assert.deepEqual(
        [...captured].sort(),
        expected.sort(),
        'pixels captured for each species gesture',
      );
      // Interrupt the next naturally scheduled gesture with a real page pointer.
      const deadline = Date.now() + 14000;
      while (!(await inspect('__cr4wler.spider.diagnostics.idle?.elapsed > 0.2'))) {
        assert.ok(Date.now() < deadline);
        await page.waitForTimeout(30);
      }
      const before = await inspect('__cr4wler.spider.diagnostics.idle');
      const aim = await page.locator('#target').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + 80, y: r.y + 14 };
      });
      await page.mouse.move(aim.x, aim.y);
      await page.waitForTimeout(55);
      assert.equal(await inspect('__cr4wler.spider.diagnostics.idle'), null);
      await page.screenshot({
        path: `${directory}/${personality}-interrupt.png`,
        caret: 'initial',
      });
      await page.waitForFunction(
        () => document.querySelector('[data-cr4wler-root]')?.dataset.phase === 'prepare',
        null,
        { polling: 'raf', timeout: 10000 },
      );
      await page.screenshot({
        path: `${directory}/${personality}-prepare-after-idle.png`,
        caret: 'initial',
      });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-cr4wler-root]')
            ?.shadowRoot.querySelector('.piece[data-phase="aftermath"]'),
        null,
        { timeout: 10000 },
      );
      result.interruption = {
        before,
        target: await inspect('__cr4wler.fragments[0].target.element.id'),
        count: await inspect('__cr4wler.fragments.length'),
      };
      assert.equal(result.interruption.target, 'target');
      assert.equal(result.interruption.count, 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      assert.equal(await page.locator('main').innerHTML(), original);
      assert.equal(await page.locator('#protected').inputValue(), 'Keep this value');
      assert.equal(await page.evaluate(() => siteActions), 0);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      assert.equal(page.url(), url);
      result.passed = true;
      result.clipDurationSeconds = 26;
      result.clipStartSeconds = start;
    } finally {
      await page.close();
      await popup?.close();
      const raw = `${directory}/${personality}-raw.webm`;
      await video.saveAs(raw);
      if (result.passed) {
        for (const [name, filter] of [
          ['normal', 'setpts=PTS-STARTPTS'],
          ['slow', 'setpts=3*(PTS-STARTPTS)'],
        ]) {
          execFileSync(
            'ffmpeg',
            [
              '-y',
              '-ss',
              String(result.clipStartSeconds),
              '-i',
              raw,
              '-t',
              String(name === 'slow' ? 78 : 26),
              '-vf',
              filter,
              '-an',
              '-c:v',
              'libvpx-vp9',
              '-cpu-used',
              '6',
              '-threads',
              '2',
              '-crf',
              '30',
              '-b:v',
              '0',
              `${directory}/${personality}-${name}.webm`,
            ],
            { stdio: 'ignore' },
          );
        }
        result.motion = {
          normal: `${personality}-normal.webm`,
          slow: `${personality}-slow.webm`,
          method:
            'Actual frames at original size; slow repeats captured frames at 3× duration without interpolation.',
        };
      }
    }
  }
  evidence.passed = evidence.sessions.every((s) => s.passed);
  console.log(
    JSON.stringify(
      {
        passed: evidence.passed,
        species: evidence.sessions.map((s) => ({ personality: s.personality, actions: s.actions })),
      },
      null,
      2,
    ),
  );
} finally {
  await writeFile(`${directory}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
