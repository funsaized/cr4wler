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
const { Spider, IdleScheduler } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
const species = ['curious', 'feral', 'dreamy'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('seeded idle actions have quiet gaps, cooldowns, frozen clocks and a bounded single owner', () => {
  const run = (seed, personality) => {
    const scheduler = new IdleScheduler(seed),
      starts = [];
    let previous = null,
      end = 0;
    for (let frame = 0; frame < 180 * 60; frame++) {
      const action = scheduler.update(1 / 60, personality, true);
      if (action && action !== previous) {
        const at = frame / 60;
        assert.ok(at - end >= 3.4, 'several seconds of quiet between gestures');
        const last = starts.findLast((s) => s.kind === action.kind);
        if (last) assert.ok(at - last.at >= (['groom', 'tend'].includes(action.kind) ? 18 : 8));
        starts.push({ kind: action.kind, at });
        const frozen = JSON.stringify(action);
        for (let i = 0; i < 100; i++) scheduler.update(0, personality, true);
        assert.equal(JSON.stringify(action), frozen, 'zero dt cannot advance idle');
      }
      if (!action && previous) end = frame / 60;
      previous = action;
    }
    assert.ok(starts.length >= 15 && starts.length <= 35);
    assert.ok(scheduler.cooldowns.size <= 3, 'no retained action history');
    scheduler.interrupt();
    assert.equal(scheduler.action, null);
    scheduler.reset();
    assert.equal(scheduler.now, 0);
    assert.equal(scheduler.cooldowns.size, 0);
    return starts;
  };
  for (const personality of species) {
    assert.deepEqual(run(42, personality), run(42, personality));
    assert.notDeepEqual(run(42, personality), run(71, personality));
  }
});

function rig(personality, seed = 42) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  const spider = new Spider({ getContext: () => ctx, style: {}, dataset: {} }, seed);
  const target = { x: 800, y: 500 };
  spider.resize(1600, 1000);
  spider.update(0, 0, target, { personality, intensity: 0.6, reducedMotion: true });
  spider.age = 2;
  spider.hopCooldown = Infinity;
  const surfaces = spider.feet.map((p, i) => ({
    id: `edge-${i}`,
    kind: 'card',
    a: { x: p.x - 40, y: p.y },
    b: { x: p.x + 40, y: p.y },
    min: 0,
    max: 1,
  }));
  const opts = { personality, intensity: 0.6, reducedMotion: false, idle: true, surfaces };
  return { spider, target, opts };
}

