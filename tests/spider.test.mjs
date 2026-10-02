import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const { code } = await transform(await readFile('src/spider.ts', 'utf8'), {
  loader: 'ts',
  format: 'esm',
});
const { Spider } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const separation = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function walker(personality) {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  const spider = new Spider({ getContext: () => ctx, style: {}, dataset: {} });
  spider.resize(1600, 1000);
  spider.update(0, 0, { x: 800, y: 500 }, { personality, intensity: 0.6, reducedMotion: true });
  spider.age = 2;
  // Isolate walking from the jumping spider's separately tested hunt hops.
  spider.hopCooldown = Infinity;
  return spider;
}

for (const personality of ['curious', 'dreamy', 'feral']) {
  for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
    test(`${personality} coordinated gait at ${Math.round(1 / dt)}fps`, () => {
      const spider = walker(personality);
      const opts = { personality, intensity: 0.6, reducedMotion: false };
      let steps = 0;
      let time = 0;
      const advance = (target, seconds, extra = {}) => {
        for (let frame = 0; frame < seconds / dt; frame++) {
          const before = spider.legs.map((l) => ({ foot: { ...l.foot }, stepping: l.stepping }));
          spider.update(dt, (time += dt), target, { ...opts, ...extra });
          spider.render();
          const supports = spider.legs.filter((l, i) => !l.stepping && i !== spider.gripLeg);
          assert.ok(supports.length >= 4, 'at least four load-bearing contacts');
          for (const side of [-1, 1]) {
            assert.ok(supports.filter((l) => l.side === side).length >= 2, 'support on both sides');
          }
          for (const [i, leg] of spider.legs.entries()) {
            if (!before[i].stepping && i !== spider.gripLeg) {
              assert.deepEqual(
                leg.foot,
                before[i].foot,
                'planted feet cannot slide, even on lift-off',
              );
              if (leg.stepping) steps++;
            }
            if (!leg.stepping && i !== spider.gripLeg) assert.equal(leg.lift, 0);
            if (leg.stepping) {
              assert.ok(
                !spider.legs.some(
                  (other) =>
                    other !== leg &&
                    other.side === leg.side &&
                    Math.abs(other.row - leg.row) === 1 &&
                    other.stepping,
                ),
                'neighboring legs stagger',
              );
            }
          }
          const d = spider.diagnostics;
          assert.ok(d.finite);
          assert.ok(d.maxReach <= d.reachLimit + 0.01, 'reachable endpoints');
          assert.ok(d.maxBoneLength <= d.boneLimit, 'fixed-length bones');
          assert.equal(d.releasedContacts, 0, 'walking must not need emergency contact releases');
        }
      };
      // Slow tracking, fast diagonal travel, tight turn, reversal, then a complete stop.
      for (let i = 0; i < 30; i++) advance({ x: 800 + i * 2, y: 500 - i }, 0.05);
      for (const target of [
        { x: 1150, y: 300 },
        { x: 1130, y: 580 },
        { x: 680, y: 650 },
      ]) {
        advance(target, 3);
        assert.ok(
          separation(spider.position, target) < 15,
          'walking still reaches its destination',
        );
      }
      const stop = spider.position;
      advance(stop, 3);
      assert.ok(
        spider.legs.every((l) => !l.stepping),
        'finish swings and settle',
      );
      const feet = spider.feet;
      advance(stop, 2);
      assert.deepEqual(spider.feet, feet, 'idle expression must not wave walking legs');
      const grip = { point: { x: stop.x + 20, y: stop.y - 35 }, progress: 0.5, color: '#fff' };
      advance(stop, 1, { grip });
      assert.ok(spider.gripCaptured);
      assert.deepEqual(spider.legs[spider.gripLeg].foot, grip.point);
      advance(stop, 2);
      assert.ok(
        spider.legs.every((l) => !l.stepping),
        'released grip returns to stance',
      );
      assert.ok(steps > 30, 'exercise repeated stance/swing cycles');
    });
  }
}

test('faster travel lengthens forward strides and increases cadence for every species', () => {
  for (const personality of ['curious', 'dreamy', 'feral']) {
    const samples = [35, 220].map((speed) => {
      const spider = walker(personality);
      spider.resize(4000, 1000);
      spider.angle = Math.PI / 2;
      spider.resetStance();
      let steps = 0,
        stride = 0,
        duration = 0;
      for (let frame = 0; frame < 180; frame++) {
        const before = spider.legs.map((l) => l.stepping);
        spider.update(
          1 / 60,
          frame / 60,
          { x: 800 + ((frame + 1) * speed) / 60, y: 500 },
          { personality, intensity: 0.6, reducedMotion: false },
        );
        for (const [i, leg] of spider.legs.entries()) {
          if (frame <= 30 || before[i] || !leg.stepping) continue;
          const forward = leg.to.x - leg.from.x;
          assert.ok(forward > 0, 'straight walking swings forward, never randomly backward');
          steps++;
          stride += forward;
          duration += leg.duration;
        }
      }
      return { steps, stride: stride / steps, duration: duration / steps };
    });
    assert.ok(samples[1].steps > samples[0].steps, `${personality}: faster cadence`);
    assert.ok(samples[1].stride > samples[0].stride, `${personality}: longer stride`);
    assert.ok(samples[1].duration < samples[0].duration, `${personality}: shorter swing`);
  }
});

