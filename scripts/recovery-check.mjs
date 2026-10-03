/** Headed installed MV3 scroll recovery checks. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { serve } from './serve.mjs';

const directory = 'artifacts/extension-evidence/recovery';
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-recovery-'));
const server = await serve(0),
  base = `http://127.0.0.1:${server.address().port}`;
const evidence = {
  base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contentSha256: createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex'),
  conditions:
    'Actual installed MV3, production engine and Canvas renderer; pointer.html synthetic fixture, 1440×1000/DPR 1, headed Chromium on Xvfb. Real wheel, keyboard, scrollbar and pointer events. No replacement clocks or geometry. Diagnostic traces are assertions, screenshots/WebM are pixel evidence. Separate stage screenshots use the real engine Pause to freeze a stage; continuous motion clips never pause.',
  slowPlayback: '3× duration from actual captured frames, no interpolation.',
  visibility:
    'Controlled visibility lifecycle only; native background visual proof remains unverified.',
  sessions: [],
};
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: `${directory}/raw`, size: { width: 1440, height: 1000 } },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  evidence.browser = context.browser().version();
  // Keep the initial blank tab alive: headed Chromium exits with its last tab.

  for (const personality of ['curious', 'feral', 'dreamy']) {
    const page = await context.newPage(),
      video = page.video(),
      openedAt = Date.now();
    const result = { personality, passed: false, screenshots: [], checks: [] };
    evidence.sessions.push(result);
    let popup;
    try {
      await page.goto(`${base}/pointer.html?autostart=off`);
      const original = await page.locator('main').innerHTML(),
        url = page.url(),
        requests = [],
        errors = [];
      page.on('request', (r) => requests.push(r.url()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.evaluate(() => {
        globalThis.siteActions = 0;
        for (const event of ['click', 'input', 'change', 'submit'])
          document.querySelector('main').addEventListener(event, () => siteActions++, true);
        const label = document.createElement('div');
        label.id = 'capture-label';
        label.dataset.cr4wlerIgnore = '';
        label.style.cssText =
          'position:fixed;top:55px;left:64px;color:#344842;font:14px system-ui;pointer-events:none';
        document.body.append(label);
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
      assert.ok(world);
      const inspect = async (expression) => {
        const r = await debug.send('Runtime.evaluate', {
          contextId: world,
          returnByValue: true,
          expression,
        });
        if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
      };
      await inspect(`(() => {
        globalThis.recoveryTrace=[];globalThis.recoveryStage='arrival';globalThis.freezePhase=null;
        globalThis.recoveryInputs=[];let pending=null;
        window.addEventListener('pointermove',e=>{pending={at:performance.now(),x:e.clientX,y:e.clientY};recoveryInputs.push(pending);});
        const e=__cr4wler,frame=e.frame;
        e.frame=now=>{
          frame(now);if(!e.spider)return;
          const rig=e.spider.diagnostics;
          const attention=e.lastSpiderOptions?.attention;
          if(pending&&attention&&pending.x===attention.x&&pending.y===attention.y){pending.feedbackMs=performance.now()-pending.at;pending=null;}
          recoveryTrace.push({at:performance.now(),stage:recoveryStage,mode:e.mode,rig,edge:e.edgeDirection,scroll:scrollY,nested:document.querySelector('#nested').scrollTop,grip:!!e.lastSpiderOptions?.grip,selector:e.lastSpiderOptions?.selector?.phase});
          document.querySelector('#capture-label').textContent='${personality} · '+recoveryStage+' · '+rig.recovery;
          if(freezePhase&&rig.reason==='scroll'&&rig.recovery===freezePhase){const r=e.spider.recovery;const ready=freezePhase==='anticipate'?r.elapsed>=r.anticipation*0.2:freezePhase==='flight'?r.elapsed>=r.anticipation+r.flight*('${personality}'==='feral'?0.5:0.78):r.elapsed>=r.anticipation+r.flight+r.landing*0.45;if(ready){freezePhase=null;e.pause();}}
        };
      })()`);
      await page.mouse.move(1320, 480);
      await page.waitForTimeout(2000);
      const startRecoveries = await inspect('__cr4wler.spider.diagnostics.recoveries');
      result.clipStartSeconds = (Date.now() - openedAt) / 1000;
      await inspect("recoveryStage='wheel burst and reversal'");
      for (let i = 0; i < 14; i++) {
        // Reverse early enough to catch Feral's short flight, then keep scrolling.
        await page.mouse.wheel(0, i < 2 ? 330 : i < 5 ? -180 : i < 9 ? 330 : -310);
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(900);
      assert.equal(await inspect('__cr4wler.spider.diagnostics.recoveries'), startRecoveries + 1);
      assert.equal(await inspect('__cr4wler.spider.recovering'), false);
      await inspect("recoveryStage='next pointer input'");
      const aim = await page.locator('#target-b').boundingBox();
      await page.mouse.move(aim.x + 80, aim.y + 14);
      const pointerDeadline = Date.now() + 1800;
      while (
        !(await inspect(
          "__cr4wler.candidate?.element.id === 'target-b' || __cr4wler.current?.target.element.id === 'target-b' || __cr4wler.fragments.some(r=>r.target.element.id==='target-b')",
        ))
      ) {
        assert.ok(
          Date.now() < pointerDeadline,
          JSON.stringify(
            await inspect(
              '({mode:__cr4wler.mode,pointer:__cr4wler.pointer,pointerActive:__cr4wler.pointerActive,safe:__cr4wler.pointerSafe,hover:__cr4wler.hover?.target.element.id,candidate:__cr4wler.candidate?.element.id,current:__cr4wler.current?.target.element.id,now:performance.now(),manualUntil:__cr4wler.manualUntil,scroll:scrollY,inputs:recoveryInputs})',
            ),
          ),
        );
        await page.waitForTimeout(20);
      }
      await page.waitForTimeout(700);
      result.clipDurationSeconds = (Date.now() - openedAt) / 1000 - result.clipStartSeconds;
      result.checks.push('one bounded wheel/reversal entrance, then next real pointer hunt');
      await page.mouse.move(1320, 480);
      await page.waitForTimeout(900);
      // Frozen screenshots come from a second real navigation entrance, outside the continuous clip.
      for (const phase of ['anticipate', 'flight', 'land']) {
        await page.mouse.move(1320, 480);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(1100);
        await inspect(`recoveryStage='stage pixel ${phase}';freezePhase='${phase}'`);
        await page.mouse.wheel(0, 600);
        const deadline = Date.now() + 3000;
        while (!(await inspect('__cr4wler.paused'))) {
          assert.ok(Date.now() < deadline, `pause ${phase}`);
          await page.waitForTimeout(10);
        }
        const frozen = await inspect(
          '({elapsed:__cr4wler.spider.diagnostics.recoveryElapsed,body:__cr4wler.spider.position,feet:__cr4wler.spider.feet,thread:__cr4wler.spider.diagnostics.thread})',
        );
        const path = `${directory}/${personality}-${phase}.png`;
        await page.screenshot({ path, caret: 'initial' });
        result.screenshots.push(path);
        await page.waitForTimeout(120);
        assert.deepEqual(
          await inspect(
            '({elapsed:__cr4wler.spider.diagnostics.recoveryElapsed,body:__cr4wler.spider.position,feet:__cr4wler.spider.feet,thread:__cr4wler.spider.diagnostics.thread})',
          ),
          frozen,
        );
        await inspect('__cr4wler.pause()');
        await page.waitForTimeout(1100);
      }
      result.checks.push('real Pause/Resume in all three stages, actual stage pixels');
      await inspect("recoveryStage='PageDown'");
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1100);
      assert.equal(await inspect('__cr4wler.edgeDirection'), 0);
      // Native scrollbar thumb drag: no scrollTo substitute for this check.
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(1100);
      await inspect("recoveryStage='native scrollbar drag'");
      const beforeDrag = await page.evaluate(() => scrollY);
      await page.mouse.move(1433, 70);
      await page.mouse.down();
      await page.mouse.move(1433, 420, { steps: 9 });
      await page.mouse.up();
      await page.waitForTimeout(1100);
      const afterDrag = await page.evaluate(() => scrollY);
      assert.ok(afterDrag > beforeDrag + 500, 'actual scrollbar drag must move the document');
      const dragStop = afterDrag;
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => scrollY), dragStop);
      result.checks.push('PageDown and actual native scrollbar drag yield navigation ownership');
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(1100);
      await page.locator('#nested').evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.waitForTimeout(200);
      await inspect("recoveryStage='nested wheel'");
      const nested = await page.locator('#nested').boundingBox();
      await page.mouse.move(nested.x + 200, nested.y + 90);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(1000);
      assert.ok((await page.locator('#nested').evaluate((el) => el.scrollTop)) > 0);
      assert.equal(await page.evaluate(() => scrollY), 0);
      await page.setViewportSize({ width: 1200, height: 850 });
      await page.waitForTimeout(300);
      await debug.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.2 });
      await page.waitForTimeout(300);
      await debug.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.waitForTimeout(300);
      result.checks.push(
        'nested wheel, resize and CDP page-scale zoom; native UI zoom not demonstrated',
      );
      await inspect(
        "recoveryStage='controlled background';Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))",
      );
      const time = await inspect('__cr4wler.time');
      await page.waitForTimeout(120);
      assert.equal(await inspect('__cr4wler.time'), time);
      await inspect("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(200);
      assert.equal(await inspect('__cr4wler.spider.recovering'), false);
      assert.equal(await inspect('__cr4wler.spider.diagnostics.thread'), 0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForTimeout(300);
      result.trace = await inspect('recoveryTrace');
      result.inputs = await inspect('recoveryInputs');
      const burst = result.trace.filter((x) => x.stage === 'wheel burst and reversal');
      const moving = burst
        .slice(1)
        .flatMap((x, i) =>
          x.scroll !== burst[i].scroll && x.rig.reason === 'scroll'
            ? [Math.sign(x.scroll - burst[i].scroll)]
            : [],
        );
      assert.ok(
        moving.includes(1) && moving.includes(-1),
        'actual reversal occurs during recovery',
      );
      const active = result.trace.filter((x) => x.rig.reason === 'scroll');
      assert.ok(active.length > 15);
      assert.ok(active.every((x) => !x.grip && !x.selector && x.edge === 0));
      assert.ok(
        result.trace.every(
          (x) =>
            x.rig.finite &&
            x.rig.maxReach <= x.rig.reachLimit + 0.01 &&
            x.rig.maxBoneLength <= x.rig.boneLimit + 0.01,
        ),
      );
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      assert.equal(await page.locator('main').innerHTML(), original);
      assert.equal(
        await page.locator('#protected-input').inputValue(),
        'Native editing stays available',
      );
      assert.equal(await page.evaluate(() => siteActions), 0);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      assert.equal(page.url(), url);
      result.passed = true;
    } finally {
      await page.close();
      await popup?.close();
      const raw = `${directory}/${personality}-raw.webm`;
      await video.saveAs(raw);
      if (result.clipDurationSeconds)
        for (const [name, factor] of [
          ['normal', 1],
          ['slow', 3],
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
              String(result.clipDurationSeconds * factor),
              '-vf',
              `setpts=${factor}*(PTS-STARTPTS)`,
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
    }
  }
  evidence.passed = evidence.sessions.every((s) => s.passed);
  console.log(
    JSON.stringify(
      {
        passed: evidence.passed,
        sessions: evidence.sessions.map((s) => ({
          personality: s.personality,
          passed: s.passed,
          checks: s.checks,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await writeFile(`${directory}/evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
