/** Item 6: real input, installed MV3, read-only recording instrumentation. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { serve } from './serve.mjs';

const directory = 'artifacts/item6/pursuit';
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-pursuit-'));
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const evidence = {
  base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contentSha256: createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex'),
  conditions:
    '1440×1000, DPR 1, headless Chromium, synthetic pointer.html; actual installed MV3 and real toolbar/popup APIs. Capture overhead present. Event receipt to completed canvas render, not hardware/photon latency.',
  slowPlayback: '3× duration by repeating captured pixels, no interpolation.',
  visibility:
    'Controlled visibility/blur lifecycle only. Native background visual behavior remains unverified.',
  sessions: [],
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    recordVideo: { dir: `${directory}/raw`, size: { width: 1440, height: 1000 } },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  evidence.browser = context.browser().version();
  for (const page of context.pages()) await page.close();
  for (const personality of ['curious', 'feral', 'dreamy']) {
    const page = await context.newPage(),
      video = page.video();
    const result = { personality, passed: false, screenshots: [] };
    evidence.sessions.push(result);
    let popup, debug;
    try {
      await page.goto(`${base}/pointer.html?autostart=off`);
      const original = await page.locator('main').innerHTML();
      const requests = [],
        errors = [];
      page.on('request', (r) => requests.push(r.url()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.evaluate(() => {
        globalThis.nativeClicks = 0;
        document.querySelector('#native-button').addEventListener('click', () => nativeClicks++);
        const ring = document.createElement('div');
        ring.dataset.cr4wlerIgnore = '';
        ring.style.cssText =
          'position:fixed;z-index:2147483646;pointer-events:none;width:18px;height:18px;border:2px solid #dd5c32;border-radius:50%;transform:translate(-50%,-50%)';
        document.body.append(ring);
        window.addEventListener('pointermove', (e) => {
          ring.style.left = e.clientX + 'px';
          ring.style.top = e.clientY + 'px';
        });
      });
      const tab = (
        await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
      ).targetInfos.find((t) => t.url === page.url());
      await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
      popup = await context.newPage();
      await page.bringToFront();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await popup.locator(`[data-personality="${personality}"]`).click();
      await popup.locator('#follow-mouse').check();
      await popup.locator('#summon').click();
      await page.bringToFront();
      await page.waitForSelector('[data-cr4wler-root]');
      debug = await context.newCDPSession(page);
      const worlds = [];
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
      assert.ok(world);
      const inspect = async (expression) => {
        const r = await debug.send('Runtime.evaluate', {
          contextId: world,
          returnByValue: true,
          expression,
        });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
      };
      await inspect(`(() => {
        globalThis.pursuitTrace=[];globalThis.pursuitInputs=[];globalThis.pursuitStage='arrival';
        let pending=null;window.addEventListener('pointermove',event=>{
          pending={at:performance.now(),x:event.clientX,y:event.clientY,stage:pursuitStage};
          pursuitInputs.push(pending);
        });
        const e=__cr4wler,frame=e.frame;
        e.frame=now=>{
          frame(now);if(!e.host)return;
          const attention=e.lastSpiderOptions?.attention;
          if(pending&&attention&&attention.x===pending.x&&attention.y===pending.y){pending.feedbackMs=performance.now()-pending.at;pending=null;}
          const rig=e.spider.diagnostics;
          pursuitTrace.push({at:performance.now(),stage:pursuitStage,mode:e.mode,
            candidate:e.candidate?.element.id,impact:e.current?.target.element.id,
            selector:e.lastSpiderOptions?.selector?.phase,body:e.spider.position,
            speed:e.pointerSpeed,edge:e.edgeDirection,edgeVelocity:e.edgeVelocity,
            scroll:scrollY,nested:document.querySelector('#nested').scrollTop,
            finite:rig.finite,reach:rig.maxReach/rig.reachLimit,bone:rig.maxBoneLength/rig.boneLimit});
        };
      })()`);
      const stage = async (name) => {
        await inspect(`globalThis.pursuitStage=${JSON.stringify(name)}`);
        await page.locator('header').evaluate((el, text) => {
          el.textContent = text;
        }, `${personality.toUpperCase()} · ${name} · real pointer ring / recording label`);
      };
      const shot = async (name) => {
        // Capture the current composited frame without Playwright's extra
        // screenshot stability waits consuming a short preparation/impact.
        const pixels = await debug.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
          fromSurface: true,
        });
        await writeFile(
          `${directory}/${personality}-${name}.png`,
          Buffer.from(pixels.data, 'base64'),
        );
        result.screenshots.push(`${personality}-${name}.png`);
      };
      const wait = async (expression) => {
        const deadline = Date.now() + 12000;
        while (!(await inspect(expression))) {
          assert.ok(Date.now() < deadline, `timeout: ${expression}`);
          await page.waitForTimeout(12);
        }
      };
      const aim = async (source, offset = 80) => {
        const r = await page.locator('#' + source).boundingBox();
        await page.mouse.move(r.x + offset, r.y + 14);
      };
      const restart = async () => {
        await page.keyboard.press('Escape');
        await popup.reload();
        await popup.locator('#summon').click();
        await page.bringToFront();
        await page.waitForTimeout(1600);
      };
      await page.waitForTimeout(1700);
      await stage('slow-tracking');
      const r = await page.locator('#track').boundingBox();
      for (let i = 0; i < 22; i++) {
        await page.mouse.move(r.x + 60 + i * 6, r.y + 14);
        await page.waitForTimeout(50);
      }
      await shot('slow-tracking');
      await restart();
      await stage('fast-sweeps-reversals');
      for (let i = 0; i < 16; i++) {
        await page.mouse.move(i % 2 ? 220 : 820, 404 + (i % 2) * 6);
        await page.waitForTimeout(35);
      }
      await shot('fast-reversal');
      assert.equal(await inspect('__cr4wler.fragments.length'), 0);
      await stage('exact-hover-and-jitter');
      await aim('target-a');
      const a = await page.locator('#target-a').boundingBox();
      for (let i = 0; i < 8; i++) {
        await page.mouse.move(a.x + 80 + (i % 2 ? 1 : -1), a.y + 14);
        await page.waitForTimeout(15);
      }
      await wait('__cr4wler.mode === "prepare"');
      await shot('exact-prepare');
      await wait('__cr4wler.mode === "strike"');
      await aim('target-b');
      await shot('committed-redirect');
      await wait('__cr4wler.candidate?.element.id === "target-b"');
      assert.equal(await inspect('__cr4wler.fragments[0].target.element.id'), 'target-a');
      await stage('pause-interruption');
      await page.locator('[data-cr4wler-root] .pause').focus();
      await wait('__cr4wler.mode === "prepare"');
      await page.keyboard.press('Enter');
      const frozen = await inspect('({phase:__cr4wler.phaseTime,mode:__cr4wler.mode})');
      await page.waitForTimeout(250);
      assert.deepEqual(await inspect('({phase:__cr4wler.phaseTime,mode:__cr4wler.mode})'), frozen);
      await shot('paused');
      await stage('paused-species-change');
      const alternate = personality === 'feral' ? 'dreamy' : 'feral';
      await popup.locator(`[data-personality="${alternate}"]`).click();
      await page.bringToFront();
      assert.equal(
        await inspect(
          '!!__cr4wler.lastSpiderOptions.selector || !!__cr4wler.lastSpiderOptions.grip || !!__cr4wler.candidate',
        ),
        false,
      );
      await shot('paused-species-change');
      await popup.locator(`[data-personality="${personality}"]`).click();
      await page.bringToFront();
      await restart();
      await stage('nested-edge');
      const n = await page.locator('#nested').boundingBox();
      await page.mouse.move(n.x + 300, n.y + n.height - 5);
      await page.waitForTimeout(1200);
      await shot('nested-edge');
      assert.ok((await page.locator('#nested').evaluate((el) => el.scrollTop)) > 50);
      assert.equal(await page.evaluate(() => scrollY), 0);
      await stage('manual-wheel-override');
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(350);
      const top = await page.locator('#nested').evaluate((el) => el.scrollTop);
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#nested').evaluate((el) => el.scrollTop), top);
      await shot('manual-override');
      await stage('nested-boundary');
      await page.locator('#nested').evaluate((el) => {
        el.scrollTop = el.scrollHeight - el.clientHeight - 5;
      });
      await page.waitForTimeout(950);
      await page.mouse.move(n.x + 300, n.y + 100);
      await page.mouse.move(n.x + 300, n.y + n.height - 5);
      await page.waitForTimeout(600);
      await shot('nested-boundary');
      assert.equal(await page.evaluate(() => scrollY), 0);
      await stage('native-controls');
      await page.locator('#native-button').click();
      await page.locator('#protected-input').fill('User edit survives Reset');
      assert.equal(await page.evaluate(() => nativeClicks), 1);
      await shot('native-controls');
      await page.locator('#native-link').click();
      assert.ok(page.url().endsWith('#destination'));
      await stage('document-edge');
      await page.waitForTimeout(1100);
      const before = await page.evaluate(() => scrollY);
      await page.mouse.move(1000, 500);
      await page.mouse.move(1000, 995);
      await page.waitForTimeout(1200);
      await shot('document-edge');
      assert.ok((await page.evaluate(() => scrollY)) > before + 50);
      await stage('PageDown-override');
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(600);
      const manual = await page.evaluate(() => scrollY);
      await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => scrollY), manual);
      await shot('PageDown-override');
      await stage('controlled-blur');
      await page.mouse.move(1000, 500);
      await page.mouse.move(1000, 995);
      await page.waitForTimeout(400);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.waitForTimeout(180);
      const blurred = await page.evaluate(() => scrollY);
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => scrollY), blurred);
      await shot('controlled-blur');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await shot('reduced-motion');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main').innerHTML(), original);
      assert.equal(await page.locator('#protected-input').inputValue(), 'User edit survives Reset');
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      result.trace = await inspect('pursuitTrace');
      result.inputs = await inspect('pursuitInputs');
      for (const f of result.trace) {
        assert.ok(f.finite);
        assert.ok(f.reach <= 1.001);
        assert.ok(f.bone <= 1.001);
      }
      const latencies = result.inputs
        .filter((i) => i.feedbackMs !== undefined)
        .map((i) => i.feedbackMs)
        .sort((a, b) => a - b);
      result.feedbackMs = {
        samples: latencies.length,
        p50: latencies[Math.floor(latencies.length * 0.5)],
        p95: latencies[Math.floor(latencies.length * 0.95)],
        max: latencies.at(-1),
      };
      result.passed = true;
    } catch (error) {
      result.error = error.message;
      await page.screenshot({ path: `${directory}/${personality}-failure.png` }).catch(() => {});
      throw error;
    } finally {
      await debug?.detach();
      await page.close();
      await popup?.close();
      await video.saveAs(`${directory}/${personality}-normal.webm`);
      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-i',
          `${directory}/${personality}-normal.webm`,
          '-vf',
          'setpts=3*PTS',
          '-r',
          '30',
          '-c:v',
          'libvpx-vp9',
          '-crf',
          '36',
          '-b:v',
          '0',
          '-deadline',
          'realtime',
          '-cpu-used',
          '8',
          '-threads',
          '2',
          `${directory}/${personality}-slow.webm`,
        ],
        { stdio: 'ignore' },
      );
    }
  }
} finally {
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(`${directory}/evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(
  JSON.stringify(
    evidence.sessions.map(({ personality, passed, feedbackMs }) => ({
      personality,
      passed,
      feedbackMs,
    })),
    null,
    2,
  ),
);
