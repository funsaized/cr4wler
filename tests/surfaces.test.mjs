import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';

let browser, bundle;
before(async () => {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const result = await build({
    stdin: {
      contents:
        "import { PageSurfaces } from './src/surfaces'; import { Spider } from './src/spider'; import { Cr4wler } from './src/engine'; globalThis.Cr4wler = Cr4wler; globalThis.PageSurfaces = PageSurfaces; globalThis.Spider = Spider;",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'iife',
  });
  bundle = result.outputFiles[0].text;
});
after(async () => browser?.close());
async function fixture() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  // Give the actual engine a trustworthy local origin without a network server.
  await page.route('http://localhost/surface-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  );
  await page.goto('http://localhost/surface-fixture');
  await page.setContent(
    `<style>body{margin:0;background:#101725;color:#eee;font:18px/28px system-ui;height:2000px}article{position:absolute;left:180px;top:170px;width:620px;height:220px;background:#25334a;border:2px solid #607b94}p{margin:24px}button{position:absolute;left:860px;top:300px;width:140px;height:50px}img{position:absolute;left:830px;top:120px;width:160px;height:100px}#fixed{position:fixed;left:170px;top:460px;width:620px;height:40px;background:#415776}#nested{position:absolute;left:170px;top:570px;width:640px;height:200px;overflow:auto;border:3px solid #617b95}#nested p{height:700px}canvas{position:fixed;inset:0;pointer-events:none}</style><article><p>Visible lines are meaningful places for each careful foot to settle.</p><p>A second line offers quiet support while the body turns and reaches.</p></article><button type="button">Real page action</button><img alt="A synthetic image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='100'%3E%3Crect width='160' height='100' fill='%23495570'/%3E%3C/svg%3E"><div id="fixed">Fixed visible text remains anchored to the viewport.</div><div id="nested"><p>A nested line follows only its own scroll container.</p></div><canvas data-cr4wler-ignore></canvas>`,
  );
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    globalThis.map = new PageSurfaces();
    globalThis.revision = 0;
    globalThis.tick = 0;
    globalThis.surfacesAt = (p, dest = p, feet = []) =>
      map.update((tick += 0.25), ++revision, p, dest, feet, []);
  });
  return page;
}

test('local surfaces include text, card, image and button edges without touching page actions or layout', async () => {
  const page = await fixture();
  try {
    const before = await page.locator('body').innerHTML();
    const data = await page.evaluate(() => {
      globalThis.actions = 0;
      document.addEventListener('click', () => actions++);
      let segments;
      for (let i = 0; i < 5; i++)
        segments = surfacesAt({ x: 700, y: 300 }, { x: 920, y: 330 }, [
          { x: 400, y: 220 },
          { x: 900, y: 160 },
          { x: 900, y: 325 },
        ]);
      return {
        kinds: [...new Set(segments.map((s) => s.kind))],
        diagnostics: map.diagnostics,
        actions,
      };
    });
    for (const kind of ['text', 'card', 'image', 'button'])
      assert.ok(data.kinds.includes(kind), kind);
    assert.ok(data.diagnostics.anchors <= 40);
    assert.equal(data.actions, 0);
    assert.equal(await page.locator('body').innerHTML(), before);
    const cache = await page.evaluate(() => {
      const reads = map.diagnostics.reads;
      for (let i = 0; i < 100; i++)
        map.update(tick, revision, { x: 700, y: 300 }, { x: 700, y: 300 }, [], []);
      return map.diagnostics.reads - reads;
    });
    assert.equal(cache, 0, 'repeated frames consume cached geometry');
  } finally {
    await page.close();
  }
});

