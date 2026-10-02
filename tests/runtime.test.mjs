import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build, transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

const { code } = await transform(await readFile('src/runtime-quality.ts', 'utf8'), {
  loader: 'ts',
  format: 'esm',
});
const { RuntimeQuality } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
test('quality sheds decoration only after sustained pressure and recovers slowly', () => {
  const quality = new RuntimeQuality();
  for (const delta of [10000, NaN, -1, Infinity]) quality.sample(delta);
  assert.equal(quality.level, 0);
  for (let i = 0; i < 20; i++) quality.sample(33);
  assert.equal(quality.level, 0);
  for (let i = 0; i < 20; i++) quality.sample(33);
  assert.equal(quality.level, 1);
  for (let i = 0; i < 90; i++) quality.sample(33);
  assert.equal(quality.level, 1, 'four-second cooldown prevents repeated degradation');
  for (let i = 0; i < 60; i++) quality.sample(33);
  assert.equal(quality.level, 2);
  for (let i = 0; i < 300; i++) quality.sample(16.7);
  assert.equal(quality.level, 2, 'five healthy seconds are insufficient');
  for (let i = 0; i < 70; i++) quality.sample(16.7);
  assert.equal(quality.level, 1);
  for (let i = 0; i < 400; i++) quality.sample(16.7);
  assert.equal(quality.level, 0);
});

