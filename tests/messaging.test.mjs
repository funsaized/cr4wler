import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/messaging.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { createActivityVoice, statusLabel, intensityLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

test('activity copy stays steady across frames, rotates on return, and is local to each visitor', () => {
  const voice = createActivityVoice();
  const first = voice('scan', 'curious');
  for (let frame = 0; frame < 120; frame++) assert.equal(voice('scan', 'curious'), first);
  voice('notice', 'curious');
  const second = voice('scan', 'curious');
  assert.notEqual(second, first);
  assert.equal(createActivityVoice()('scan', 'curious'), first);
  assert.notEqual(voice('scan', 'dreamy'), second);
  const variants = new Set();
  for (let visit = 0; visit < 100; visit++) {
    voice('notice', 'feral');
    const phrase = voice('strike', 'feral');
    assert.equal(typeof phrase, 'string');
    assert.ok(phrase.length > 0);
    variants.add(phrase);
  }
  assert.ok(variants.size > 1 && variants.size < 100, 'finite bank wraps safely');
});

test('playful status preserves state priority and actionable guidance', () => {
  const s = {
    active: true,
    paused: false,
    reducedMotion: false,
    recordLimitReached: false,
    followMouse: true,
  };
  assert.match(statusLabel(s), /Hover.*Edges scroll/);
  assert.match(statusLabel(s, true), /Exploring.*pointer/);
  assert.doesNotMatch(statusLabel(s, true), /Hover/);
  s.recordLimitReached = true;
  assert.match(statusLabel(s), /full.*Restore/);
  s.reducedMotion = true;
  assert.match(statusLabel(s), /Reduced motion.*no new strikes/);
  s.paused = true;
  assert.match(statusLabel(s), /Paused.*Resume/);
  s.active = false;
  assert.match(statusLabel(s), /No visitor.*Summon/);
  for (const intensity of [0, 0.33, 0.7, 1]) {
    assert.ok(intensityLabel(intensity).startsWith(`${Math.round(intensity * 100)}% · `));
  }
});