test('unsupported clip paths, masks and curved clipping fall back without invisible footholds', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      const shapes = [
        'clip-path:polygon(20% 0,80% 0,100% 100%,0 100%)',
        'mask-image:linear-gradient(90deg,transparent,black 40%,black 60%,transparent)',
        '-webkit-mask-box-image:linear-gradient(black,transparent)',
        'border-radius:50%',
        'border-radius:40px / 20px',
        'rotate:25deg',
        'overflow:hidden;border-radius:24px',
      ];
      return shapes.map((shape) => {
        document.body.innerHTML = `<div style="position:fixed;left:350px;top:260px;width:250px;height:130px;background:#456;${shape}"><span style="position:absolute;left:0;top:0;width:300px;">A painted foothold must actually be visible.</span></div><canvas data-cr4wler-ignore></canvas>`;
        map.clear();
        let surfaces;
        for (let f = 0; f < 6; f++)
          surfaces = surfacesAt({ x: 470, y: 320 }, { x: 580, y: 320 }, [
            { x: 390, y: 265 },
            { x: 570, y: 380 },
          ]);
        // Unclipped child text is valid for a merely rounded box. Remove it to
        // isolate rejection of the box's unsupported percentage/ellipse shape.
        if (shape.startsWith('border-radius')) {
          document.querySelector('span').remove();
          surfaces = surfacesAt({ x: 470, y: 320 });
        }
        const spider = new Spider(document.querySelector('canvas'));
        spider.resize(1200, 850);
        const dest = { x: 470, y: 320 };
        const opts = { personality: 'curious', reducedMotion: false, intensity: 0.6, surfaces };
        spider.update(0, 0, dest, { ...opts, reducedMotion: true });
        spider.age = 2;
        for (let f = 0; f < 120; f++) spider.update(1 / 60, f / 60, dest, opts);
        spider.render();
        return { shape, surfaces, rig: spider.diagnostics };
      });
    });
    for (const item of result) {
      // The simple rounded container itself still has safe straight edges;
      // descendants clipped by its curved corners are conservatively excluded.
      if (item.shape.startsWith('overflow'))
        assert.ok(item.surfaces.every((s) => s.kind !== 'text'));
      else {
        assert.equal(item.surfaces.length, 0, item.shape);
        assert.equal(item.rig.pageMovement, 'fallback', item.shape);
        assert.ok(item.rig.legs.every((l) => !l.contact));
      }
      assert.ok(item.rig.finite);
      assert.ok(item.rig.maxBoneLength <= item.rig.boneLimit + 0.01);
    }
    const scaled = await page.evaluate(() => {
      document.body.innerHTML =
        '<div style="position:fixed;left:350px;top:260px;width:120px;height:80px;background:#456;border-radius:20px;transform:scale(2);transform-origin:0 0"></div><canvas data-cr4wler-ignore></canvas>';
      map.clear();
      let surfaces;
      for (let i = 0; i < 5; i++) surfaces = surfacesAt({ x: 450, y: 300 });
      return surfaces.find((s) => s.a.y === 260 && s.b.y === 260);
    });
    assert.ok(scaled);
    assert.equal(scaled.min, 40 / 240, 'pixel radius scales with the actual painted edge');
    const rootClips = await page.evaluate(() => {
      return ['clip-path', 'mask-image'].map((property) => {
        document.documentElement.style.setProperty(
          property,
          property === 'clip-path' ? 'inset(0 20% 0 20%)' : 'linear-gradient(black, transparent)',
        );
        map.clear();
        let surfaces;
        for (let i = 0; i < 5; i++) surfaces = surfacesAt({ x: 450, y: 300 });
        document.documentElement.style.removeProperty(property);
        return { property, count: surfaces.length };
      });
    });
    for (const item of rootClips) assert.equal(item.count, 0, item.property + ' on root ancestor');
  } finally {
    await page.close();
  }
});

