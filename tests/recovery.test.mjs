import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const { code } = await transform(await readFile('src/spider.ts', 'utf8'), {
  loader: 'ts',
  format: 'esm',
});
const { Spider } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
const species = ['curious', 'feral', 'dreamy'];
const point = { x: 800, y: 500 };
function rig(personality) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  const spider = new Spider({ getContext: () => ctx, style: {}, dataset: {} });
  spider.resize(1600, 1000);
  spider.update(0, 0, point, { personality, intensity: 0.6, reducedMotion: true });
  spider.age = 2;
  spider.hopCooldown = Infinity;
  return spider;
}
function bounded(spider) {
  spider.render();
  const d = spider.diagnostics;
  assert.ok(
    d.finite && d.maxReach <= d.reachLimit + 0.01 && d.maxBoneLength <= d.boneLimit + 0.01,
    JSON.stringify(d),
  );
  for (const l of spider.legs)
    for (const p of [l.hip, l.knee, l.ankle, l.foot])
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
}
for (const personality of species) {
  test(`${personality}: small scroll continuity, lost support, bounded single entrance and quiet rearm`, () => {
    const spider = rig(personality),
      opts = { personality, intensity: 0.6, reducedMotion: false };
    const surfaces = spider.feet.map((p, i) => ({
      id: String(i),
      kind: 'card',
      a: { x: p.x - 25, y: p.y },
      b: { x: p.x + 25, y: p.y },
      min: 0,
      max: 1,
    }));
    for (const [i, l] of spider.legs.entries()) l.contact = { id: String(i), fraction: 0.5 };
    spider.update(1 / 60, 0, point, { ...opts, surfaces });
    const moved = surfaces.map((s) => ({
      ...s,
      a: { x: s.a.x, y: s.a.y - 3 },
      b: { x: s.b.x, y: s.b.y - 3 },
    }));
    assert.equal(spider.needsRecovery({ x: 0, y: -3 }, moved), false);
    spider.update(1 / 60, 0, point, { ...opts, surfaces: moved, surfaceDelta: { x: 0, y: -3 } });
    assert.equal(spider.recovering, false);
    assert.equal(
      spider.needsRecovery({ x: 0, y: 0 }, []),
      true,
      'majority missing contacts is real stance loss without document motion',
    );
    let maxElapsed = 0,
      completed = 0,
      arc = 0,
      offscreen = false,
      thread = false,
      rotation = 0;
    for (let f = 0; f < 150; f++) {
      const delta = { x: 0, y: f < 45 ? -180 : 180 };
      spider.update(1 / 60, f / 60, point, {
        ...opts,
        surfaces: [],
        surfaceDelta: delta,
        pageMoving: true,
      });
      if (spider.recovering) {
        const elapsed = spider.diagnostics.recoveryElapsed;
        assert.ok(elapsed >= maxElapsed, 'continuous scrolling never resets the logical clock');
        maxElapsed = elapsed;
        const before = spider.recovery;
        spider.recover({ x: 650, y: 450 });
        assert.equal(spider.recovery, before, 'in-progress calls have no side effects');
        spider.retargetRecovery({ x: 800, y: f < 12 ? 350 : 520 });
        arc = Math.max(
          arc,
          Math.min(spider.recovery.from.y, spider.recovery.to.y) - spider.position.y,
        );
        offscreen ||= spider.position.y < 0 || spider.position.x < 0 || spider.position.x > 1600;
        thread ||= spider.diagnostics.thread > 0;
        rotation = Math.max(rotation, Math.abs(spider.diagnostics.rotation));
      } else if (!completed) completed = f / 60;
      bounded(spider);
    }
    assert.equal(spider.diagnostics.recoveries, 1);
    assert.ok(
      completed > 0 && completed < 0.85,
      'one compact entrance returns control despite ongoing motion',
    );
    assert.equal(spider.diagnostics.thread, 0);
    if (personality === 'feral') {
      assert.ok(arc > 10);
      assert.equal(thread, false);
    } else {
      assert.ok(offscreen);
      assert.ok(thread);
    }
    if (personality === 'dreamy') assert.ok(rotation > 0.02);
    for (let f = 0; f < 30; f++)
      spider.update(1 / 60, 0, spider.position, { ...opts, surfaces: [] });
    assert.equal(spider.diagnostics.recoveryArmed, true);
    spider.update(1 / 60, 0, spider.position, { ...opts, surfaceDelta: { x: 0, y: -500 } });
    assert.equal(spider.diagnostics.recoveries, 2, 'a later distinct navigation can recover again');
  });
  test(`${personality}: Pause, resize, reduced motion and species change in each entrance phase`, () => {
    for (const stage of [0.025, 0.2, 0.61]) {
      const spider = rig(personality),
        opts = { personality, intensity: 0.6, reducedMotion: false };
      spider.recover({ x: 700, y: 400 });
      for (
        let time = 0;
        time < Math.min(stage, spider.diagnostics.recoveryDuration - 0.02);
        time += 1 / 120
      )
        spider.update(1 / 120, time, point, opts);
      const frozen = {
        body: spider.position,
        feet: spider.feet,
        elapsed: spider.diagnostics.recoveryElapsed,
        thread: spider.diagnostics.thread,
      };
      for (let f = 0; f < 20; f++)
        spider.update(0, 0, point, { ...opts, surfaceDelta: { x: 0, y: -250 }, pageMoving: true });
      assert.deepEqual(
        {
          body: spider.position,
          feet: spider.feet,
          elapsed: spider.diagnostics.recoveryElapsed,
          thread: spider.diagnostics.thread,
        },
        frozen,
      );
      spider.resize(900, 600);
      bounded(spider);
      for (let f = 0; f < 90; f++) {
        spider.update(1 / 60, 0, point, opts);
        bounded(spider);
      }
      assert.equal(spider.recovering, false);
      spider.recover(point);
      spider.update(0, 0, point, {
        ...opts,
        personality: personality === 'feral' ? 'dreamy' : 'feral',
      });
      assert.equal(spider.recovering, false);
      assert.equal(spider.diagnostics.thread, 0);
      bounded(spider);
      spider.recover(point);
      spider.update(0, 0, point, { ...opts, reducedMotion: true });
      assert.equal(spider.recovering, false);
      assert.equal(spider.diagnostics.thread, 0);
      bounded(spider);
    }
  });
}

