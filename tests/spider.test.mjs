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