test('contacts use viewport geometry for document, fixed, clipped and nested scroll surfaces', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      const seeds = [
        { x: 400, y: 222 },
        { x: 400, y: 480 },
        { x: 400, y: 610 },
      ];
      let before;
      for (let i = 0; i < 5; i++)
        before = surfacesAt({ x: 470, y: 435 }, { x: 470, y: 435 }, seeds);
      const fixed = before.find((s) => s.kind === 'text' && s.a.y > 460 && s.a.y < 505);
      const nested = before.find((s) => s.kind === 'text' && s.a.y > 595);
      const doc = before.find((s) => s.kind === 'text' && s.a.y < 280);
      scrollBy(0, 70);
      document.querySelector('#nested').scrollTop = 80;
      const after = surfacesAt({ x: 470, y: 435 }, { x: 470, y: 435 }, seeds);
      return { fixed, nested, doc, after };
    });
    assert.ok(result.fixed && result.nested && result.doc, 'discover all three coordinate spaces');
    assert.equal(result.after.find((s) => s.id === result.fixed.id).a.y, result.fixed.a.y);
    assert.equal(result.after.find((s) => s.id === result.doc.id).a.y, result.doc.a.y - 70);
    assert.ok(
      !result.after.some((s) => s.id === result.nested.id),
      'nested line fully clipped after its own scroll',
    );
    const removed = await page.evaluate(() => {
      document.querySelector('#fixed').remove();
      return surfacesAt({ x: 470, y: 435 });
    });
    assert.ok(!removed.some((s) => s.id === result.fixed.id));
  } finally {
    await page.close();
  }
});

for (const personality of ['curious', 'dreamy', 'feral']) {
  test(`${personality} perches, traverses, reverses and releases invalid contacts with fixed bones`, async () => {
    const page = await fixture();
    try {
      const result = await page.evaluate((personality) => {
        const spider = new Spider(document.querySelector('canvas'));
        spider.resize(1200, 850);
        const start = { x: 500, y: 280 };
        const opts = { personality, intensity: 0.6, reducedMotion: false };
        spider.update(0, 0, start, { ...opts, reducedMotion: true });
        spider.age = 2;
        spider.hopCooldown = Infinity;
        let time = 0,
          contacts = 0,
          maxBone = 0,
          surfaceReleases = 0,
          minSupport = 8;
        const advance = (dest, frames, segments) => {
          for (let f = 0; f < frames; f++) {
            const surfaces =
              segments ??
              map.update(time, revision, spider.position, dest, spider.feet, spider.contactIds);
            spider.update(1 / 60, (time += 1 / 60), dest, { ...opts, surfaces });
            spider.render();
            const d = spider.diagnostics;
            if (
              !d.finite ||
              d.maxReach > d.reachLimit + 0.01 ||
              d.maxBoneLength > d.boneLimit + 0.01
            )
              throw new Error('invalid rig');
            contacts = Math.max(contacts, d.legs.filter((l) => l.contact).length);
            maxBone = Math.max(maxBone, d.maxBoneLength / d.boneLimit);
            // Real stance loss now releases into one entrance. Walking keeps
            // four supports; an airborne recovery deliberately has none.
            if (!spider.recovering)
              minSupport = Math.min(minSupport, d.legs.filter((l) => l.phase === 'stance').length);
            surfaceReleases = d.surfaceReleases;
          }
        };
        advance(start, 180);
        const perch = spider.diagnostics;
        const feet = spider.feet;
        advance(start, 120);
        const stable = JSON.stringify(feet) === JSON.stringify(spider.feet);
        for (const target of [
          { x: 670, y: 280 },
          { x: 600, y: 340 },
          { x: 400, y: 280 },
        ]) {
          advance(target, 240);
          if (Math.hypot(spider.position.x - target.x, spider.position.y - target.y) > 20)
            throw new Error(
              'trapped at boundary ' +
                JSON.stringify({
                  target,
                  body: spider.position,
                  legs: spider.legs,
                  surfaces: map.diagnostics,
                }),
            );
        }
        const before = spider.feet;
        document.querySelector('article').remove();
        revision++;
        advance(spider.position, 1, []);
        const releaseJump = Math.max(
          ...spider.feet.map((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y)),
        );
        advance(spider.position, 120, []);
        return {
          contacts,
          perch: perch.pageMovement,
          stable,
          maxBone,
          minSupport,
          surfaceReleases,
          releaseJump,
        };
      }, personality);
      assert.ok(result.contacts >= 2, JSON.stringify(result));
      assert.equal(result.perch, 'perch');
      assert.equal(result.stable, true, 'surface perching does not endlessly re-step');
      assert.ok(result.minSupport >= 4);
      assert.ok(result.surfaceReleases >= 1);
      assert.ok(result.releaseJump < 1, 'lift starts from last valid contact');
    } finally {
      await page.close();
    }
  });
}