test('mid-stride turns, reversals and grips retain support on compact and full-size rigs', () => {
  for (const personality of ['curious', 'dreamy', 'feral']) {
    for (const height of [400, 1000]) {
      const spider = walker(personality);
      spider.resize(1600, height);
      spider.recover({ x: 800, y: height / 2 }, true);
      const opts = { personality, intensity: 1, reducedMotion: false };
      let captures = 0;
      for (let frame = 0; frame < 720; frame++) {
        // Redirect before the preceding swing finishes, rather than turning only after arrival.
        const turn = Math.floor(frame / 11) * 1.7;
        const target = { x: 800 + Math.sin(turn) * 120, y: height / 2 - Math.cos(turn) * 70 };
        const grip =
          frame % 80 < 24
            ? { point: { x: 800, y: height / 2 }, progress: 0.5, color: '#fff' }
            : undefined;
        const before = spider.legs.map((l) => ({
          foot: { ...l.foot },
          to: { ...l.to },
          stepping: l.stepping,
        }));
        spider.update(1 / 60, frame / 60, target, { ...opts, grip });
        spider.render();
        if (spider.gripCaptured) captures++;
        for (const side of [-1, 1]) {
          assert.ok(
            spider.legs.filter((l, i) => l.side === side && !l.stepping && i !== spider.gripLeg)
              .length >= 2,
            `${personality}: grip must wait for same-side support`,
          );
        }
        for (const [i, leg] of spider.legs.entries()) {
          if (i === spider.gripLeg) continue;
          if (!before[i].stepping)
            assert.deepEqual(leg.foot, before[i].foot, 'turning cannot drag a contact');
          if (before[i].stepping && leg.stepping)
            assert.deepEqual(leg.to, before[i].to, 'committed landing cannot chase a reversal');
        }
        assert.equal(
          spider.releasedContacts,
          8,
          'only the initial calm recovery releases contacts',
        );
        assert.ok(spider.diagnostics.maxBoneLength <= spider.diagnostics.boneLimit);
      }
      assert.ok(captures > 10, 'grips are not starved by locomotion');
    }
  }
});

test('swing folds knees and ankles smoothly without stretching bones or moving contacts', () => {
  // Exercise the actual renderer without a browser; only canvas drawing is stubbed.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  for (const personality of ['curious', 'dreamy', 'feral']) {
    const spider = new Spider({ getContext: () => ctx, style: {}, dataset: {} });
    spider.resize(1000, 700);
    spider.update(0, 0, { x: 500, y: 350 }, { personality, intensity: 0.6, reducedMotion: true });
    spider.render();
    const contacts = spider.legs.map((leg) => ({ ...leg.foot }));
    const knees = spider.legs.map((leg) => ({ ...leg.knee }));
    const ankles = spider.legs.map((leg) => ({ ...leg.ankle }));
    for (let frame = 1; frame <= 60; frame++) {
      const previous = spider.legs.map((leg) => ({ ...leg.knee }));
      for (const leg of spider.legs) leg.lift = Math.sin((Math.PI * frame) / 60) ** 2;
      spider.render();
      for (const [i, leg] of spider.legs.entries()) {
        assert.deepEqual(leg.foot, contacts[i]);
        assert.ok(Math.hypot(leg.knee.x - previous[i].x, leg.knee.y - previous[i].y) < 8);
        assert.ok(
          Math.hypot(leg.knee.x - leg.hip.x, leg.knee.y - leg.hip.y) <=
            spider.profile.upper + 5 + 0.01,
        );
        assert.ok(
          Math.hypot(leg.knee.x - leg.ankle.x, leg.knee.y - leg.ankle.y) <=
            spider.profile.lower + 0.01,
        );
        if (frame === 30) {
          assert.ok(
            Math.hypot(leg.ankle.x - ankles[i].x, leg.ankle.y - ankles[i].y) > 12,
            'ankle tucks during swing',
          );
          assert.ok(
            Math.hypot(leg.knee.x - knees[i].x, leg.knee.y - knees[i].y) > 10,
            'knee folds instead of sliding a rigid leg',
          );
        }
        if (frame === 60)
          assert.ok(Math.hypot(leg.knee.x - knees[i].x, leg.knee.y - knees[i].y) < 0.001);
      }
    }
  }
});
