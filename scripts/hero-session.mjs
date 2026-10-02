/** Single-personality README footage. Runs the actual installed extension.
 * Every word, form value and pointer cue belongs to this synthetic fixture. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { preparePointerSession } from './pointer-session.mjs';

const titles = [
  'Footnotes for a passing comet',
  'An atlas of borrowed colors',
  'Letters with an independent life',
  'The geometry of wandering',
  'Glass architecture in the margins',
  'A theory of small disturbances',
];

function fixture() {
  const rows = Array.from({ length: 120 }, (_, i) => {
    const title = titles[i % titles.length];
    return `<article><span class="number">${String(i + 1).padStart(3, '0')}</span>
      <div><a id="hero-word-${i + 1}" href="#hero-word-${i + 1}">${title}</a>
      <p>Vale & Thread · Journal of Digital Wildlife · fictional field note ${i + 1}</p></div>
      </article>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>cr4wler — fictional typography habitat</title><style>
    *{box-sizing:border-box}html{background:#10131b;color:#cbd3e3;scroll-behavior:auto}
    body{margin:0;font-family:Georgia,serif}main{width:1040px;margin:auto;padding:90px 24px 60px}
    header{height:110px}h1{margin:0;font-weight:400;font-size:42px;color:#eef5ff}
    header p{font:15px system-ui;color:#8190a8;margin:12px 0}
    article{height:116px;display:flex;align-items:center;gap:28px;border-top:1px solid #283142}
    .number{font:14px monospace;color:#596782;width:40px}a{font-size:27px;color:#bcd2ff;text-decoration:none}
    article p{font:13px system-ui;color:#708098;margin:13px 0 0}
    #protected{margin-top:100px}input{display:block;margin:12px 0}
    .guide{position:fixed;left:0;right:0;top:44px;padding:12px;text-align:center;background:#10131bee;
      color:#a7b6d0;font:15px system-ui;z-index:2147483645;pointer-events:none}
    </style></head><body><main><header><h1>A small appetite for words.</h1>
    <p>THE OPEN FIELD GUIDE · ALL CONTENT IS FICTIONAL · REAL PAGE INTERACTION</p></header>
    ${rows}<section id="protected" data-cr4wler-ignore><form>
    <input id="hero-input" value="fictional fixture note" autocomplete="off">
    <input id="hero-password" type="password" value="demo-only-not-a-secret">
    <button>Protected synthetic button</button></form></section></main>
    <div class="guide" data-cr4wler-ignore>Hover a phrase to feed it. Move to a page edge to crawl. Escape restores everything.</div>
    </body></html>`;
}

async function movePointer(page, x, y, duration = 450) {
  const from = await page.evaluate(() => {
    const marker = document.querySelector('#recording-pointer');
    return { x: parseFloat(marker.style.left), y: parseFloat(marker.style.top) };
  });
  const steps = Math.max(1, Math.round(duration / 40));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
    await page.waitForTimeout(duration / steps);
  }
}

async function feed(page, id) {
  const point = await page.locator(`#${id}`).evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x + r.width * 0.52, y: r.y + r.height / 2 };
  });
  assert.ok(point.y > 90 && point.y < 940, 'chosen word must be visibly inside the habitat');
  await page.evaluate(
    (id) => (pointerAudit.intent = { id, personality: 'curious', inputAt: null, ackAt: null }),
    id,
  );
  await movePointer(page, point.x, point.y);
  await page.waitForFunction(
    (id) =>
      [...CSS.highlights].some(
        ([name, highlights]) =>
          name.startsWith('cr4wler-') &&
          !name.endsWith('-selection') &&
          [...highlights].some((range) =>
            document.getElementById(id).contains(range.startContainer),
          ),
      ),
    id,
    { timeout: 12000 },
  );
  await page.waitForTimeout(1000);
}

export async function captureHeroSession({ context, cdp, id, dir, sourceCommit }) {
  await writeFile('dist/hero-capture.html', fixture());
  const createdAt = Date.now();
  const page = await context.newPage();
  const video = page.video();
  let popup;
  const evidence = {
    sourceCommit,
    surface: 'Actual installed MV3 extension; one Curious widow; real pointer and edge scrolling',
    fixture:
      'Generated synthetic typography habitat, 120 fictional notes and dummy protected inputs',
    passed: false,
    timeline: [],
  };
  const mark = async (stage) => {
    evidence.timeline.push({ stage, atSeconds: (Date.now() - createdAt) / 1000 });
  };
  try {
    const url = 'http://127.0.0.1:4173/hero-capture.html';
    await page.goto(url);
    const original = await page.locator('main').innerHTML();
    const requests = [],
      errors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => {
      globalThis.heroSiteActions = { click: 0, input: 0, change: 0, submit: 0 };
      for (const type of Object.keys(heroSiteActions))
        document.querySelector('main').addEventListener(type, () => heroSiteActions[type]++, true);
    });
    await preparePointerSession(page, { surface: 'Installed extension · cursor following ON' });
    await page.locator('#recording-pointer').evaluate((marker) => {
      marker.style.width = marker.style.height = '20px';
      marker.style.borderWidth = '3px';
    });
    const target = (
      await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
    ).targetInfos.find((target) => target.type === 'tab' && target.url === url);
    await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
    popup = await context.newPage();
    await page.bringToFront();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('[data-personality="curious"]').click();
    await popup.locator('#follow-mouse').setChecked(true);
    await popup.locator('#intensity').evaluate((input) => {
      input.value = '82';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.mouse.move(610, 315);
    await mark('summon');
    await popup.locator('#summon').click();
    await page.bringToFront();
    await page.waitForSelector('[data-cr4wler-root]');
    await page.waitForFunction(
      () => document.querySelector('[data-cr4wler-root]').dataset.personality === 'curious',
    );
    evidence.clipStartSeconds = (Date.now() - createdAt) / 1000;
    for (const number of [2, 4, 6]) {
      await mark(`hover-and-eat-${number}`);
      await feed(page, `hero-word-${number}`);
    }
    const retained = await page
      .locator('[data-cr4wler-root] .piece')
      .evaluateAll((nodes) => [...new Set(nodes.map((node) => node.dataset.recordId))]);
    assert.ok(retained.length >= 3, 'three hovered phrases must leave real persistent marks');
    await mark('pointer-to-bottom-edge');
    await page.evaluate(() => (pointerAudit.intent = null));
    const initial = await page.evaluate(() => scrollY);
    await movePointer(page, 720, 982, 650);
    await page.waitForTimeout(3100);
    const advanced = await page.evaluate(() => scrollY);
    assert.ok(advanced > initial + 400, 'actual stationary edge pointer must scroll the document');
    await mark('pointer-inward-stops-scroll');
    await movePointer(page, 680, 475, 500);
    await page.waitForTimeout(150);
    const stopped = await page.evaluate(() => scrollY);
    await page.waitForTimeout(350);
    assert.ok(Math.abs((await page.evaluate(() => scrollY)) - stopped) < 3);
    const next = await page.evaluate(() => {
      const links = [...document.querySelectorAll('article a')];
      return links.find((link) => {
        const rect = link.getBoundingClientRect();
        return rect.top > 380 && rect.top < 510;
      })?.id;
    });
    assert.ok(next, 'new words must appear after edge scrolling');
    await mark('eat-newly-visible-word');
    await feed(page, next);
    await mark('pointer-to-top-edge');
    await page.evaluate(() => (pointerAudit.intent = null));
    await movePointer(page, 720, 18, 650);
    await page.waitForTimeout(3200);
    await movePointer(page, 650, 480, 500);
    await page.waitForTimeout(800);
    const returnedScroll = await page.evaluate(() => scrollY);
    assert.ok(returnedScroll < advanced - 400, 'top edge pointer must return to the earlier words');
    const returned = await page
      .locator('[data-cr4wler-root] .piece')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.recordId));
    for (const record of retained)
      assert.ok(returned.includes(record), 'old aftermath must return');
    await mark('persistent-aftermath-returned');
    await page.waitForTimeout(1100);
    evidence.clipEndSeconds = (Date.now() - createdAt) / 1000;
    const audit = await page.evaluate(() => pointerAudit);
    assert.deepEqual(
      audit.rig.types,
      ['widow'],
      'one spider anatomy throughout the whole sequence',
    );
    assert.ok(
      audit.rig.finite && audit.rig.maxReachRatio <= 1.001 && audit.rig.maxBoneRatio <= 1.001,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
    assert.equal(await page.locator('main').innerHTML(), original);
    assert.equal(page.url(), url);
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => heroSiteActions), {
      click: 0,
      input: 0,
      change: 0,
      submit: 0,
    });
    assert.equal(await page.locator('#hero-input').inputValue(), 'fictional fixture note');
    assert.equal(await page.locator('#hero-password').inputValue(), 'demo-only-not-a-secret');
    Object.assign(evidence, {
      passed: true,
      browser: context.browser().version(),
      viewport: { width: 1440, height: 1000 },
      scroll: { initial, advanced, stopped, returned: returnedScroll, realPointerOnly: true },
      persistentRecordIds: retained,
      exactRestore: true,
      siteActions: await page.evaluate(() => heroSiteActions),
      requests,
      errors,
      rig: audit.rig,
      phases: audit.phases,
      effects: audit.effects,
      responses: audit.responses,
    });
  } catch (error) {
    evidence.error = error.message;
    throw error;
  } finally {
    await page.close();
    await video.saveAs(`${dir}/hero-demo.webm`);
    await popup?.close();
    await writeFile(`${dir}/hero-result.json`, JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(
    'HERO CAPTURE PASS: one Curious widow, four word grabs, pointer-only bidirectional edge scrolling, persistent aftermath and exact restore.',
  );
  return evidence;
}