test('fixed planted contacts ignore document delta; moving surfaces follow and invalid anchors lift smoothly', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      const spider = new Spider(document.querySelector('canvas'));
      spider.resize(1200, 850);
      const body = { x: 500, y: 280 };
      const opts = { personality: 'curious', intensity: 0.6, reducedMotion: false };
      spider.update(0, 0, body, { ...opts, reducedMotion: true });
      spider.age = 2;
      // DOM-measured geometry, with a viewport-fixed card surrounding the rig.
      document.querySelector('article').style.position = 'fixed';
      let time = 0;
      const step = (dt, delta = { x: 0, y: 0 }) => {
        const surfaces = map.update(
          time,
          ++revision,
          spider.position,
          body,
          spider.feet,
          spider.contactIds,
        );
        spider.update(dt, (time += dt), body, { ...opts, surfaces, surfaceDelta: delta });
        spider.render();
      };
      for (let i = 0; i < 180; i++) step(1 / 60);
      const contacts = spider.legs.map((l, i) => (l.contact ? i : -1)).filter((i) => i >= 0);
      const feet = spider.feet;
      scrollBy(0, 120);
      step(0, { x: 0, y: -120 });
      const fixedError = Math.max(
        ...contacts.map((i) =>
          Math.hypot(spider.feet[i].x - feet[i].x, spider.feet[i].y - feet[i].y),
        ),
      );
      const article = document.querySelector('article');
      article.style.transform = 'translate(6px, 4px)';
      const before = spider.feet;
      step(0);
      const movingError = Math.max(
        ...contacts.map((i) =>
          Math.hypot(spider.feet[i].x - before[i].x - 6, spider.feet[i].y - before[i].y - 4),
        ),
      );
      const last = spider.feet;
      article.style.transform = 'translate(900px, 0)';
      step(1 / 60);
      const jump = Math.max(
        ...spider.feet.map((p, i) => Math.hypot(p.x - last[i].x, p.y - last[i].y)),
      );
      return {
        contacts: contacts.length,
        fixedError,
        movingError,
        jump,
        diagnostics: spider.diagnostics,
      };
    });
    assert.ok(result.contacts >= 4);
    assert.ok(result.fixedError < 0.01, JSON.stringify(result));
    assert.ok(result.movingError < 0.01);
    assert.ok(result.jump < 1, 'invalid attachment must lift from prior valid point');
    assert.ok(result.diagnostics.surfaceReleases >= 4);
    assert.ok(result.diagnostics.maxBoneLength <= result.diagnostics.boneLimit + 0.01);
  } finally {
    await page.close();
  }
});