let browser, server, base;
before(async () => {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true });
});
after(async () => {
  await browser?.close();
  server?.close();
});
for (const personality of species)
  test(
    `${personality}: real wheel/reversal, PageDown, nested scroll and next pointer preserve ownership`,
    { timeout: 30000 },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        await page.goto(`${base}/pointer.html?autostart=off`);
        await page.evaluate((personality) => {
          globalThis.runtime = __cr4wlerPlayground.engine;
          globalThis.trace = [];
          const frame = runtime.frame;
          runtime.frame = (now) => {
            frame(now);
            if (runtime.spider)
              trace.push({
                at: now,
                mode: runtime.mode,
                rig: runtime.spider.diagnostics,
                edge: runtime.edgeDirection,
                selector: runtime.lastSpiderOptions?.selector?.phase,
                grip: !!runtime.lastSpiderOptions?.grip,
              });
          };
          runtime.summon({ personality, followMouse: true });
        }, personality);
        await page.waitForTimeout(1800);
        const initial = await page.evaluate(() => runtime.spider.diagnostics.recoveries);
        await page.mouse.move(400, 450);
        for (let i = 0; i < 12; i++) {
          await page.mouse.wheel(0, i < 6 ? 340 : -300);
          await page.waitForTimeout(30);
        }
        await page.waitForTimeout(250);
        const result = await page.evaluate((initial) => {
          const entries = trace.filter(
            (x) => x.rig.recoveries > initial && x.rig.reason === 'scroll',
          );
          return {
            entries,
            rig: runtime.spider.diagnostics,
            edge: runtime.edgeDirection,
            scroll: scrollY,
            mode: runtime.mode,
          };
        }, initial);
        assert.ok(result.entries.length > 0);
        assert.equal(
          result.rig.recoveries - initial,
          1,
          'one recovery for the burst including reversal',
        );
        assert.equal(result.rig.recovery, 'none');
        assert.ok(result.entries.every((x) => !x.grip && !x.selector && x.edge === 0));
        assert.equal(result.edge, 0);
        await page.waitForTimeout(300);
        assert.equal(
          await page.evaluate(() => scrollY),
          result.scroll,
          'the entrance never scrolls the page',
        );
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(1100);
        assert.equal(await page.evaluate(() => runtime.edgeDirection), 0);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(1100);
        await page.locator('#nested').evaluate((el) => {
          el.scrollTop = 250;
        });
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => runtime.edgeDirection), 0);
        const aim = await page.locator('#target-b').boundingBox();
        await page.mouse.move(aim.x + 75, aim.y + 14);
        await page.waitForFunction(
          () =>
            runtime.candidate?.element.id === 'target-b' ||
            runtime.current?.target.element.id === 'target-b',
          null,
          { timeout: 1800, polling: 'raf' },
        );
        const all = await page.evaluate(() => trace);
        assert.ok(
          all.every(
            (x) =>
              x.rig.finite &&
              x.rig.maxReach <= x.rig.reachLimit + 0.01 &&
              x.rig.maxBoneLength <= x.rig.boneLimit + 0.01,
          ),
        );
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      } finally {
        await page.close();
      }
    },
  );

