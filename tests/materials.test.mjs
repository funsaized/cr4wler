import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { serve } from '../scripts/serve.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

let browser, server, base, helpers;
before(async () => {
  server = await serve(0);
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const bundle = await build({
    stdin: {
      contents:
        "import { targetAtPoint, scanTargets } from './src/targets'; globalThis.materialHelpers = { targetAtPoint, scanTargets };",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
  });
  helpers = bundle.outputFiles[0].text;
});
after(async () => {
  await browser?.close();
  server?.close();
});
async function fixture(theme = 'light') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/materials.html?autostart=off&theme=${theme}`);
  await page.addScriptTag({ content: helpers });
  await page.evaluate(() => {
    globalThis.runtime = __cr4wlerPlayground.engine;
  });
  return page;
}
async function point(page, id) {
  return page.locator('#' + id).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: el.id === 'sample-card' ? r.bottom - 7 : r.y + r.height / 2 };
  });
}
async function strike(page, id, personality = 'curious') {
  await page.evaluate(
    ({ id, personality }) => {
      if (!runtime.status().active) runtime.summon({ followMouse: true, personality });
      runtime.configure({ personality });
      if (!runtime.status().paused) runtime.pause();
      const el = document.getElementById(id),
        r = el.getBoundingClientRect();
      const target = materialHelpers.targetAtPoint(
        r.x + r.width / 2,
        id === 'sample-card' ? r.bottom - 7 : r.y + r.height / 2,
        () => true,
      );
      if (!target) throw new Error('Missing target: ' + id);
      runtime.candidate = target;
      runtime.strike();
      if (!runtime.current) throw new Error('Strike did not commit: ' + id);
      runtime.current.progress = 1;
      runtime.refreshGeometry();
      runtime.current = null;
    },
    { id, personality },
  );
}

for (const personality of ['curious', 'feral', 'dreamy']) {
  test(
    `${personality}: actual pointer hunts all materials on light and dark pages, then restores exactly`,
    { timeout: 100000 },
    async () => {
      for (const theme of ['light', 'night']) {
        const page = await fixture(theme);
        const original = await page.locator('main').innerHTML();
        const requests = [],
          errors = [];
        page.on('request', (req) => requests.push(req.url()));
        page.on('pageerror', (err) => errors.push(err.message));
        try {
          await page.evaluate(
            (personality) => runtime.summon({ personality, followMouse: true }),
            personality,
          );
          for (const id of [
            'sample-text',
            'sample-image',
            'sample-card',
            'sample-button',
            'sample-rule',
            'sample-foreign',
          ]) {
            const p = await point(page, id);
            await page.mouse.move(p.x, p.y);
            try {
              await page.waitForFunction(
                (id) =>
                  runtime.fragments.some((r) => r.target.element.id === id && r.progress === 1),
                id,
                { timeout: 14000 },
              );
            } catch (error) {
              const state = await page.evaluate(() => ({
                phase: runtime.status().phase,
                candidate: runtime.candidate?.element.id,
                hover: runtime.hover?.target.element.id,
                records: runtime.fragments.map((r) => r.target.element.id),
                position: runtime.spider.position,
                destination: runtime.destination,
              }));
              throw new Error(
                `${personality}/${theme}/${id}: ${error.message}; ${JSON.stringify(state)}`,
              );
            }
          }
          await page.evaluate(() => runtime.pause());
          const records = await page.evaluate(() =>
            runtime.fragments.map((r) => ({
              id: r.target.element.id,
              material: r.target.material ?? 'text',
              shards: r.shards.length,
              text: r.target.text,
              complete: r.shards.map((s) => s.text).join(''),
              colors: r.shards.map((s) => s.color),
              sourceColor: r.target.color,
              bitmap: !!r.materialPaint?.bitmap,
              fallback: r.materialPaint?.fallback,
              movedTiles: r.shards.filter((s) => s.kind === 'tile' && Math.hypot(s.dx, s.dy) > 0)
                .length,
              finite: r.shards.every((s) =>
                [s.x, s.y, s.dx, s.dy, s.rotation].every(Number.isFinite),
              ),
              positiveImpulse: r.shards
                .filter((s) => Math.hypot(s.dx, s.dy) > 0)
                .every((s) => s.dx * r.impact.dx + s.dy * r.impact.dy > 0),
            })),
          );
          assert.deepEqual(
            records.map((r) => r.material),
            ['text', 'image', 'panel', 'panel', 'rule', 'image'],
          );
          assert.ok(records.every((r) => r.finite && r.positiveImpulse && r.shards <= 16));
          const text = records[0];
          assert.equal(text.complete, text.text);
          assert.ok(
            text.text.length <=
              (personality === 'curious' ? 16 : personality === 'feral' ? 30 : 20),
          );
          assert.ok(text.colors.every((c) => c === text.sourceColor));
          assert.equal(records[1].bitmap, true);
          assert.equal(
            records[1].movedTiles,
            personality === 'feral' ? 4 : personality === 'dreamy' ? 2 : 1,
          );
          assert.equal(records[2].bitmap, true);
          assert.equal(records[3].bitmap, true);
          assert.equal(records[5].bitmap, false);
          assert.equal(records[5].fallback, 'origin');
          const before = await page.evaluate(() =>
            runtime.fragments.map((r) => r.shards.map((s) => [s.dx, s.dy])),
          );
          await page.evaluate(() => scrollTo(0, 1300));
          await page.waitForTimeout(150);
          assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0);
          await page.evaluate(() => scrollTo(0, 0));
          await page.waitForTimeout(150);
          assert.deepEqual(
            await page.evaluate(() =>
              runtime.fragments.map((r) => r.shards.map((s) => [s.dx, s.dy])),
            ),
            before,
          );
          assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 6);
          await page.evaluate(() => runtime.restore());
          assert.equal(await page.locator('main').innerHTML(), original);
          assert.equal(await page.locator('#fixture-input').inputValue(), 'A note that stays');
          assert.deepEqual(await page.evaluate(() => materialActions), {
            click: 0,
            input: 0,
            change: 0,
            submit: 0,
          });
          assert.deepEqual(requests, []);
          assert.deepEqual(errors, []);
        } finally {
          await page.close();
        }
      }
    },
  );
}

test('material ownership releases on source edits/replacement and Reset preserves user styles and values', async () => {
  const page = await fixture();
  try {
    await strike(page, 'sample-image');
    await strike(page, 'sample-button');
    await strike(page, 'sample-card');
    await page.evaluate(() => {
      document.querySelector('#sample-button').textContent = 'A new user label';
      document.querySelector('#sample-button').style.color = 'rgb(160, 60, 40)';
      document.querySelector('#sample-card').append(document.createElement('input'));
      document.querySelector('#sample-image').replaceWith(
        Object.assign(document.createElement('p'), {
          id: 'replacement',
          textContent: 'New page content',
        }),
      );
      document.querySelector('#fixture-input').value = 'User edit survives';
    });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
    assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0);
    const expected = await page.locator('main').innerHTML();
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.locator('main').innerHTML(), expected);
    await strike(page, 'sample-button');
    await page.evaluate(() => (document.querySelector('#sample-button').style.opacity = '0'));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0);
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.locator('#sample-button').evaluate((el) => el.style.opacity), '0');
    assert.equal(await page.locator('#fixture-input').inputValue(), 'User edit survives');
    assert.equal(
      await page.locator('#sample-button').evaluate((el) => el.style.color),
      'rgb(160, 60, 40)',
    );
  } finally {
    await page.close();
  }
});

test('Pause, interruption, reduced motion, nested scroll and Reset preserve committed material ownership', async () => {
  const page = await fixture();
  try {
    await strike(page, 'sample-card', 'dreamy');
    await page.evaluate(() => {
      const record = runtime.fragments[0];
      record.progress = 0.25;
      runtime.current = record;
      runtime.refreshGeometry();
    });
    const frozen = await page.locator('[data-cr4wler-root] .piece').evaluate((el) => el.innerHTML);
    await page.waitForTimeout(120);
    assert.equal(
      await page.locator('[data-cr4wler-root] .piece').evaluate((el) => el.innerHTML),
      frozen,
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => runtime.current), null);
    assert.equal(await page.evaluate(() => runtime.fragments[0].progress), 1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
    await strike(page, 'nested-rule');
    await page.evaluate(() => (document.querySelector('.scroller').scrollTop = 10));
    await page.waitForTimeout(100);
    const offset = await page.evaluate(() => {
      const r = runtime.fragments.find((r) => r.target.element.id === 'nested-rule');
      return new DOMMatrix(r.el.style.transform).m42 - r.target.element.getBoundingClientRect().y;
    });
    assert.ok(Math.abs(offset) < 0.1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('*')].some((el) =>
          el.getAttributeNames().some((a) => a.startsWith('data-cr4wler-mask-')),
        ),
      ),
      false,
    );
  } finally {
    await page.close();
  }
});

test('editable/sensitive controls, submitters, ignored and complex panels stay outside material discovery', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      document.querySelector('.protected').removeAttribute('data-cr4wler-ignore');
      const fixtures = [
        '<button id="default-button">Default submitter</button>',
        '<button type="button" form="fixture-form" id="external-form">External form</button>',
        '<div class="checkout"><button type="button" id="sensitive-button">Sensitive</button></div>',
        '<button type="button" id="label-only">Sign in</button>',
        '<button type="button" id="label-child"><span>Log in</span></button>',
        '<article class="card" id="complex-card"><input value="Edit me" /></article>',
        '<article class="card" id="nested-sensitive"><span class="billing">Sensitive descendant</span></article>',
        '<div contenteditable="true"><button type="button" id="editable-button">Editable</button></div>',
        '<button type="button" id="ignored" data-cr4wler-ignore>Ignored</button>',
      ];
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:40px;top:730px';
      document.body.append(box);
      const probe = (el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.id,
          target:
            materialHelpers.targetAtPoint(r.x + r.width / 2, r.y + r.height / 2, () => true)
              ?.element.id ?? null,
        };
      };
      const result = ['fixture-input', 'fixture-password', 'fixture-editor'].map((id) =>
        probe(document.getElementById(id)),
      );
      for (const html of fixtures) {
        box.innerHTML = html;
        result.push(probe(box.querySelector('[id]')));
      }
      return result;
    });
    assert.ok(
      result.every((r) => r.target === null),
      JSON.stringify(result),
    );
  } finally {
    await page.close();
  }
});

test('masked panels remeasure safely after style/size changes; image source changes and hidden labels release pixels', async () => {
  const page = await fixture();
  try {
    await strike(page, 'sample-card');
    await page.evaluate(() => {
      document.querySelector('#sample-card').style.cssText =
        'width:260px;border-color:rgb(70,100,80)';
    });
    await page.waitForTimeout(100);
    assert.deepEqual(
      await page.evaluate(() => {
        const r = runtime.fragments[0];
        return {
          bitmap: !!r.materialPaint.bitmap,
          border: r.materialPaint.border,
          masked: r.sourceMasked,
        };
      }),
      { bitmap: true, border: 'rgb(70, 100, 80)', masked: true },
    );
    await strike(page, 'sample-image');
    await page.evaluate(() =>
      document.querySelector('#sample-image').setAttribute('src', 'material-sample.png?changed=1'),
    );
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() =>
        runtime.fragments.some((r) => r.target.element.id === 'sample-image'),
      ),
      false,
    );
    await page.evaluate(
      () => (document.querySelector('#sample-card h3').style.visibility = 'hidden'),
    );
    await page.waitForTimeout(100);
    const state = await page.evaluate(() => {
      const r = runtime.fragments[0];
      return {
        bitmap: !!r.materialPaint.bitmap,
        fallback: r.materialPaint.fallback,
        masked: r.sourceMasked,
        text: r.el.textContent,
      };
    });
    assert.deepEqual(state, { bitmap: false, fallback: 'appearance', masked: false, text: '' });
    const expected = await page.locator('main').innerHTML();
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.locator('main').innerHTML(), expected);
  } finally {
    await page.close();
  }
});

test('an owned panel mask removes nested original foot support immediately and restores it on unmask/Reset', async () => {
  const page = await fixture();
  const directory = 'artifacts/item3-round2-engine';
  await mkdir(directory, { recursive: true });
  try {
    const before = await page.evaluate(() => {
      const card = document.querySelector('#sample-card');
      card.querySelector('h3').innerHTML = '<section><span>A nested field note</span></section>';
      runtime.summon({ followMouse: true, personality: 'curious' });
      runtime.pause();
      const spider = runtime.spider;
      runtime.lastSpiderOptions = {
        personality: 'curious',
        intensity: 0.55,
        reducedMotion: false,
      };
      spider.update(
        0,
        0,
        { x: 1000, y: 160 },
        { ...runtime.lastSpiderOptions, reducedMotion: true },
      );
      spider.update(0, 0, spider.position, runtime.lastSpiderOptions);
      spider.age = 2;
      spider.resetStance();
      const nested = card.querySelector('span');
      const r = nested.getBoundingClientRect();
      globalThis.supportTime = 1;
      globalThis.updateSupports = () =>
        runtime.pageSurfaces.update(
          (supportTime += 0.25),
          ++runtime.boundsRevision,
          spider.position,
          spider.position,
          [
            { x: r.x + r.width / 2, y: r.y + r.height / 2 },
            { x: 325, y: 235 },
          ],
          spider.contactIds,
          spider.surfaceContacts,
        );
      for (let i = 0; i < 8; i++) updateSupports();
      const anchors = [...runtime.pageSurfaces.anchors.entries()];
      const source = anchors.find(
        ([node, anchor]) => node === nested.firstChild && anchor.segments.length,
      );
      if (!source) throw new Error('Nested text support was not discovered');
      globalThis.originalSupportIds = anchors
        .filter(([node]) => card.contains(node))
        .flatMap(([, anchor]) => anchor.segments.map((s) => s.id));
      const segment = source[1].segments[0];
      const leg = spider.legs[2];
      const point = {
        x: (segment.a.x + segment.b.x) / 2,
        y: (segment.a.y + segment.b.y) / 2,
      };
      for (const p of [leg.foot, leg.from, leg.to]) Object.assign(p, point);
      leg.contact = { id: segment.id, fraction: 0.5 };
      leg.rested = 0;
      spider.update(0, 0, spider.position, {
        ...runtime.lastSpiderOptions,
        surfaces: updateSupports(),
      });
      spider.render();
      return {
        planted: leg.contact?.id === segment.id,
        nested: anchors.filter(([node]) => card.contains(node)).length,
        outside: anchors.filter(([node]) => !card.contains(node)).length,
      };
    });
    assert.ok(before.planted && before.nested >= 2 && before.outside > 0, JSON.stringify(before));
    await page.screenshot({ path: `${directory}/subtree-before.png`, caret: 'initial' });
    await strike(page, 'sample-card');
    const masked = await page.evaluate(() => {
      const card = document.querySelector('#sample-card');
      const cache = runtime.pageSurfaces.update(
        supportTime,
        runtime.pageSurfaces.revision,
        runtime.spider.position,
        runtime.spider.position,
        [],
        runtime.spider.contactIds,
        runtime.spider.surfaceContacts,
      );
      const immediate = cache.every((s) => !originalSupportIds.includes(s.id));
      let fixed = true;
      for (let i = 0; i < 24; i++) {
        const surfaces = updateSupports();
        runtime.spider.update(1 / 60, i / 60, runtime.spider.position, {
          ...runtime.lastSpiderOptions,
          surfaces,
        });
        runtime.spider.render();
        const d = runtime.spider.diagnostics;
        fixed &&= d.finite && d.maxReach <= d.reachLimit + 0.01 && d.maxBoneLength <= d.boneLimit;
      }
      return {
        masked: runtime.fragments[0].sourceMasked,
        moved: runtime.fragments[0].shards.some((s) => Math.hypot(s.dx, s.dy) > 0),
        filter: getComputedStyle(card).filter,
        immediate,
        nested: [...runtime.pageSurfaces.anchors.keys()].filter((node) => card.contains(node))
          .length,
        originalContacts: runtime.spider.contactIds.filter((id) => originalSupportIds.includes(id)),
        outside: [...runtime.pageSurfaces.anchors.keys()].filter((node) => !card.contains(node))
          .length,
        fixed,
      };
    });
    assert.deepEqual(masked.originalContacts, []);
    assert.equal(masked.nested, 0);
    assert.ok(
      masked.masked && masked.moved && masked.immediate && masked.fixed && masked.outside > 0,
    );
    assert.equal(masked.filter, 'opacity(0)');
    await page.screenshot({ path: `${directory}/subtree-masked.png`, caret: 'initial' });
    // Unsupported paint keeps the real panel visible; this exercises unmask without deleting ownership.
    await page.evaluate(
      () => (document.querySelector('#sample-card').style.boxShadow = '0 0 2px black'),
    );
    await page.waitForTimeout(100);
    const unmasked = await page.evaluate(() => {
      for (let i = 0; i < 8; i++) updateSupports();
      const card = document.querySelector('#sample-card');
      return {
        masked: runtime.fragments[0].sourceMasked,
        fallback: runtime.fragments[0].materialPaint.fallback,
        nested: [...runtime.pageSurfaces.anchors.keys()].filter((node) => card.contains(node))
          .length,
        filter: getComputedStyle(card).filter,
      };
    });
    assert.ok(!unmasked.masked && unmasked.nested >= 2 && unmasked.filter === 'none');
    assert.equal(unmasked.fallback, 'appearance');
    await page.screenshot({ path: `${directory}/subtree-unmasked.png`, caret: 'initial' });
    const expected = await page.locator('main').innerHTML();
    await page.evaluate(() => {
      runtime.restore();
      runtime.summon({ followMouse: true });
      runtime.pause();
      Object.assign(runtime.spider.body, { x: 1000, y: 160 });
      for (let i = 0; i < 8; i++) {
        runtime.pageSurfaces.update(
          i + 1,
          i,
          runtime.spider.position,
          runtime.spider.position,
          [{ x: 1030, y: 255 }],
          [],
          [],
        );
      }
    });
    assert.ok(
      await page.evaluate(() =>
        [...runtime.pageSurfaces.anchors.keys()].some((node) =>
          document.querySelector('#sample-card span').contains(node),
        ),
      ),
    );
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.locator('main').innerHTML(), expected);
    await writeFile(
      `${directory}/subtree-result.json`,
      JSON.stringify({ before, masked, unmasked }, null, 2),
    );
  } finally {
    await page.close();
  }
});

test('initial independent transforms and complex clipping cannot become object material', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async () => {
      const image = document.querySelector('#sample-image');
      const parent = image.parentElement;
      const cases = [
        [image, 'rotate:12deg'],
        [image, 'scale:1.1'],
        [image, 'translate:8px 3px'],
        [image, 'clip-path:inset(10%)'],
        [image, '-webkit-mask-image:linear-gradient(black,transparent)'],
        [image, '-webkit-mask-box-image:linear-gradient(black,transparent)'],
        [parent, 'transform:rotate(8deg)'],
        [parent, 'overflow:hidden;border-radius:20px'],
      ];
      const results = [];
      for (const [node, style] of cases) {
        node.style.cssText = style;
        const r = image.getBoundingClientRect();
        const hit = materialHelpers.targetAtPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
          () => true,
        );
        const candidates = await materialHelpers.scanTargets(new AbortController().signal);
        results.push({
          style,
          pointer: hit?.material ?? null,
          scanned: candidates.some((t) => t.element === image && t.material === 'image'),
        });
        node.removeAttribute('style');
      }
      return results;
    });
    assert.ok(
      result.every((r) => r.pointer !== 'image' && !r.scanned),
      JSON.stringify(result),
    );
  } finally {
    await page.close();
  }
});

test('post-attack source or ancestor paint changes release stale masks and preserve author styles', async () => {
  const directory = 'artifacts/item3-round2-engine';
  await mkdir(directory, { recursive: true });
  const scenarios = [
    ['source-rotate', false, 'rotate:12deg'],
    ['source-transform', false, 'transform:rotate(9deg)'],
    ['source-scale', false, 'scale:1.1'],
    ['source-translate', false, 'translate:9px 3px'],
    ['source-clip', false, 'clip-path:inset(10%)'],
    ['source-mask', false, '-webkit-mask-image:linear-gradient(black,transparent)'],
    ['source-filter', false, 'filter:opacity(0.5)'],
    ['source-extent', false, 'width:400px'],
    ['ancestor-transform', true, 'transform:rotate(7deg)'],
    ['ancestor-clip', true, 'clip-path:inset(5%)'],
    ['ancestor-rounded', true, 'overflow:hidden;border-radius:20px'],
    ['ancestor-box-mask', true, '-webkit-mask-box-image:linear-gradient(black,transparent)'],
  ];
  const results = [];
  for (const id of ['sample-card', 'sample-image']) {
    const page = await fixture(id === 'sample-card' ? 'light' : 'night');
    try {
      for (const [name, ancestor, style] of scenarios) {
        await strike(page, id);
        assert.equal(await page.evaluate(() => runtime.fragments[0].sourceMasked), true);
        if (name === 'source-rotate')
          await page.screenshot({
            path: `${directory}/${id}-before-user-paint.png`,
            caret: 'initial',
          });
        const authored = await page.locator('#' + id).evaluate(
          (el, { ancestor, style }) => {
            const node = ancestor ? el.parentElement : el;
            node.style.cssText = style;
            return node.style.cssText;
          },
          { ancestor, style },
        );
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => runtime.fragments.length), 0, `${id}/${name}`);
        assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0, `${id}/${name}`);
        const state = await page.locator('#' + id).evaluate(
          (el, ancestor) => ({
            style: (ancestor ? el.parentElement : el).style.cssText,
            masked: el.getAttributeNames().some((key) => key.startsWith('data-cr4wler-mask-')),
            filter: getComputedStyle(el).filter,
          }),
          ancestor,
        );
        assert.equal(state.style, authored);
        assert.equal(state.masked, false);
        if (name === 'source-filter') assert.equal(state.filter, 'opacity(0.5)');
        if (name === 'source-rotate' || name === 'ancestor-rounded')
          await page.screenshot({
            path: `${directory}/${id}-${name}-released.png`,
            caret: 'initial',
          });
        const expected = await page.locator('main').innerHTML();
        await page.evaluate(() => runtime.restore());
        assert.equal(await page.locator('main').innerHTML(), expected);
        results.push({ id, name, released: true, stylePreserved: true, exactReset: true });
        await page
          .locator('#' + id)
          .evaluate(
            (el, ancestor) => (ancestor ? el.parentElement : el).removeAttribute('style'),
            ancestor,
          );
      }
    } finally {
      await page.close();
    }
  }
  await writeFile(`${directory}/paint-result.json`, JSON.stringify(results, null, 2));
});

test('material bitmaps and active/settled fragments stay bounded without silently dropping old marks', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(async () => {
      runtime.summon({ followMouse: true, personality: 'feral' });
      runtime.pause();
      for (let i = 0; i < 80; i++) {
        const img = document.createElement('img');
        img.src = document.querySelector('#sample-image').src;
        img.style.cssText = 'position:absolute;left:600px;top:300px;width:270px;height:180px';
        img.id = 'budget-' + i;
        document.body.append(img);
        await img.decode();
        // Loaded identical resource; deterministic fixture strikes use the real engine.
        const r = img.getBoundingClientRect();
        const target = materialHelpers.targetAtPoint(r.x + 80, r.y + 80, () => true);
        runtime.candidate = target;
        runtime.strike();
        if (runtime.current) runtime.current.progress = 1;
        runtime.current = null;
      }
      runtime.refreshGeometry();
      const records = runtime.fragments;
      return {
        records: records.length,
        dom: runtime.pieces.children.length,
        pixels: runtime.bitmapPixels(),
        active: runtime.current?.shards.length ?? 0,
        settled: records.reduce((n, r) => n + r.shards.length, 0),
        max: Math.max(...records.map((r) => r.shards.length)),
        overflow: !!runtime.overflow,
        fallbacks: records.filter((r) => r.materialPaint?.fallback === 'budget').length,
      };
    });
    assert.equal(result.records, 80);
    assert.equal(result.dom, 72);
    assert.equal(result.active, 0);
    assert.ok(result.max <= 16 && result.pixels <= 1024 * 1024 && result.settled <= 80 * 16);
    assert.ok(result.overflow && result.fallbacks > 0);
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.evaluate(() => runtime.bitmapPixels()), 0);
  } finally {
    await page.close();
  }
});