for (const personality of ['curious', 'dreamy', 'feral'])
  test(`${personality} crosses a modest measured gap and settles on support`, async () => {
    const page = await fixture();
    try {
      const result = await page.evaluate((personality) => {
        document.body.innerHTML =
          '<span id="left" style="position:fixed;left:300px;top:240px;width:280px;height:80px;border:2px solid white"></span><span id="right" style="position:fixed;left:615px;top:240px;width:300px;height:80px;border:2px solid white"></span><canvas data-cr4wler-ignore></canvas>';
        const segments = [...document.querySelectorAll('span')].flatMap((element, i) => {
          const r = element.getBoundingClientRect();
          return {
            id: String(i) + ':top',
            kind: 'card',
            a: { x: r.left, y: r.top },
            b: { x: r.right, y: r.top },
            min: 0,
            max: 1,
          };
        });
        const spider = new Spider(document.querySelector('canvas'));
        spider.resize(1200, 850);
        const opts = {
          personality,
          intensity: 0.6,
          reducedMotion: false,
          surfaces: segments,
        };
        const start = { x: 490, y: 280 };
        spider.update(0, 0, start, { ...opts, reducedMotion: true });
        spider.age = 2;
        let time = 0,
          hops = 0,
          maxHop = 0,
          previousRecovery = false;
        for (let i = 0; i < 660; i++) {
          const target = i < 180 ? start : { x: 760, y: 280 };
          spider.update(1 / 60, (time += 1 / 60), target, opts);
          spider.render();
          if (spider.recovering && !previousRecovery) {
            hops++;
            maxHop = Math.max(
              maxHop,
              Math.hypot(
                spider.recovery.to.x - spider.recovery.from.x,
                spider.recovery.to.y - spider.recovery.from.y,
              ),
            );
          }
          previousRecovery = spider.recovering;
          const d = spider.diagnostics;
          if (!d.finite || d.maxBoneLength > d.boneLimit + 0.01 || d.maxReach > d.reachLimit + 0.01)
            throw new Error('invalid crossing rig');
        }
        return {
          hops,
          maxHop,
          body: spider.position,
          contacts: spider.diagnostics.legs.filter((l) => l.contact).length,
          supports: spider.diagnostics.legs.filter((l) => l.phase === 'stance').length,
        };
      }, personality);
      if (personality === 'feral') assert.ok(result.hops >= 1, JSON.stringify(result));
      else assert.equal(result.hops, 0);
      assert.ok(result.maxHop <= 95 * 1.12 + 0.01);
      assert.ok(Math.hypot(result.body.x - 760, result.body.y - 280) < 15);
      assert.ok(result.supports >= 4);
      if (personality === 'feral') assert.ok(result.contacts >= 2);
    } finally {
      await page.close();
    }
  });

