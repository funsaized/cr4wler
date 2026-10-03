import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

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
async function fixture(personality = 'dreamy') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/anticipation.html?autostart=off`);
  await page.evaluate((personality) => {
    globalThis.runtime = __cr4wlerPlayground.engine;
    globalThis.trace = [];
    const footprint = (target) =>
      target && {
        id: target.element.id,
        text: target.text,
        start: target.range.startOffset,
        end: target.range.endOffset,
        rect: [target.rect.x, target.rect.y, target.rect.width, target.rect.height],
      };
    const frame = runtime.frame;
    runtime.frame = (now) => {
      frame(now);
      trace.push({
        at: now,
        mode: runtime.mode,
        candidate: footprint(runtime.candidate),
        impact: footprint(runtime.current?.target),
        count: runtime.fragments.length,
        selector: JSON.parse(JSON.stringify(runtime.lastSpiderOptions?.selector ?? null)),
        grip: runtime.lastSpiderOptions?.grip,
        rig: runtime.spider?.diagnostics,
        settling: runtime.settling?.settleProgress,
        selection: [...(runtime.selection ?? [])].map((r) => [r.startOffset, r.endOffset]),
      });
    };
    runtime.summon({ personality, followMouse: true });
  }, personality);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.attackErrors = errors;
  await page.waitForTimeout(1550);
  return page;
}
async function aim(page, id = 'target-a') {
  const p = await page.locator('#' + id).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + 80, y: r.y + 14 };
  });
  await page.mouse.move(p.x, p.y);
}
async function phase(page, name) {
  await page.waitForFunction((name) => runtime.mode === name, name, {
    timeout: 10000,
    polling: 'raf',
  });
}

for (const [personality, min, max] of [
  ['curious', 150, 300],
  ['feral', 60, 120],
  ['dreamy', 300, 550],
]) {
  test(
    `${personality}: one hunt resolves the exact footprint before anticipation and settles`,
    { timeout: 16000 },
    async () => {
      const page = await fixture(personality);
      try {
        await aim(page);
        await page.waitForFunction(
          () => runtime.fragments.length === 1 && runtime.fragments[0].settleProgress === 1,
        );
        const data = await page.evaluate(() => ({
          trace,
          text: runtime.fragments[0].target.text,
          limit: Number(runtime.host.dataset.anticipationMs),
        }));
        const first = (name) => data.trace.find((x) => x.mode === name);
        const notice = first('notice'),
          investigate = first('investigate'),
          lock = first('lock'),
          prepare = first('prepare'),
          strike = first('strike'),
          settle = first('settle');
        assert.ok(notice && investigate && lock && prepare && strike && settle);
        assert.ok(
          notice.at < investigate.at &&
            investigate.at < lock.at &&
            lock.at < prepare.at &&
            prepare.at < strike.at &&
            strike.at < settle.at,
        );
        assert.equal(lock.count, 0);
        assert.equal(prepare.count, 0);
        assert.ok(data.limit >= min && data.limit <= max);
        assert.ok(strike.at - prepare.at >= min && strike.at - prepare.at <= max + 100);
        assert.ok(
          Array.from(lock.candidate.text).length <=
            (personality === 'feral' ? 30 : personality === 'curious' ? 16 : 20),
        );
        assert.equal(lock.candidate.text, data.text);
        assert.deepEqual(lock.candidate, strike.impact);
        assert.deepEqual(prepare.selection, [[lock.candidate.start, lock.candidate.end]]);
        assert.deepEqual(
          [
            prepare.selector.rect.x,
            prepare.selector.rect.y,
            prepare.selector.rect.width,
            prepare.selector.rect.height,
          ],
          lock.candidate.rect,
        );
        assert.equal(prepare.selector.phase, 'prepare');
        assert.ok(prepare.grip, 'preparation brings a front claw near the recorded contact');
        assert.ok(data.trace.some((x) => x.mode === 'settle' && x.settling > 0 && x.settling < 1));
        for (const frame of data.trace.filter((x) => x.rig)) {
          assert.equal(frame.rig.finite, true);
          assert.ok(frame.rig.maxReach <= frame.rig.reachLimit + 0.01);
          assert.ok(frame.rig.maxBoneLength <= frame.rig.boneLimit + 0.01);
        }
      } finally {
        assert.deepEqual(page.attackErrors, []);
        await page.close();
      }
    },
  );
}

test(
  'new pointer intent replaces preparation, and a committed selector stays on its real impact until latest intent takes over',
  { timeout: 25000 },
  async () => {
    const page = await fixture();
    try {
      await aim(page);
      await phase(page, 'prepare');
      await aim(page, 'target-b');
      await page.waitForFunction(() => runtime.candidate?.element.id === 'target-b');
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      await phase(page, 'strike');
      await aim(page, 'target-a');
      await page.waitForFunction(
        () => runtime.hover?.target.element.id === 'target-a' && !!runtime.current,
      );
      const impact = await page.evaluate(() => ({
        target: runtime.current.target.element.id,
        selectedX: runtime.lastSpiderOptions.selector.rect.x,
        actualX: runtime.current.target.rect.x,
      }));
      assert.equal(impact.target, 'target-b');
      assert.equal(impact.selectedX, impact.actualX);
      await page.waitForFunction(() => runtime.candidate?.element.id === 'target-a');
      const result = await page.evaluate(() => ({
        records: runtime.fragments.map((x) => x.target.element.id),
        mode: runtime.mode,
        settling: !!runtime.settling,
      }));
      assert.deepEqual(result.records, ['target-b']);
      assert.ok(['notice', 'investigate', 'lock', 'prepare'].includes(result.mode));
      assert.equal(
        result.settling,
        true,
        'latest intent starts while the previous material settles',
      );
    } finally {
      assert.deepEqual(page.attackErrors, []);
      await page.close();
    }
  },
);

test(
  'Pause freezes an uncommitted preparation and a committed impact; Reset removes all owned state',
  { timeout: 20000 },
  async () => {
    const page = await fixture();
    try {
      await aim(page);
      await phase(page, 'prepare');
      await page.locator('[data-cr4wler-root] .pause').click();
      const before = await page.evaluate(() => {
        return {
          mode: runtime.mode,
          age: runtime.candidateAge,
          time: runtime.phaseTime,
          text: runtime.candidate.text,
        };
      });
      await page.waitForTimeout(650);
      assert.deepEqual(
        await page.evaluate(() => ({
          mode: runtime.mode,
          age: runtime.candidateAge,
          time: runtime.phaseTime,
          text: runtime.candidate.text,
        })),
        before,
      );
      await page.locator('[data-cr4wler-root] .pause').click();
      await phase(page, 'strike');
      await page.locator('[data-cr4wler-root] .pause').click();
      const progress = await page.evaluate(() => runtime.current.progress);
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(() => runtime.current.progress), progress);
      await page.evaluate(() => runtime.restore());
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
      assert.equal(
        await page.evaluate(
          () => [...CSS.highlights.keys()].filter((x) => x.startsWith('cr4wler-')).length,
        ),
        0,
      );
    } finally {
      assert.deepEqual(page.attackErrors, []);
      await page.close();
    }
  },
);

for (const interruption of ['remove', 'change', 'hide', 'nested-scroll', 'wheel']) {
  test(`preparation safely cancels on ${interruption}`, { timeout: 16000 }, async () => {
    const page = await fixture();
    try {
      await aim(page);
      await phase(page, 'prepare');
      await page.evaluate((kind) => {
        const el = document.querySelector('#target-a');
        if (kind === 'remove') el.remove();
        if (kind === 'change') el.textContent = 'Author changed this source';
        if (kind === 'hide') el.hidden = true;
        if (kind === 'nested-scroll') document.querySelector('#nested').scrollTop = 90;
        if (kind === 'wheel') window.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }));
      }, interruption);
      await page.waitForTimeout(700);
      assert.equal(
        await page.evaluate(
          () => runtime.fragments.filter((x) => x.target.element.id === 'target-a').length,
        ),
        0,
      );
      assert.equal(await page.evaluate(() => !!runtime.candidate?.text.includes('Amber')), false);
      assert.equal(await page.evaluate(() => runtime.current !== null), false);
      assert.equal(
        await page.evaluate(() => runtime.lastSpiderOptions?.selector?.phase === 'strike'),
        false,
      );
    } finally {
      assert.deepEqual(page.attackErrors, []);
      await page.close();
    }
  });
}

test(
  'reduced motion closes impact statically and abandons preparation without phantom controls',
  { timeout: 16000 },
  async () => {
    const page = await fixture();
    try {
      await aim(page);
      await phase(page, 'prepare');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      assert.equal(await page.evaluate(() => runtime.candidate), null);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForTimeout(150);
      await aim(page, 'target-b');
      await phase(page, 'strike');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(600);
      assert.deepEqual(
        await page.evaluate(() => runtime.fragments.map((x) => [x.progress, x.settleProgress])),
        [[1, 1]],
      );
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 1);
      await page.evaluate(() => runtime.restore());
      assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
    } finally {
      assert.deepEqual(page.attackErrors, []);
      await page.close();
    }
  },
);

for (const interruption of ['remove', 'change', 'hide']) {
  test(
    `committed impact safely releases an invalid source on ${interruption}`,
    { timeout: 16000 },
    async () => {
      const page = await fixture();
      try {
        await aim(page);
        await phase(page, 'strike');
        await page.evaluate((kind) => {
          const el = document.querySelector('#target-a');
          if (kind === 'remove') el.remove();
          if (kind === 'change') el.textContent = 'New author text';
          if (kind === 'hide') el.hidden = true;
        }, interruption);
        await page.waitForTimeout(90);
        assert.equal(await page.evaluate(() => !!runtime.current), false);
        assert.equal(
          await page.evaluate(() => runtime.lastSpiderOptions?.selector?.phase === 'strike'),
          false,
        );
        await page.evaluate(() => runtime.restore());
        assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
        assert.deepEqual(page.attackErrors, []);
      } finally {
        await page.close();
      }
    },
  );
}

test(
  'leaving during notice clears the uncommitted text highlight',
  { timeout: 12000 },
  async () => {
    const page = await fixture();
    try {
      await aim(page);
      await page.waitForFunction(
        () => runtime.hover && !runtime.candidate && runtime.selection.size > 0,
        null,
        { polling: 'raf' },
      );
      await page.mouse.move(-2, -2);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => runtime.selection.size), 0);
      assert.equal(await page.evaluate(() => runtime.candidate), null);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      assert.deepEqual(page.attackErrors, []);
    } finally {
      await page.close();
    }
  },
);
