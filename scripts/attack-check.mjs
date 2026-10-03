/** Focused item-4 pixels from the unmodified installed MV3 content bundle. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { serve } from './serve.mjs';

const directory = 'artifacts/item4/attack';
await mkdir(directory, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'cr4wler-attack-'));
const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const evidence = {
  base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  contentSha256: createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex'),
  surface:
    'Actual installed MV3 content bundle; real toolbar gesture and popup APIs; synthetic sources',
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
  for (const page of context.pages()) await page.close();
  for (const personality of ['curious', 'feral', 'dreamy']) {
    const page = await context.newPage(),
      video = page.video();
    let popup;
    const result = { personality, passed: false };
    evidence.sessions.push(result);
    try {
      await page.goto(`${base}/anticipation.html?autostart=off`);
      const original = await page.locator('main').innerHTML(),
        url = page.url();
      const requests = [],
        errors = [];
      page.on('request', (r) => requests.push(r.url()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.evaluate((personality) => {
        globalThis.siteActions = 0;
        for (const event of ['click', 'input', 'change', 'submit'])
          document.querySelector('main').addEventListener(event, () => siteActions++, true);
        const label = document.querySelector('header');
        const labelFrame = () => {
          const text = `${personality.toUpperCase()} · ${document.querySelector('[data-cr4wler-root]')?.dataset.phase ?? 'reset'} · actual installed extension`;
          if (label.textContent !== text) label.textContent = text;
          requestAnimationFrame(labelFrame);
        };
        requestAnimationFrame(labelFrame);
      }, personality);
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
      assert.ok(world, 'the actual content engine lives in the extension isolated world');
      const inspect = async (expression) => {
        const response = await debug.send('Runtime.evaluate', {
          contextId: world,
          returnByValue: true,
          expression,
        });
        if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
        return response.result.value;
      };
      // Read-only recording instrumentation; no hunt clock, geometry or source is changed.
      await inspect(`(() => {
        globalThis.attackTrace = [];
        const e = __cr4wler;
        const target = t => t && ({ id:t.element.id,text:t.text,start:t.range.startOffset,end:t.range.endOffset,rect:t.rect.toJSON() });
        function sample(at) {
          if(!e.host) { requestAnimationFrame(sample); return; }
          attackTrace.push({at,mode:e.mode,candidate:target(e.candidate),impact:target(e.current?.target),
            selector:JSON.parse(JSON.stringify(e.lastSpiderOptions?.selector ?? null)),
            count:e.fragments.length,settling:e.settling?.settleProgress,rig:e.spider.diagnostics});
          if(attackTrace.length<4000)requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      })()`);
      const aim = async (source) => {
        const p = await page.locator('#' + source).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + 80, y: r.y + 14 };
        });
        await page.mouse.move(p.x, p.y);
      };
      const phase = async (name) =>
        page.waitForFunction(
          (name) => document.querySelector('[data-cr4wler-root]')?.dataset.phase === name,
          name,
          { polling: 'raf', timeout: 12000 },
        );
      const shot = async (stage) => {
        await page.screenshot({
          path: `${directory}/${personality}-${stage}.png`,
          caret: 'initial',
        });
      };
      await page.waitForTimeout(1500);
      const clipStart = Date.now();
      await aim('target-a');
      await phase('prepare');
      await shot('prepare');
      await phase('strike');
      // Capture visible displacement, after the initial commitment frame.
      const impactDeadline = Date.now() + 2000;
      while ((await inspect('__cr4wler.current?.progress ?? 1')) < 0.65) {
        assert.ok(Date.now() < impactDeadline, 'impact must advance');
        await page.waitForTimeout(8);
      }
      await shot('impact');
      await page.waitForFunction(() =>
        document
          .querySelector('[data-cr4wler-root]')
          ?.shadowRoot.querySelector('.piece[data-phase="aftermath"]'),
      );
      await phase('aftermath');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      await shot('aftermath');
      result.firstHunt = await inspect('attackTrace.filter(x=>x.count<=1)');
      const lock = result.firstHunt.find((x) => x.mode === 'lock'),
        impact = result.firstHunt.find((x) => x.mode === 'strike');
      assert.equal(lock.candidate.text, impact.impact.text);
      assert.deepEqual(lock.candidate.rect, impact.impact.rect);
      assert.ok(result.firstHunt.some((x) => x.mode === 'prepare'));
      assert.ok(result.firstHunt.some((x) => x.mode === 'settle'));
      await page.keyboard.press('Escape');
      await popup.reload();
      await popup.locator('#summon').click();
      await page.bringToFront();
      await page.waitForTimeout(1500);
      await aim('target-b');
      await phase('prepare');
      await aim('target-a');
      await phase('strike');
      assert.equal(await inspect('__cr4wler.current.target.element.id'), 'target-a');
      assert.equal(await inspect('__cr4wler.fragments.length'), 1);
      await aim('target-b');
      const redirect = await inspect(
        '({current:__cr4wler.current?.target.element.id,selector:__cr4wler.lastSpiderOptions.selector?.phase})',
      );
      assert.equal(redirect.current, 'target-a');
      assert.equal(redirect.selector, 'strike');
      await shot('committed-redirect');
      // Focus before the short Feral preparation window. Real keyboard activation
      // of the dock avoids waiting for pointer-click stability past its 90ms clock.
      await page.locator('[data-cr4wler-root] .pause').focus();
      await phase('prepare');
      assert.equal(await inspect('__cr4wler.candidate.element.id'), 'target-b');
      await page.keyboard.press('Enter');
      const frozen = await inspect(
        '({mode:__cr4wler.mode,time:__cr4wler.phaseTime,candidate:__cr4wler.candidate.text})',
      );
      await page.waitForTimeout(350);
      assert.deepEqual(
        await inspect(
          '({mode:__cr4wler.mode,time:__cr4wler.phaseTime,candidate:__cr4wler.candidate.text})',
        ),
        frozen,
      );
      await shot('paused');
      await page.locator('[data-cr4wler-root] .pause').click();
      await page.evaluate(() => (document.querySelector('#nested').scrollTop = 90));
      await page.waitForTimeout(80);
      assert.equal(await inspect('!!__cr4wler.candidate'), false);
      await shot('nested-scroll');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main').innerHTML(), original);
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      assert.equal(page.url(), url);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => siteActions), 0);
      result.interruptions = {
        uncommittedReplacement: true,
        committedImpactThenLatest: true,
        pauseFrozen: true,
        nestedScrollCancel: true,
        resetExact: true,
      };
      result.clipDurationSeconds = (Date.now() - clipStart) / 1000;
      result.passed = true;
      await debug.detach();
    } catch (error) {
      result.error = error.message;
      await page.screenshot({ path: `${directory}/${personality}-failure.png` }).catch(() => {});
      throw error;
    } finally {
      await page.close();
      await popup?.close();
      const raw = `${directory}/${personality}-raw.webm`,
        normal = `${directory}/${personality}-normal.webm`,
        slow = `${directory}/${personality}-slow.webm`;
      await video.saveAs(raw);
      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-i',
          raw,
          '-an',
          '-c:v',
          'libvpx-vp9',
          '-cpu-used',
          '6',
          '-threads',
          '2',
          '-crf',
          '38',
          '-b:v',
          '0',
          normal,
        ],
        { stdio: 'ignore' },
      );
      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-i',
          normal,
          '-vf',
          'setpts=3*PTS',
          '-an',
          '-c:v',
          'libvpx-vp9',
          '-cpu-used',
          '6',
          '-threads',
          '2',
          '-crf',
          '38',
          '-b:v',
          '0',
          slow,
        ],
        { stdio: 'ignore' },
      );
      result.motion = {
        normal: `${personality}-normal.webm`,
        slow: `${personality}-slow.webm`,
        method: 'Actual captured frames repeated at 3x duration, no interpolation',
      };
    }
  }
  console.log(
    'ATTACK PIXELS PASS: three installed species, exact footprint, preparation/impact/settling, pointer replacement, atomic impact, frozen Pause, nested scroll and exact Reset.',
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close();
  server.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(`${directory}/result.json`, JSON.stringify(evidence, null, 2) + '\n');
}