test('Feral gap hops touch down on measured narrow, offset and partly clipped destination support', async () => {
  const page = await fixture();
  try {
    const results = await page.evaluate(() => {
      return [
        { width: 48, offset: 0, clip: 0 },
        { width: 90, offset: 12, clip: 0 },
        { width: 130, offset: -10, clip: 18 },
        { width: 90, offset: 0, clip: 0, removed: true },
      ].map(({ width, offset, clip, removed = false }) => {
        document.body.innerHTML = `<span id="left" style="position:fixed;left:300px;top:320px;width:284px;height:80px;border:2px solid white;box-sizing:border-box"></span><div id="clip" style="position:fixed;left:${615 + clip}px;top:${320 + offset}px;width:${width - clip}px;height:90px;overflow:hidden"><span id="right" style="position:absolute;left:${-clip}px;top:0;width:${width}px;height:80px;border:2px solid white;box-sizing:border-box"></span></div><canvas data-cr4wler-ignore></canvas>`;
        map.clear();
        let measured;
        for (let i = 0; i < 8; i++)
          measured = surfacesAt({ x: 535, y: 365 }, { x: 750, y: 365 }, [
            { x: 570, y: 322 },
            { x: 635 + clip, y: 324 + offset },
          ]);
        const surfaces = measured.filter(
          (s) => s.kind === 'card' && s.a.y === s.b.y && (s.a.y === 320 || s.a.y === 320 + offset),
        );
        const right = surfaces.find((s) => s.a.x === 615);
        if (!right) throw new Error('destination not discovered');
        const spider = new Spider(document.querySelector('canvas'));
        spider.resize(1200, 850);
        const start = { x: 500, y: 365 };
        const opts = { personality: 'feral', intensity: 0.6, reducedMotion: false, surfaces };
        spider.update(0, 0, start, { ...opts, reducedMotion: true });
        spider.age = 2;
        let time = 0,
          previous = false,
          touchdown = null,
          hop = null,
          removedDuringFlight = false;
        for (let f = 0; f < 600; f++) {
          spider.update(
            1 / 60,
            (time += 1 / 60),
            f < 180 ? start : { x: 800, y: 365 + offset },
            opts,
          );
          spider.render();
          if (spider.recovering && !previous)
            hop = { from: { ...spider.recovery.from }, to: { ...spider.recovery.to } };
          if (removed && !removedDuringFlight && spider.recoveryPhase === 'flight') {
            document.querySelector('#clip').remove();
            opts.surfaces = surfaces.filter((s) => s.id !== right.id);
            removedDuringFlight = true;
          }
          if (previous && !spider.recovering) {
            const rig = spider.diagnostics;
            touchdown = {
              frame: f,
              rig,
              destinationContacts: rig.legs.flatMap((l, i) =>
                l.contact?.id === right.id
                  ? [
                      {
                        contact: l.contact,
                        foot: rig.feet[i],
                        visible: document
                          .querySelector('#right')
                          ?.contains(document.elementFromPoint(rig.feet[i].x, rig.feet[i].y + 2)),
                      },
                    ]
                  : [],
              ),
            };
            break;
          }
          previous = spider.recovering;
        }
        return { width, offset, clip, removed, removedDuringFlight, right, hop, touchdown };
      });
    });
    for (const result of results) {
      assert.ok(result.hop && result.touchdown, JSON.stringify(result));
      if (result.removed) {
        assert.ok(result.removedDuringFlight);
        assert.equal(result.touchdown.destinationContacts.length, 0);
        assert.ok(result.touchdown.rig.surfaceReleases >= 1);
      } else {
        assert.ok(
          result.touchdown.destinationContacts.length >= 1,
          'support at the first completed touchdown: ' + JSON.stringify(result),
        );
        const x = result.touchdown.rig.body.x;
        assert.ok(x >= result.right.a.x + (result.right.b.x - result.right.a.x) * result.right.min);
        assert.ok(x <= result.right.a.x + (result.right.b.x - result.right.a.x) * result.right.max);
      }
      const { from, to } = result.hop;
      assert.ok(Math.hypot(to.x - from.x, to.y - from.y) <= 95 * 1.12 + 0.01);
      for (const { contact, foot, visible } of result.touchdown.destinationContacts) {
        const s = result.right;
        assert.ok(visible, 'touchdown hit test must land inside the painted destination');
        assert.ok(contact.fraction >= s.min && contact.fraction <= s.max);
        assert.ok(
          Math.hypot(foot.x - (s.a.x + (s.b.x - s.a.x) * contact.fraction), foot.y - s.a.y) < 0.01,
        );
      }
      assert.ok(result.touchdown.rig.maxReach <= result.touchdown.rig.reachLimit + 0.01);
      assert.ok(result.touchdown.rig.maxBoneLength <= result.touchdown.rig.boneLimit + 0.01);
    }
  } finally {
    await page.close();
  }
});

// Real Chromium CPU slowdown can exhaust discovery's budget during a cold read.
// Nearby supports must still become usable without changing the pointer target.
for (const cpuRate of [1, 50])
  test(`feet can perch on real image and button boundaries with ${cpuRate}x CPU slowdown while preserving page content and actions`, async () => {
    const page = await fixture();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
    try {
      const result = await page.evaluate((cpuRate) => {
        const button = document.querySelector('button');
        button.style.cssText = 'left:800px;top:365px;width:240px;height:60px';
        globalThis.actions = 0;
        document.addEventListener('click', () => actions++);
        const original = document.body.innerHTML;
        const spider = new Spider(document.querySelector('canvas'));
        spider.resize(1200, 850);
        const body = { x: 900, y: 280 };
        const opts = { personality: 'curious', intensity: 0.6, reducedMotion: false };
        spider.update(0, 0, body, { ...opts, reducedMotion: true });
        spider.age = 2;
        const kinds = new Set();
        for (let f = 0; f < (cpuRate === 1 ? 240 : 480); f++) {
          const surfaces = map.update(
            f / 60,
            revision,
            spider.position,
            body,
            spider.feet,
            spider.contactIds,
            spider.surfaceContacts,
          );
          spider.update(1 / 60, f / 60, body, { ...opts, surfaces });
          spider.render();
          for (const leg of spider.diagnostics.legs) if (leg.contact) kinds.add(leg.contact.kind);
        }
        // Canvas style dimensions are ours; compare the actual host surfaces instead.
        return {
          kinds: [...kinds],
          discovery: map.diagnostics,
          actions,
          button: button.outerHTML,
          image: document.querySelector('img').outerHTML,
          originalButton: original.match(/<button[^]*?<\/button>/)[0],
          originalImage: original.match(/<img[^>]*>/)[0],
        };
      }, cpuRate);
      assert.ok(result.kinds.includes('image'), JSON.stringify(result));
      assert.ok(result.kinds.includes('button'), JSON.stringify(result));
      assert.equal(result.actions, 0);
      assert.equal(result.button, result.originalButton);
      assert.equal(result.image, result.originalImage);
    } finally {
      await page.close();
    }
  });