for (const personality of species) {
  test(`${personality}: idle preserves seven supports, fixed reach, and quiet resting feet`, () => {
    const { spider, target, opts } = rig(personality);
    let quietFrames = 0;
    const actions = new Set();
    for (let frame = 0; frame < 90 * 60; frame++) {
      const wasResting = spider.legs.every((l) => !l.stepping);
      const before = spider.feet,
        owned = spider.idleGesture?.leg;
      spider.update(1 / 60, frame / 60, target, opts);
      spider.render();
      const d = spider.diagnostics;
      assert.ok(d.finite && d.maxReach <= d.reachLimit + 0.01 && d.maxBoneLength <= d.boneLimit);
      assert.ok(
        spider.legs.filter((l) => !l.stepping).length >= 7,
        'one small foot action at a time',
      );
      if (spider.idleGesture) {
        actions.add(spider.idleGesture.kind);
        const action = d.idle,
          progress = action.elapsed / action.duration;
        if (['probe', 'tend'].includes(action.kind) && progress > 0.34 && progress < 0.5) {
          assert.ok(
            distance(
              spider.feet[spider.idleGesture.leg],
              spider.contactPoint(spider.idleGesture.edge),
            ) < 0.01,
            'a testing/tending toe actually meets its safe edge before withdrawal',
          );
        }
        for (const [i, l] of spider.legs.entries())
          if (i !== spider.idleGesture.leg && i !== owned)
            assert.deepEqual(l.foot, before[i], 'supporting contacts stay planted');
      } else if (wasResting && owned === undefined && spider.legs.every((l) => !l.stepping)) {
        quietFrames++;
        assert.deepEqual(spider.feet, before, 'quiet feet do not oscillate');
        assert.equal(spider.idlePalps, 0);
        assert.equal(spider.idleSway, 0);
      }
    }
    assert.ok(quietFrames > 90 * 60 * 0.5, 'stillness dominates');
    const expected =
      personality === 'curious'
        ? ['probe', 'groom']
        : personality === 'feral'
          ? ['orient', 'crouch', 'reposition']
          : ['sway', 'reposition', 'tend'];
    assert.deepEqual([...actions].sort(), expected.sort());
  });

  test(`${personality}: every idle action yields immediately to a new exact grip and approach`, () => {
    const { spider, target, opts } = rig(personality);
    const seen = new Set();
    for (let frame = 0; frame < 100 * 60; frame++) {
      spider.update(1 / 60, frame / 60, target, opts);
      const gesture = spider.idleGesture,
        action = spider.idleScheduler.action;
      if (!gesture || seen.has(gesture.kind) || action.elapsed < action.duration * 0.4) continue;
      seen.add(gesture.kind);
      const feet = spider.feet;
      spider.interruptIdle();
      assert.deepEqual(spider.feet, feet, 'input cannot teleport a loose foot');
      assert.equal(spider.idleGesture, null);
      assert.equal(spider.idleScheduler.action, null);
      const grip = { point: { x: target.x + 20, y: target.y - 35 }, progress: 0.6, color: '#fff' };
      for (let i = 0; i < 30; i++)
        spider.update(1 / 60, 0, target, {
          ...opts,
          idle: false,
          grip,
          selector: {
            rect: { x: target.x, y: target.y - 50, width: 50, height: 25 },
            progress: 0.5,
            phase: 'prepare',
            color: '#fff',
          },
        });
      assert.ok(spider.gripCaptured);
      assert.deepEqual(spider.feet[spider.gripLeg], grip.point, 'item4 exact contact wins');
      const destination = { x: target.x + 120, y: target.y + 40 };
      for (let i = 0; i < 180; i++) {
        spider.update(1 / 60, 0, destination, { ...opts, idle: false });
        spider.render();
        const d = spider.diagnostics;
        assert.ok(d.finite && d.maxReach <= d.reachLimit + 0.01 && d.maxBoneLength <= d.boneLimit);
        assert.ok(spider.legs.filter((l) => !l.stepping).length >= 4);
      }
      assert.ok(distance(spider.position, destination) < 15);
      // Return through normal gait; do not modify contacts to restart the scheduler.
      for (let i = 0; i < 240; i++) spider.update(1 / 60, 0, target, { ...opts, idle: false });
    }
    assert.equal(seen.size, personality === 'curious' ? 2 : 3);
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
async function fixture(personality) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/idle.html?autostart=off`);
  await page.evaluate((personality) => {
    globalThis.runtime = __cr4wlerPlayground.engine;
    runtime.idleSeed = personality === 'curious' ? 42 : 7; // Choices only; real clocks/geometry.
    runtime.summon({ personality, followMouse: true });
  }, personality);
  return page;
}
async function gesture(page) {
  await page.waitForFunction(() => runtime.spider.idleScheduler.action?.elapsed > 0.2, null, {
    polling: 'raf',
    timeout: 15000,
  });
}

for (const personality of species) {
  test(
    `${personality}: production idle pauses, redirects to a real hunt, and restores without page actions`,
    { timeout: 30000 },
    async () => {
      const page = await fixture(personality);
      try {
        const original = await page.locator('main').innerHTML();
        await page.evaluate(() => {
          globalThis.actions = 0;
          for (const event of ['click', 'input', 'change', 'submit'])
            document.querySelector('main').addEventListener(event, () => actions++, true);
        });
        await gesture(page);
        assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
        assert.equal(await page.evaluate(() => scrollY), 0);
        // Focus + real keyboard activation freezes the gesture without pointer interruption.
        await page.evaluate(() => runtime.pauseButton.focus());
        await page.keyboard.press('Enter');
        const paused = await page.evaluate(() => ({
          idle: runtime.spider.diagnostics.idle,
          feet: runtime.spider.feet,
          time: runtime.time,
        }));
        await page.waitForTimeout(300);
        assert.deepEqual(
          await page.evaluate(() => ({
            idle: runtime.spider.diagnostics.idle,
            feet: runtime.spider.feet,
            time: runtime.time,
          })),
          paused,
        );
        await page.keyboard.press('Enter');
        await page.mouse.move(88, 266); // Protected input still interrupts idle without hunting.
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
        assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
        const aim = await page.locator('#target').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + 80, y: r.y + 14 };
        });
        await page.mouse.move(aim.x, aim.y);
        await page.waitForFunction(() => runtime.fragments.length === 1 && !runtime.current, null, {
          timeout: 10000,
        });
        assert.equal(await page.evaluate(() => runtime.fragments[0].target.element.id), 'target');
        assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
        assert.equal(await page.locator('main').innerHTML(), original);
        assert.equal(await page.locator('#protected').inputValue(), 'Keep this value');
        assert.equal(await page.evaluate(() => actions), 0);
        await page.evaluate((personality) => {
          runtime.summon({ personality, followMouse: true });
          runtime.summon();
        }, personality);
        assert.equal(await page.locator('[data-cr4wler-root]').count(), 1);
        assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
      } finally {
        await page.close();
      }
    },
  );
}

test(
  'stale idle surfaces, species, resize, background and reduced motion discard temporary ownership',
  { timeout: 45000 },
  async () => {
    const page = await fixture('dreamy');
    try {
      await page.waitForFunction(
        () =>
          runtime.spider.idleScheduler.action?.kind === 'tend' &&
          runtime.spider.idleScheduler.action.elapsed > 0.5,
        null,
        { timeout: 24000, polling: 'raf' },
      );
      await page.evaluate(() => {
        document.querySelector('#edge').remove();
        document.querySelector('#lower').remove();
      });
      await page.waitForFunction(() => !runtime.spider.idleGesture, null, { timeout: 1500 });
      await page.evaluate(() => runtime.configure({ personality: 'feral' }));
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => runtime.spider.diagnostics.type), 'jumping spider');
      await gesture(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
      await gesture(page);
      // A controlled visibility event exercises the lifecycle; native tab behavior is
      // covered separately by the installed headed check where available.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const frozenTime = await page.evaluate(() => runtime.time);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => runtime.time), frozenTime);
      assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(100);
      const quiet = await page.evaluate(() => ({
        time: runtime.time,
        pixels: runtime.spider.canvas.toDataURL(),
        idle: runtime.spider.diagnostics.idle,
      }));
      await page.waitForTimeout(200);
      assert.deepEqual(
        await page.evaluate(() => ({
          time: runtime.time,
          pixels: runtime.spider.canvas.toDataURL(),
          idle: runtime.spider.diagnostics.idle,
        })),
        quiet,
      );
      assert.equal(quiet.idle, null);
    } finally {
      await page.close();
    }
  },
);

test(
  'manual nested/page scrolling interrupts idle and leaves fixed-reach supported contacts',
  { timeout: 30000 },
  async () => {
    const page = await fixture('curious');
    try {
      await gesture(page);
      await page.locator('#nested').evaluate((el) => {
        el.scrollTop = 55;
      });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      await gesture(page);
      await page.evaluate(() => scrollTo(0, 160));
      await page.waitForFunction(
        () => runtime.surfaceOffset.y === scrollY && !runtime.spider.recovering,
        null,
        { polling: 'raf', timeout: 1500 },
      );
      const rig = await page.evaluate(() => runtime.spider.diagnostics);
      assert.equal(rig.idle, null);
      assert.ok(
        rig.finite && rig.maxReach <= rig.reachLimit + 0.01 && rig.maxBoneLength <= rig.boneLimit,
      );
      assert.ok(rig.legs.filter((leg) => leg.phase === 'stance').length >= 4);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  },
);

test(
  'a stationary pointer inside blank/protected content permits quiet idle and movement interrupts it',
  { timeout: 40000 },
  async () => {
    const page = await fixture('curious');
    try {
      const original = await page.locator('main').innerHTML();
      await page.mouse.move(360, 180);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => runtime.pointerActive), true);
      assert.equal(await page.evaluate(() => runtime.hover), null);
      await gesture(page);
      assert.equal(
        await page.evaluate(() => runtime.pointerActive),
        true,
        'pointer remains inside the page',
      );
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      assert.equal(await page.evaluate(() => scrollY), 0);
      const protectedPoint = await page.locator('#protected').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await page.mouse.move(protectedPoint.x, protectedPoint.y);
      assert.equal(
        await page.evaluate(() => runtime.spider.diagnostics.idle),
        null,
        'real movement interrupts in its event handler',
      );
      await gesture(page);
      assert.equal(await page.evaluate(() => runtime.pointerActive), true);
      assert.equal(await page.evaluate(() => runtime.hover), null);
      assert.equal(await page.evaluate(() => runtime.edgeDirection), 0);
      await page.evaluate(() => runtime.pauseButton.focus());
      await page.keyboard.press('Enter');
      const frozen = await page.evaluate(() => ({
        time: runtime.time,
        idle: runtime.spider.diagnostics.idle,
        feet: runtime.spider.feet,
      }));
      await page.waitForTimeout(200);
      assert.deepEqual(
        await page.evaluate(() => ({
          time: runtime.time,
          idle: runtime.spider.diagnostics.idle,
          feet: runtime.spider.feet,
        })),
        frozen,
      );
      await page.keyboard.press('Enter');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main').innerHTML(), original);
      assert.equal(await page.locator('#protected').inputValue(), 'Keep this value');
    } finally {
      await page.close();
    }
  },
);

test(
  'a stationary pointer over an occupied hunt target returns to idle without more destruction or scrolling',
  { timeout: 30000 },
  async () => {
    const page = await fixture('feral');
    try {
      const aim = await page.locator('#target').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + 80, y: r.y + 14 };
      });
      await page.mouse.move(aim.x, aim.y);
      await page.waitForFunction(() => runtime.fragments.length === 1 && !runtime.current, null, {
        timeout: 10000,
      });
      await gesture(page);
      const idle = await page.evaluate(() => ({
        pointer: runtime.pointerActive,
        hover: runtime.hover,
        candidate: runtime.candidate,
        count: runtime.fragments.length,
        edge: runtime.edgeDirection,
        scroll: scrollY,
        mode: runtime.mode,
      }));
      assert.deepEqual(idle, {
        pointer: true,
        hover: null,
        candidate: null,
        count: 1,
        edge: 0,
        scroll: 0,
        mode: 'scan',
      });
      await page.waitForTimeout(2000);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 1);
      assert.equal(await page.evaluate(() => scrollY), 0);
      await page.mouse.move(362, 182);
      assert.equal(await page.evaluate(() => runtime.spider.diagnostics.idle), null);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
    } finally {
      await page.close();
    }
  },
);