for (const personality of species)
  test(
    `${personality}: engine Reset, paused species switch and background in every recovery stage`,
    { timeout: 45000 },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      try {
        await page.goto(`${base}/pointer.html?autostart=off`);
        const original = await page.locator('main').innerHTML();
        await page.evaluate(() => {
          globalThis.runtime = __cr4wlerPlayground.engine;
          globalThis.freezePhase = null;
          const frame = runtime.frame;
          runtime.frame = (now) => {
            frame(now);
            if (
              freezePhase &&
              runtime.spider?.recoveryReason === 'scroll' &&
              runtime.spider.recoveryPhase === freezePhase
            ) {
              freezePhase = null;
              runtime.pause();
            }
          };
        });
        for (const phase of ['anticipate', 'flight', 'land']) {
          await page.evaluate((personality) => {
            scrollTo(0, 0);
            runtime.summon({ personality, followMouse: true });
            runtime.summon();
          }, personality);
          await page.mouse.move(400, 120);
          await page.waitForTimeout(1800);
          await page.evaluate((phase) => {
            freezePhase = phase;
          }, phase);
          await page.mouse.wheel(0, 700);
          await page.waitForFunction(() => runtime.paused, null, { timeout: 1800, polling: 'raf' });
          const frozen = await page.evaluate(() => ({
            elapsed: runtime.spider.diagnostics.recoveryElapsed,
            body: runtime.spider.position,
            feet: runtime.spider.feet,
            pixels: runtime.spider.canvas.toDataURL(),
          }));
          await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await page.waitForTimeout(100);
          assert.deepEqual(
            await page.evaluate(() => ({
              elapsed: runtime.spider.diagnostics.recoveryElapsed,
              body: runtime.spider.position,
              feet: runtime.spider.feet,
              pixels: runtime.spider.canvas.toDataURL(),
            })),
            frozen,
          );
          await page.evaluate(() => {
            delete document.hidden;
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await page.waitForTimeout(70);
          assert.equal(
            await page.evaluate(() => runtime.spider.diagnostics.recoveryElapsed),
            frozen.elapsed,
          );
          await page.evaluate(
            (personality) =>
              runtime.configure({ personality: personality === 'feral' ? 'dreamy' : 'feral' }),
            personality,
          );
          const switched = await page.evaluate(() => runtime.spider.diagnostics);
          assert.equal(switched.recovery, 'none');
          assert.equal(switched.thread, 0);
          assert.ok(
            switched.finite &&
              switched.maxReach <= switched.reachLimit + 0.01 &&
              switched.maxBoneLength <= switched.boneLimit + 0.01,
          );
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
          assert.equal(await page.locator('main').innerHTML(), original);
          // Reset directly in the same physical stage, with the next activation clean.
          await page.evaluate((personality) => {
            scrollTo(0, 0);
            runtime.summon({ personality, followMouse: true });
          }, personality);
          await page.waitForTimeout(1800);
          await page.evaluate((phase) => {
            freezePhase = phase;
          }, phase);
          await page.mouse.wheel(0, 700);
          await page.waitForFunction(() => runtime.paused, null, { timeout: 1800, polling: 'raf' });
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
        }
      } finally {
        await page.close();
      }
    },
  );