test('reflow, hidden/covered text and masked damage invalidate surfaces; opt-outs and rotated boxes fall back', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      const body = { x: 500, y: 280 };
      const paragraph = document.querySelector('article p');
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const rect = range.getBoundingClientRect();
      let before;
      for (let i = 0; i < 5; i++)
        before = surfacesAt(body, body, [{ x: rect.x + 40, y: rect.y + 5 }]);
      const line = before.find((s) => s.kind === 'text' && Math.abs(s.a.y - rect.bottom + 2) < 1);
      paragraph.style.width = '200px';
      const after = surfacesAt(body);
      const reflowReleased = !after.some((s) => s.id === line.id);
      paragraph.style.visibility = 'hidden';
      const hidden = surfacesAt(body);
      const old = after.filter((s) => s.id.split(':')[0] === line.id.split(':')[0]);
      const hiddenReleased = old.every((s) => !hidden.some((n) => n.id === s.id));
      paragraph.style.visibility = 'visible';
      paragraph.style.width = 'auto';
      const node = paragraph.firstChild;
      map.mask(node);
      const masked = surfacesAt(body);
      const sourceHidden = masked
        .filter((s) => s.kind === 'text')
        .every((s) => Math.abs(s.a.y - line.a.y) > 2);
      map.unmask(node);
      surfacesAt(body);
      document.querySelector('article').dataset.cr4wlerIgnore = '';
      const optedOut = surfacesAt(body);
      document.querySelector('article').removeAttribute('data-cr4wler-ignore');
      document.querySelector('article').style.transform = 'rotate(15deg)';
      const rotated = surfacesAt(body);
      return {
        reflowReleased,
        hiddenReleased,
        sourceHidden,
        optedOut: optedOut.length,
        rotated: rotated.length,
      };
    });
    assert.equal(result.reflowReleased, true);
    assert.equal(result.hiddenReleased, true);
    assert.equal(result.sourceHidden, true);
    assert.equal(result.optedOut, 0);
    assert.equal(result.rotated, 0);
  } finally {
    await page.close();
  }
});