let browser, server, base, bundle;
before(async () => {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const result = await build({
    stdin: {
      contents:
        "import { Cr4wler } from './src/engine'; import { scanTargets } from './src/targets'; globalThis.runtime = new Cr4wler(); globalThis.scanTargets = scanTargets;",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
  });
  bundle = result.outputFiles[0].text;
});
after(async () => {
  await browser?.close();
  server?.close();
});
async function fixture() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/reference.html?autostart=off`);
  await page.addScriptTag({ content: bundle });
  return page;
}

test('Pause, hidden tabs, Reset and pagehide leave no runtime animation or detached controls', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      globalThis.frames = 0;
      const frame = runtime.frame;
      runtime.frame = (now) => {
        frames++;
        frame(now);
      };
      runtime.summon({ personality: 'feral' });
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => runtime.pause());
    const pausedFrameCount = await page.evaluate(() => frames);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => frames), pausedFrameCount);
    await page.evaluate(() => scrollBy(0, 350));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => runtime.raf), 0, 'paused geometry is event-driven');
    await page.evaluate(() => {
      runtime.pause();
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const time = await page.evaluate(() => runtime.time);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => runtime.time), time);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(80);
    assert.ok(
      await page.evaluate(
        (t) => runtime.time - t < 0.15 && runtime.spider.diagnostics.finite,
        time,
      ),
    );
    await page.evaluate(() => runtime.restore());
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        runtime.summon();
        runtime.scan();
        runtime.restore();
      });
      await page.waitForTimeout(30);
      assert.deepEqual(
        await page.evaluate(() => ({
          raf: runtime.raf,
          targets: runtime.targets.length,
          records: runtime.fragments.length,
          controls: [runtime.activity, runtime.pauseButton, runtime.tip],
          highlights: [...CSS.highlights.keys()].filter((n) => n.startsWith('cr4wler-')),
          roots: document.querySelectorAll('[data-cr4wler-root]').length,
        })),
        { raf: 0, targets: 0, records: 0, controls: [null, null, null], highlights: [], roots: 0 },
      );
    }
    await page.evaluate(() => {
      runtime.summon();
      dispatchEvent(new PageTransitionEvent('pagehide'));
    });
    assert.equal(await page.evaluate(() => runtime.status().active), false);
  } finally {
    await page.close();
  }
});

test('large foreground deltas do not replay hunts or break the rig', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => runtime.summon({ personality: 'feral' }));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const before = runtime.spider.position;
          const marks = runtime.fragments.length;
          runtime.previous -= 60000;
          requestAnimationFrame(() => {
            const after = runtime.spider.position;
            const rig = runtime.spider.diagnostics;
            runtime.pause();
            resolve({
              travel: Math.hypot(after.x - before.x, after.y - before.y),
              added: runtime.fragments.length - marks,
              rig,
            });
          });
        }),
    );
    assert.ok(result.travel < 50);
    assert.ok(result.added <= 1);
    assert.ok(result.rig.finite);
    assert.ok(result.rig.maxReach <= result.rig.reachLimit + 0.01);
    assert.ok(result.rig.maxBoneLength <= result.rig.boneLimit + 0.01);
  } finally {
    await page.close();
  }
});

test('pinch zoom and nested scrolling keep paused projections in viewport coordinates', async () => {
  const page = await fixture();
  try {
    await page.evaluate(async () => {
      document.body.innerHTML =
        '<div id="scroller" style="position:absolute;top:180px;left:200px;width:600px;height:300px;overflow:auto"><p style="height:1000px">A source line inside a nested scrolling container</p></div>';
      runtime.summon({ followMouse: true });
      runtime.pause();
      const abort = new AbortController();
      const [target] = await scanTargets(abort.signal);
      abort.abort();
      runtime.candidate = target;
      runtime.strike();
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
    await page.evaluate(() => (document.querySelector('#scroller').scrollTop = 8));
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => {
      const record = runtime.fragments[0];
      const source = record.target.range.getBoundingClientRect();
      const matrix = new DOMMatrix(record.el.style.transform);
      return { x: matrix.m41 - source.x, y: matrix.m42 - source.y, raf: runtime.raf };
    });
    assert.ok(Math.abs(result.x) < 0.1 && Math.abs(result.y) < 0.1);
    assert.equal(result.raf, 0);
  } finally {
    await page.close();
  }
});

test('discovery cancels queued slices immediately and bounds rejected range work', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async () => {
      const abort = new AbortController();
      const pending = scanTargets(abort.signal);
      abort.abort();
      const cancelled = await pending;
      let calls = 0;
      const original = Range.prototype.getClientRects;
      Range.prototype.getClientRects = function () {
        calls++;
        return original.call(this);
      };
      const signal = new AbortController();
      const targets = await scanTargets(signal.signal);
      signal.abort();
      return { cancelled: cancelled.length, calls, targets: targets.length };
    });
    assert.equal(result.cancelled, 0);
    assert.ok(
      result.calls <= 1800 * 6,
      `bounded node walk and line-shortening reads: ${result.calls}`,
    );
    assert.ok(result.targets > 0);
  } finally {
    await page.close();
  }
});

test('stationary follow skips global discovery, caches bounds, and invalidates on page edits', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      runtime.summon({ followMouse: true });
      globalThis.scans = 0;
      const scan = runtime.scan.bind(runtime);
      runtime.scan = () => {
        scans++;
        return scan();
      };
    });
    await page.mouse.move(500, 350);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => scans), 0);
    const result = await page.evaluate(async () => {
      const abort = new AbortController();
      const [target] = await scanTargets(abort.signal);
      abort.abort();
      let reads = 0;
      const original = target.range.getBoundingClientRect.bind(target.range);
      target.range.getBoundingClientRect = () => {
        reads++;
        return original();
      };
      runtime.boundsRevision++;
      for (let i = 0; i < 20; i++) runtime.targetFresh(target);
      const cachedReads = reads;
      runtime.scheduleGeometry(true);
      runtime.targetFresh(target);
      target.node.data = 'User changed this text during the session';
      const valid = runtime.targetFresh(target);
      runtime.restore();
      return { cachedReads, reads, valid, text: target.node.data };
    });
    assert.equal(result.cachedReads, 1);
    assert.equal(result.reads, 2);
    assert.equal(result.valid, false);
    assert.equal(result.text, 'User changed this text during the session');
  } finally {
    await page.close();
  }
});

test('geometry batches range reads before shard rebuild writes; quality preserves all text', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async () => {
      runtime.summon({ followMouse: true });
      runtime.pause();
      const abort = new AbortController();
      const targets = await scanTargets(abort.signal);
      abort.abort();
      runtime.quality.level = 2;
      for (const target of targets.slice(0, 6)) {
        runtime.candidate = target;
        runtime.strike();
      }
      runtime.current = null;
      document.fonts.dispatchEvent(new Event('loadingdone'));
      const fontInvalidated = runtime.fragments.every((record) => record.layoutDirty);
      let writes = 0,
        readsAfterWrite = 0;
      const read = Range.prototype.getBoundingClientRect;
      const write = Element.prototype.replaceChildren;
      Range.prototype.getBoundingClientRect = function () {
        if (writes) readsAfterWrite++;
        return read.call(this);
      };
      Element.prototype.replaceChildren = function (...nodes) {
        writes++;
        return write.apply(this, nodes);
      };
      runtime.refreshGeometry();
      Range.prototype.getBoundingClientRect = read;
      Element.prototype.replaceChildren = write;
      const result = {
        fontInvalidated,
        writes,
        readsAfterWrite,
        records: runtime.fragments.map((r) => ({
          effect: r.effect,
          shards: r.shards.length,
          complete: r.shards.map((s) => s.text).join('') === r.target.text,
        })),
      };
      runtime.restore();
      return result;
    });
    assert.ok(result.fontInvalidated);
    assert.ok(result.writes > 1);
    assert.equal(result.readsAfterWrite, 0);
    assert.ok(result.records.every((r) => r.complete && r.shards <= 6));
  } finally {
    await page.close();
  }
});