test('a small occluder at an exact planted fraction releases the contact within a bounded probe budget', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      const spider = new Spider(document.querySelector('canvas'));
      spider.resize(1200, 850);
      const body = { x: 500, y: 280 },
        opts = { personality: 'curious', intensity: 0.6, reducedMotion: false };
      spider.update(0, 0, body, { ...opts, reducedMotion: true });
      spider.age = 2;
      for (let f = 0; f < 180; f++) {
        const surfaces = map.update(
          f / 60,
          revision,
          body,
          body,
          spider.feet,
          spider.contactIds,
          spider.surfaceContacts,
        );
        spider.update(1 / 60, f / 60, body, { ...opts, surfaces });
        spider.render();
      }
      const index = spider.legs.findIndex((l) => l.contact);
      const contact = spider.legs[index].contact,
        p = spider.feet[index];
      const cover = document.createElement('div');
      cover.dataset.cr4wlerIgnore = '';
      cover.style.cssText = `position:fixed;left:${p.x - 6}px;top:${p.y - 6}px;width:12px;height:12px;background:white;z-index:100`;
      document.body.append(cover);
      const before = map.diagnostics.probes;
      const surfaces = map.update(
        3,
        ++revision,
        body,
        body,
        spider.feet,
        spider.contactIds,
        spider.surfaceContacts,
      );
      spider.update(1 / 60, 3, body, { ...opts, surfaces });
      spider.render();
      return {
        released: !spider.legs[index].contact,
        probes: map.diagnostics.probes - before,
        releaseCount: spider.diagnostics.surfaceReleases,
        jump: Math.hypot(spider.feet[index].x - p.x, spider.feet[index].y - p.y),
        hadContact: !!contact,
      };
    });
    assert.ok(result.hadContact);
    assert.equal(result.released, true);
    assert.ok(result.releaseCount >= 1);
    assert.ok(result.probes <= 16, JSON.stringify(result));
    assert.ok(result.jump < 1);
  } finally {
    await page.close();
  }
});

test('an ordinary engine frame does not cross the surface polling boundary twice', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      globalThis.runtime = new Cr4wler();
      runtime.summon({ followMouse: true });
    });
    await page.waitForTimeout(2100);
    const before = await page.evaluate(() => runtime.pageSurfaces.diagnostics.refreshes);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => runtime.pageSurfaces.diagnostics.refreshes);
    assert.ok(
      after - before >= 2 && after - before <= 5,
      `~7 Hz coalesced refresh, got ${after - before} in 500ms`,
    );
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.evaluate(() => runtime.pageSurfaces.diagnostics.anchors), 0);
  } finally {
    await page.close();
  }
});

test('resized box edges retain attachment identity and sticky lines follow their actual viewport position', async () => {
  const page = await fixture();
  try {
    const result = await page.evaluate(() => {
      const sticky = document.querySelector('#fixed');
      sticky.style.cssText =
        'position:sticky;top:35px;left:170px;margin-top:430px;width:620px;height:40px;background:#415776';
      const body = { x: 500, y: 435 },
        seeds = [
          { x: 400, y: 220 },
          { x: 400, y: 450 },
        ];
      let before;
      for (let i = 0; i < 5; i++) before = surfacesAt(body, body, seeds);
      const edge = before.find((s) => s.kind === 'card' && s.a.x === 804 && s.b.x === 804);
      const range = document.createRange();
      range.selectNodeContents(sticky);
      const y = range.getBoundingClientRect().bottom - 2;
      const line = before.find((s) => s.kind === 'text' && Math.abs(s.a.y - y) < 1);
      document.querySelector('article').style.width = '700px';
      const resized = surfacesAt(body, body, seeds).find((s) => s.id === edge.id);
      scrollTo(0, 250);
      const flowing = surfacesAt({ x: 400, y: 200 }, { x: 400, y: 200 }, seeds).find(
        (s) => s.id === line.id,
      );
      const expectedFlow = range.getBoundingClientRect().bottom - 2;
      scrollTo(0, 500);
      const stuck = surfacesAt({ x: 400, y: 80 }, { x: 400, y: 80 }, seeds).find(
        (s) => s.id === line.id,
      );
      const expectedStuck = range.getBoundingClientRect().bottom - 2;
      return { edge, resized, line, flowing, stuck, expectedFlow, expectedStuck };
    });
    assert.ok(result.edge && result.resized && result.line && result.flowing && result.stuck);
    assert.equal(
      result.resized.id,
      result.edge.id,
      'a box resize does not destroy the same boundary',
    );
    assert.equal(result.resized.a.x, result.edge.a.x + 80);
    assert.equal(result.flowing.a.y, result.expectedFlow);
    assert.equal(result.stuck.a.y, result.expectedStuck);
    assert.equal(result.stuck.a.y, result.line.a.y - 395, 'sticky offset stops at 35px');
  } finally {
    await page.close();
  }
});
