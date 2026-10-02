import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';
let browser, server;
const base = 'http://127.0.0.1:4173';
before(async () => {
  server = await serve();
  browser = await chromium.launch({ channel: 'chromium', headless: true });
});
after(async () => {
  await browser?.close();
  server?.close();
});
const root = '[data-cr4wler-root]';
async function fixture(options = {}) {
  const { path = '', ...contextOptions } = options;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ...contextOptions,
  });
  await page.goto(base + path);
  return page;
}
async function pieces(page) {
  return page.locator(`${root} .piece`).count();
}
async function waitForPiece(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-cr4wler-root]')?.shadowRoot?.querySelector('.piece'),
    {},
    { timeout: 14000 },
  );
}
async function start(page) {
  await page.locator('#demo-summon').click();
}

test('manifest is gesture-scoped, local-only MV3', async () => {
  const m = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['activeTab', 'scripting']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.content_scripts, undefined);
  assert.match(m.content_security_policy.extension_pages, /connect-src 'none'/);
});

test(
  'real page grabs, pause, exact restore, no actions or network',
  { timeout: 22000 },
  async () => {
    const page = await fixture();
    try {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const before = await page.locator('main').evaluate((el) => ({
        html: el.innerHTML,
        rects: [...el.querySelectorAll('a,p,h1,h2')].map((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      }));
      const url = page.url();
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      await page.evaluate(() => {
        globalThis.actions = { click: 0, input: 0, change: 0, submit: 0 };
        for (const type of Object.keys(actions))
          document.querySelector('main').addEventListener(type, () => actions[type]++, true);
      });
      await start(page);
      await waitForPiece(page);
      await page.waitForTimeout(2300);
      assert.ok((await pieces(page)) > 0);
      assert.ok(
        await page.evaluate(() =>
          [...CSS.highlights].some(([name, h]) => name.startsWith('cr4wler-') && h.size > 0),
        ),
      );
      await page.locator('#demo-pause').click();
      const frozen = await page.locator(`${root} .pieces`).evaluate((el) => el.innerHTML);
      await page.waitForTimeout(200);
      assert.equal(await page.locator(`${root} .pieces`).evaluate((el) => el.innerHTML), frozen);
      await page.locator('#demo-pause').click();
      const during = await page.locator('main').evaluate((el) => ({
        html: el.innerHTML,
        rects: [...el.querySelectorAll('a,p,h1,h2')].map((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      }));
      assert.deepEqual(during, before, 'source DOM and layout must remain byte-for-byte unchanged');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
      assert.equal(
        await page.evaluate(
          () => [...CSS.highlights.keys()].filter((n) => n.startsWith('cr4wler-')).length,
        ),
        0,
      );
      assert.deepEqual(await page.evaluate(() => actions), {
        click: 0,
        input: 0,
        change: 0,
        submit: 0,
      });
      assert.equal(page.url(), url);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
      assert.equal(
        await page.locator('#fixture-input').inputValue(),
        'Please leave my words right here',
      );
      assert.equal(await page.locator('#fixture-password').inputValue(), 'demo-only-not-a-secret');
      assert.equal(await page.locator('main').innerHTML(), before.html);
    } finally {
      await page.close();
    }
  },
);

test(
  'packaged content-script harness: repeated injection and commands are idempotent',
  { timeout: 18000 },
  async () => {
    const page = await fixture();
    try {
      // This mocks only Chrome messaging. It does NOT test installation, action or activeTab.
      await page.evaluate(() => {
        globalThis.listeners = [];
        globalThis.chrome = {
          runtime: {
            onMessage: {
              addListener(fn) {
                listeners.push(fn);
              },
            },
          },
        };
      });
      const code = await readFile('dist/content.js', 'utf8');
      await page.addScriptTag({ content: code });
      await page.addScriptTag({ content: code });
      const command = (action) =>
        page.evaluate(
          (action) =>
            new Promise((resolve) => listeners[0]({ type: 'CR4WLER', action }, {}, resolve)),
          action,
        );
      assert.equal(await page.evaluate(() => listeners.length), 1);
      await command('summon');
      await command('summon');
      assert.equal(await page.locator(root).count(), 1);
      await waitForPiece(page);
      await command('restore');
      await command('restore');
      assert.equal(await page.locator(root).count(), 0);
      await command('summon');
      assert.equal(await page.locator(root).count(), 1);
      await page.keyboard.press('Escape');
      assert.equal((await command('status')).active, false);
    } finally {
      await page.close();
    }
  },
);

test(
  'excludes form, editor, sensitive, hidden and ignored text; survives SPA removal',
  { timeout: 18000 },
  async () => {
    const page = await fixture();
    try {
      await page.evaluate(() => {
        document.querySelector('main').innerHTML =
          '<p id="safe" style="margin-top:150px">A wonderfully eligible phrase</p><form>FORM_PRIVATE<input value="UNTOUCHED"><button>BUTTON_PRIVATE</button></form><div contenteditable="true">EDITOR_PRIVATE</div><div class="checkout">PAYMENT_PRIVATE</div><div class="auth-widget">AUTH_PRIVATE</div><div data-cr4wler-ignore>IGNORED_PRIVATE</div><div hidden>HIDDEN_PRIVATE</div><div style="visibility:hidden">INVISIBLE_PRIVATE</div><div role="button">ROLE_PRIVATE</div>';
      });
      await start(page);
      await waitForPiece(page);
      const text = (await page.locator(`${root} .piece`).allTextContents()).join('');
      assert.ok(text.includes('wonderfully') || text.includes('eligible'));
      assert.doesNotMatch(text, /PRIVATE/);
      await page.evaluate(() =>
        document.querySelector('#safe').setAttribute('contenteditable', 'true'),
      );
      await page.waitForTimeout(100);
      assert.equal(await pieces(page), 0);
      await page.evaluate(
        () =>
          (document.querySelector('main').innerHTML =
            '<p style="margin-top:150px">A fresh page after navigation</p>'),
      );
      await waitForPiece(page);
      assert.match(
        (await page.locator(`${root} .piece`).allTextContents()).join(''),
        /fresh|navigation/,
      );
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
    } finally {
      await page.close();
    }
  },
);

test(
  'persistent aftermath survives scrolling away, back and reflow while paused',
  { timeout: 30000 },
  async () => {
    const page = await fixture({ path: '/reference.html' });
    try {
      const before = await page.locator('main').innerHTML();
      await start(page);
      await waitForPiece(page);
      await page.waitForTimeout(2200);
      await page.locator('#demo-pause').click();
      const ids = await page
        .locator(`${root} .piece`)
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId));
      assert.ok(ids.length > 0);
      const highlights = await page.evaluate(() =>
        [...CSS.highlights]
          .filter(([n]) => n.startsWith('cr4wler-') && !n.endsWith('-selection'))
          .map(([name, h]) => ({ name, text: [...h].map((r) => r.toString()) })),
      );
      await page.evaluate(() => document.querySelector('#reference-volume-30').scrollIntoView());
      await page.waitForTimeout(250);
      assert.equal(await pieces(page), 0, 'offscreen marks should be virtualized');
      assert.deepEqual(
        await page.evaluate(() =>
          [...CSS.highlights]
            .filter(([n]) => n.startsWith('cr4wler-') && !n.endsWith('-selection'))
            .map(([name, h]) => ({ name, text: [...h].map((r) => r.toString()) })),
        ),
        highlights,
        'scroll must not discard source masks',
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(250);
      assert.deepEqual(
        await page
          .locator(`${root} .piece`)
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId)),
        ids,
      );
      await page.setViewportSize({ width: 1200, height: 1000 });
      await page.waitForTimeout(250);
      assert.deepEqual(
        await page
          .locator(`${root} .piece`)
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId)),
        ids,
      );
      assert.equal(await page.locator('main').innerHTML(), before);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
      assert.equal(await page.locator('main').innerHTML(), before);
    } finally {
      await page.close();
    }
  },
);

test(
  'progressive discovery reaches distant reference sections and reset clears the whole document',
  { timeout: 30000 },
  async () => {
    const page = await fixture({ path: '/reference.html' });
    try {
      assert.ok((await page.locator('main *').count()) > 10000);
      const before = await page.locator('main').innerHTML();
      await page.evaluate(() => document.querySelector('#reference-volume-60').scrollIntoView());
      await start(page);
      await waitForPiece(page);
      const deepText = await page.evaluate(() =>
        [...CSS.highlights]
          .filter(([n]) => n.startsWith('cr4wler-') && !n.endsWith('-selection'))
          .flatMap(([, h]) =>
            [...h].map((r) => r.startContainer.parentElement.closest('section')?.id),
          ),
      );
      assert.ok(
        deepText.includes('reference-volume-60'),
        'must find current viewport beyond the first scanning chunk',
      );
      await page.evaluate(() => scrollTo(0, 0));
      await waitForPiece(page);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
      assert.equal(await page.locator('main').innerHTML(), before);
      assert.equal(
        await page.evaluate(
          () => [...CSS.highlights.keys()].filter((n) => n.startsWith('cr4wler-')).length,
        ),
        0,
      );
    } finally {
      await page.close();
    }
  },
);

test(
  'reduced motion stays still and changing preference preserves existing aftermath',
  { timeout: 24000 },
  async () => {
    const page = await fixture({ reducedMotion: 'reduce' });
    try {
      await start(page);
      await page.waitForTimeout(700);
      assert.equal(await pieces(page), 0);
      const first = await page
        .locator(`${root} canvas.visitor`)
        .first()
        .evaluate((c) => c.toDataURL());
      await page.waitForTimeout(350);
      assert.equal(
        await page
          .locator(`${root} canvas.visitor`)
          .first()
          .evaluate((c) => c.toDataURL()),
        first,
      );
      await page.keyboard.press('Escape');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await start(page);
      await waitForPiece(page);
      await page.waitForTimeout(2000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(200);
      const ids = await page
        .locator(`${root} .piece`)
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId));
      await page.waitForTimeout(1500);
      assert.deepEqual(
        await page
          .locator(`${root} .piece`)
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId)),
        ids,
      );
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
    } finally {
      await page.close();
    }
  },
);

test('popup controls dispatch settings and handle restricted pages', async () => {
  const page = await browser.newPage({ viewport: { width: 368, height: 800 } });
  try {
    await page.addInitScript(() => {
      globalThis.sent = [];
      globalThis.active = false;
      globalThis.chrome = {
        tabs: {
          query: async () => [{ id: 7 }],
          sendMessage: async (id, message) => {
            sent.push({ id, ...message });
            if (message.action === 'summon') globalThis.active = true;
            if (message.action === 'restore') globalThis.active = false;
            return {
              active: globalThis.active,
              paused: message.action === 'pause',
              reducedMotion: false,
              fragments: 0,
              ...message.settings,
            };
          },
        },
        scripting: { executeScript: async () => {} },
      };
    });
    await page.goto(`${base}/popup.html`);
    assert.ok(
      await page.locator('body').evaluate((e) => e.getBoundingClientRect().height <= 600),
      'popup must fit Chrome without hidden controls',
    );
    await page.getByRole('button', { name: 'Feral' }).click();
    await page.locator('#follow-mouse').check();
    await page.locator('#summon').click();
    assert.equal(await page.locator('#summon').isDisabled(), true);
    assert.equal(await page.locator('#pause').isDisabled(), false);
    assert.equal(
      (await page.evaluate(() => sent.find((x) => x.action === 'summon'))).settings.personality,
      'feral',
    );
    assert.equal(
      (await page.evaluate(() => sent.find((x) => x.action === 'summon'))).settings.followMouse,
      true,
    );
    await page.locator('#restore').click();
    await page.evaluate(
      () =>
        (chrome.scripting.executeScript = async () => {
          throw Error('Restricted page');
        }),
    );
    await page.locator('#summon').click();
    assert.match(await page.locator('#status').innerText(), /off limits/);
  } finally {
    await page.close();
  }
});

test('restore preserves existing highlights and concurrent page edits', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      document.querySelector('main').innerHTML =
        '<p id="editable-by-site" style="margin-top:150px">A page-owned piece of text</p>';
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#editable-by-site'));
      CSS.highlights.set('site-owned-highlight', new Highlight(range));
    });
    await start(page);
    await waitForPiece(page);
    await page.evaluate(() => {
      const element = document.querySelector('#editable-by-site');
      element.textContent = 'The site updated this while the visitor was here';
      element.setAttribute('style', 'margin-top:150px;color:rgb(100, 200, 180)');
    });
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('#editable-by-site').innerText(),
      'The site updated this while the visitor was here',
    );
    assert.equal(
      await page.locator('#editable-by-site').getAttribute('style'),
      'margin-top:150px;color:rgb(100, 200, 180)',
    );
    assert.deepEqual(await page.evaluate(() => [...CSS.highlights.keys()]), [
      'site-owned-highlight',
    ]);
  } finally {
    await page.close();
  }
});

test(
  'a visible lock precedes mutation and committed marks do not expire',
  { timeout: 40000 },
  async () => {
    const page = await fixture();
    try {
      await page.evaluate(() => {
        globalThis.huntTrace = [];
        function tick() {
          const host = document.querySelector('[data-cr4wler-root]');
          if (host && huntTrace.at(-1)?.phase !== host.dataset.phase)
            huntTrace.push({
              phase: host.dataset.phase,
              at: performance.now(),
              count: Number(host.dataset.fragments),
            });
          if (huntTrace.length < 100) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      await start(page);
      await waitForPiece(page);
      await page.waitForFunction(() => huntTrace.some((t) => t.phase === 'strike'));
      const trace = await page.evaluate(() => huntTrace);
      const lock = trace.find((t) => t.phase === 'lock');
      const strike = trace.find((t) => t.phase === 'strike');
      assert.ok(lock && strike, 'scan/lock/strike must be observable');
      assert.equal(lock.count, 0, 'no source is committed before the first lock');
      assert.ok(strike.at - lock.at >= 130, 'Curious must hold its lock for an anticipation pause');
      const firstId = await page.locator(`${root} .piece`).first().getAttribute('data-record-id');
      // Beyond the previous version's 26 second expiry; keep the session running.
      await page.waitForTimeout(27500);
      assert.equal(await page.locator(`${root} .piece[data-record-id="${firstId}"]`).count(), 1);
      const effects = await page
        .locator(`${root} .piece`)
        .evaluateAll((nodes) => new Set(nodes.map((n) => n.dataset.effect)).size);
      assert.ok(effects >= 4, 'the growing composition should contain distinct treatments');
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  },
);

test(
  'cursor hunting is opt-in, ignores ineligible space and can be disabled',
  { timeout: 14000 },
  async () => {
    const page = await fixture();
    try {
      await page.locator('main').evaluate((el) => (el.dataset.cr4wlerIgnore = ''));
      await start(page);
      await page.waitForTimeout(2100);
      const visitor = page.locator(`${root} canvas.visitor`);
      await page.mouse.move(340, 650, { steps: 10 });
      await page.waitForTimeout(250);
      assert.equal(await visitor.getAttribute('data-motion'), 'explore');
      const initial = await visitor.evaluate((el) => ({
        x: +el.dataset.bodyX,
        y: +el.dataset.bodyY,
      }));
      await page.locator('#demo-follow').check();
      await page.mouse.move(340, 650, { steps: 10 });
      await page.waitForTimeout(1700);
      assert.equal(await visitor.getAttribute('data-motion'), 'follow');
      const followed = await visitor.evaluate((el) => ({
        x: +el.dataset.bodyX,
        y: +el.dataset.bodyY,
      }));
      assert.ok(
        Math.hypot(followed.x - initial.x, followed.y - initial.y) < 35,
        'ineligible space must not pull the spider toward the pointer',
      );
      await page.locator('#demo-follow').uncheck();
      await page.mouse.move(900, 200, { steps: 10 });
      await page.waitForTimeout(300);
      assert.equal(await visitor.getAttribute('data-motion'), 'explore');
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  },
);

async function hoverFixture(personality = 'curious') {
  const page = await fixture();
  await page.locator('main').evaluate((el) => {
    el.innerHTML = `<section style="height:900px;position:relative">
      <a id="aim-a" data-aim href="#fixture" style="position:absolute;top:120px;left:15px;font-size:23px">Aurora has a thousand little legs</a>
      <a id="aim-b" data-aim href="#fixture" style="position:absolute;top:470px;left:120px;font-size:23px">Borealis is the next chosen adventure</a>
      <a id="aim-c" data-aim href="#fixture" style="position:absolute;top:290px;left:20px;font-size:20px">Cobalt waits patiently in the middle</a>
      <div class="checkout" style="position:absolute;top:620px"><a id="private-hover" href="#fixture">PRIVATE PAYMENT WIDGET</a></div>
      <label style="position:absolute;top:700px">Protected note<input id="hover-input" value="Do not change this" /></label>
    </section>`;
  });
  await page.locator('#demo-personality').selectOption(personality);
  await page.locator('#demo-follow').check();
  await start(page);
  return page;
}
async function selectedAim(page, id) {
  await page.waitForFunction(
    (id) =>
      [...CSS.highlights].some(
        ([name, h]) =>
          name.endsWith('-selection') &&
          [...h].some((r) => r.startContainer.parentElement?.closest('[data-aim]')?.id === id),
      ),
    id,
    { timeout: 1800 },
  );
}
async function maskedAims(page) {
  return page.evaluate(() =>
    [...CSS.highlights]
      .filter(([name]) => name.startsWith('cr4wler-') && !name.endsWith('-selection'))
      .flatMap(([, h]) =>
        [...h].map((r) => r.startContainer.parentElement?.closest('[data-aim]')?.id),
      )
      .filter(Boolean),
  );
}
async function bodyPoint(page) {
  return page
    .locator(`${root} canvas.visitor`)
    .evaluate((el) => ({ x: +el.dataset.bodyX, y: +el.dataset.bodyY }));
}

test(
  'cursor mode ignores blank space and stops after destroying the hovered element',
  { timeout: 20000 },
  async () => {
    const page = await hoverFixture('feral');
    try {
      const box = await page.locator('#aim-b').boundingBox();
      // Inside the same link's padding, but not over its text.
      await page.locator('#aim-b').evaluate((el) => {
        el.style.paddingBottom = '60px';
      });
      await page.mouse.move(box.x + box.width / 2, box.y + box.height + 25);
      await page.waitForTimeout(2200);
      assert.deepEqual(await maskedAims(page), []);
      assert.equal(await page.locator(root).getAttribute('data-candidate'), '');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await selectedAim(page, 'aim-b');
      await page.waitForFunction(
        () =>
          [...CSS.highlights].some(
            ([name, h]) =>
              !name.endsWith('-selection') &&
              [...h].some((r) => r.startContainer.parentElement?.id === 'aim-b'),
          ),
        null,
        { timeout: 8000 },
      );
      await page.waitForTimeout(2200);
      assert.deepEqual(await maskedAims(page), ['aim-b']);
      assert.equal(await page.locator(root).getAttribute('data-candidate'), '');
      await page.mouse.move(box.x + box.width / 2, box.y - 20);
      await page.waitForTimeout(1200);
      assert.deepEqual(await maskedAims(page), ['aim-b']);
    } finally {
      await page.close();
    }
  },
);

test('cursor can destroy adjacent text in the same element', { timeout: 16000 }, async () => {
  const page = await hoverFixture('feral');
  try {
    await page.locator('#aim-b').evaluate((el) => {
      el.replaceChildren(
        document.createTextNode('First untouched line'),
        document.createElement('br'),
        document.createTextNode('Second untouched line'),
      );
    });
    const points = await page.locator('#aim-b').evaluate((el) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }),
    );
    for (let i = 0; i < points.length; i++) {
      await page.mouse.move(points[i].x, points[i].y);
      await page.waitForFunction(
        (count) =>
          [...CSS.highlights]
            .filter(([name]) => !name.endsWith('-selection'))
            .flatMap(([, h]) => [...h])
            .filter((r) => r.startContainer.parentElement?.id === 'aim-b').length === count,
        i + 1,
        { timeout: 6000 },
      );
      await page.waitForTimeout(700);
    }
    assert.deepEqual(await maskedAims(page), ['aim-b', 'aim-b']);
  } finally {
    await page.close();
  }
});

test(
  'stable hover B preempts approach to A and becomes the next committed target',
  { timeout: 16000 },
  async () => {
    const page = await hoverFixture();
    try {
      await page.locator('#aim-a').hover();
      await selectedAim(page, 'aim-a');
      const before = await bodyPoint(page);
      const box = await page.locator('#aim-b').boundingBox();
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const began = Date.now();
      await page.locator('#aim-b').hover();
      await selectedAim(page, 'aim-b');
      assert.ok(Date.now() - began < 650, 'hover intent should be acknowledged promptly');
      await page.waitForTimeout(650);
      const after = await bodyPoint(page);
      assert.ok(
        Math.hypot(after.x - point.x, after.y - point.y) <
          Math.hypot(before.x - point.x, before.y - point.y) - 25,
        'body approaches the chosen element',
      );
      await page.waitForFunction(
        () =>
          [...CSS.highlights].some(
            ([name, h]) =>
              !name.endsWith('-selection') &&
              [...h].some(
                (r) => r.startContainer.parentElement?.closest('[data-aim]')?.id === 'aim-b',
              ),
          ),
        null,
        { timeout: 7000 },
      );
      assert.equal((await maskedAims(page))[0], 'aim-b', 'abandoned A must not strike before B');
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  },
);

test(
  'pointer jitter is stable and hovering protected controls never selects their content',
  { timeout: 14000 },
  async () => {
    const page = await hoverFixture();
    try {
      await page.locator('#aim-b').hover();
      await selectedAim(page, 'aim-b');
      const box = await page.locator('#aim-b').boundingBox();
      for (let i = 0; i < 8; i++)
        await page.mouse.move(
          box.x + box.width * 0.5 + (i % 2 ? 2 : -2),
          box.y + box.height * 0.5 + (i % 2 ? 1 : -1),
        );
      await selectedAim(page, 'aim-b');
      await page.locator('#private-hover').hover();
      await page.waitForTimeout(600);
      await page.locator('#hover-input').hover();
      await page.waitForTimeout(600);
      const unsafe = await page.evaluate(() =>
        [...CSS.highlights]
          .flatMap(([, h]) => [...h])
          .some((r) => r.startContainer.parentElement?.closest('.checkout,label,input')),
      );
      assert.equal(unsafe, false);
      assert.equal(await page.locator('#hover-input').inputValue(), 'Do not change this');
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  },
);

test(
  'edge crawling ramps deliberately, stops at center, and yields to manual wheel',
  { timeout: 18000 },
  async () => {
    const page = await fixture({ path: '/reference.html' });
    try {
      await page.locator('#demo-follow').check();
      await start(page);
      await page.evaluate(() => scrollTo(0, 3500));
      const initial = await page.evaluate(() => scrollY);
      await page.mouse.move(600, 995);
      await page.waitForTimeout(1200);
      assert.ok(
        (await page.evaluate(() => scrollY)) > initial + 60,
        'bottom edge should advance the document',
      );
      assert.ok((await rig(page)).recoveries <= 2, 'ordinary edge movement keeps a climbing gait');
      await page.mouse.move(600, 500);
      await page.waitForTimeout(40);
      const stopped = await page.evaluate(() => scrollY);
      await page.waitForTimeout(220);
      assert.ok(
        Math.abs((await page.evaluate(() => scrollY)) - stopped) < 3,
        'center stops scrolling immediately',
      );
      await page.mouse.move(600, 995);
      await page.waitForTimeout(750);
      await page.mouse.wheel(0, 170);
      await page.waitForTimeout(180);
      const manual = await page.evaluate(() => scrollY);
      await page.waitForTimeout(1100);
      assert.ok(
        Math.abs((await page.evaluate(() => scrollY)) - manual) < 3,
        'stationary edge must not fight or resume after manual wheel',
      );
      await page.mouse.move(600, 500);
      await page.waitForTimeout(120);
      await page.mouse.move(600, 5);
      await page.waitForTimeout(950);
      assert.ok(
        (await page.evaluate(() => scrollY)) < manual - 30,
        'fresh top-edge intent crawls upward',
      );
      await page.keyboard.press('Escape');
      const reset = await page.evaluate(() => scrollY);
      await page.waitForTimeout(200);
      assert.ok(Math.abs((await page.evaluate(() => scrollY)) - reset) < 3);
    } finally {
      await page.close();
    }
  },
);

test(
  'edge crawling stops on pause, toggle off, blur, pointer leave and reduced motion',
  { timeout: 20000 },
  async () => {
    const page = await fixture({ path: '/reference.html?theme=night' });
    try {
      await page.locator('#demo-follow').check();
      await start(page);
      await page.evaluate(() => scrollTo(0, 3500));
      async function beginEdge() {
        await page.mouse.move(600, 500);
        await page.waitForTimeout(100);
        await page.mouse.move(600, 995);
        await page.waitForTimeout(700);
      }
      async function still() {
        await page.waitForTimeout(60);
        const y = await page.evaluate(() => scrollY);
        await page.waitForTimeout(220);
        assert.ok(Math.abs((await page.evaluate(() => scrollY)) - y) < 3);
      }
      await beginEdge();
      await page.locator(`${root} .pause`).dispatchEvent('click');
      await still();
      await page.locator(`${root} .pause`).dispatchEvent('click');
      await still();
      await beginEdge();
      await page.locator('#demo-follow').evaluate((el) => {
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await still();
      await page.locator('#demo-follow').evaluate((el) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await still();
      await beginEdge();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await still();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await still();
      await beginEdge();
      await page.mouse.move(-20, 500);
      await still();
      await beginEdge();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await still();
      await page.mouse.move(600, 5);
      await page.waitForTimeout(500);
      await still();
      await page.keyboard.press('Escape');
    } finally {
      await page.close();
    }
  },
);

test(
  'temperaments produce observably different lock and strike rhythms',
  { timeout: 26000 },
  async () => {
    const observations = {};
    for (const personality of ['feral', 'curious', 'dreamy']) {
      const page = await hoverFixture(personality);
      try {
        await page.evaluate(() => {
          globalThis.rhythm = [];
          function tick(t) {
            const h = document.querySelector('[data-cr4wler-root]');
            if (h && rhythm.at(-1)?.phase !== h.dataset.phase)
              rhythm.push({ phase: h.dataset.phase, t });
            if (rhythm.length < 40) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
        await page.locator('#aim-b').hover();
        await page.waitForFunction(() => rhythm.some((x) => x.phase === 'aftermath'), null, {
          timeout: 7500,
        });
        observations[personality] = await page.evaluate(() => {
          const lock = rhythm.find((x) => x.phase === 'lock'),
            strike = rhythm.find((x) => x.phase === 'strike'),
            after = rhythm.find((x) => x.phase === 'aftermath');
          return { lock: strike.t - lock.t, strike: after.t - strike.t };
        });
      } finally {
        await page.close();
      }
    }
    assert.ok(observations.feral.lock + 30 < observations.curious.lock);
    assert.ok(observations.curious.lock + 30 < observations.dreamy.lock);
    assert.ok(observations.feral.strike + 40 < observations.curious.strike);
    assert.ok(observations.curious.strike + 40 < observations.dreamy.strike);
  },
);

async function auditRig(page) {
  await page.evaluate(() => {
    globalThis.rigAudit = {
      samples: 0,
      maxReachRatio: 0,
      maxBoneRatio: 0,
      finite: true,
      phases: [],
      types: [],
    };
    function sample() {
      const canvas = document
        .querySelector('[data-cr4wler-root]')
        ?.shadowRoot?.querySelector('canvas.visitor');
      if (canvas?.dataset.rig) {
        const d = JSON.parse(canvas.dataset.rig),
          a = rigAudit;
        a.samples++;
        a.finite &&= d.finite;
        a.maxReachRatio = Math.max(a.maxReachRatio, d.maxReach / d.reachLimit);
        a.maxBoneRatio = Math.max(a.maxBoneRatio, d.maxBoneLength / d.boneLimit);
        if (a.phases.at(-1) !== d.recovery) a.phases.push(d.recovery);
        if (!a.types.includes(d.type)) a.types.push(d.type);
      }
      if (rigAudit.samples < 5000) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}
async function rig(page) {
  return page.locator(`${root} canvas.visitor`).evaluate((el) => JSON.parse(el.dataset.rig));
}
async function assertRecovered(page) {
  await page.waitForFunction(
    () => {
      const c = document
        .querySelector('[data-cr4wler-root]')
        ?.shadowRoot?.querySelector('canvas.visitor');
      if (!c?.dataset.rig) return false;
      const r = JSON.parse(c.dataset.rig);
      return (
        r.recovery === 'none' &&
        r.body.x >= 25 &&
        r.body.x <= innerWidth - 25 &&
        r.body.y >= 30 &&
        r.body.y <= innerHeight - 30
      );
    },
    null,
    { timeout: 2500 },
  );
}
function assertBounded(a) {
  assert.ok(a.samples > 10);
  assert.equal(a.finite, true, 'all joint coordinates remain finite');
  assert.ok(a.maxReachRatio <= 1.001, `contact reach ratio ${a.maxReachRatio}`);
  assert.ok(a.maxBoneRatio <= 1.001, `fixed bone ratio ${a.maxBoneRatio}`);
}

test(
  'all three spider anatomies recover from rapid wheel, flings, reversals and document jumps',
  { timeout: 45000 },
  async () => {
    for (const personality of ['curious', 'dreamy', 'feral']) {
      const page = await fixture({ path: '/reference.html?theme=night' });
      try {
        await page.evaluate(() => document.querySelector('#reference-volume-8').scrollIntoView());
        const originalY = await page.evaluate(() => scrollY);
        const original = await page.locator('main').innerHTML();
        await page.locator('#demo-personality').selectOption(personality);
        await start(page);
        await waitForPiece(page);
        await auditRig(page);
        const records = await page
          .locator(`${root} .piece`)
          .evaluateAll((ns) => ns.map((n) => n.dataset.recordId));
        await page.mouse.move(600, 500);
        await page.mouse.wheel(0, 1800);
        await page.waitForTimeout(120);
        for (const delta of [240, 240, -320, 400, -460, 360]) {
          await page.mouse.wheel(0, delta);
          await page.waitForTimeout(55);
        }
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(150);
        await page.keyboard.press('Home');
        await page.waitForTimeout(150);
        await page.keyboard.press('End');
        await page.waitForTimeout(150);
        await page.setViewportSize({ width: 1100, height: 720 });
        await page.evaluate(() => scrollTo(0, 3500));
        await assertRecovered(page);
        const restingY = await page.evaluate(() => scrollY);
        await page.waitForTimeout(300);
        assert.equal(
          await page.evaluate(() => scrollY),
          restingY,
          'recovery never moves the document',
        );
        await page.locator(`${root} .pause`).click();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.evaluate((y) => scrollTo(0, y), originalY);
        await page.waitForTimeout(180);
        const returned = await page
          .locator(`${root} .piece`)
          .evaluateAll((ns) => ns.map((n) => n.dataset.recordId));
        for (const id of records)
          assert.ok(returned.includes(id), 'committed damage survives all navigation');
        const a = await page.evaluate(() => rigAudit);
        assertBounded(a);
        assert.ok(a.phases.includes('flight') && a.phases.includes('land'));
        assert.deepEqual(a.types, [
          personality === 'curious'
            ? 'widow'
            : personality === 'dreamy'
              ? 'orb-weaver'
              : 'jumping spider',
        ]);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('main').innerHTML(), original);
        assert.equal(await page.locator(root).count(), 0);
      } finally {
        await page.close();
      }
    }
  },
);

test(
  'scrolling mid-strike releases an offscreen grip and preserves the committed mark',
  { timeout: 16000 },
  async () => {
    const page = await fixture({ path: '/reference.html' });
    try {
      await page.evaluate(() => document.querySelector('#reference-volume-8').scrollIntoView());
      const originalY = await page.evaluate(() => scrollY),
        html = await page.locator('main').innerHTML();
      await page.locator('#demo-personality').selectOption('dreamy');
      await page.locator('#demo-follow').check();
      await start(page);
      await auditRig(page);
      await page.locator('#reference-target-8-9').hover();
      await page.waitForFunction(
        () => document.querySelector('[data-cr4wler-root]')?.dataset.phase === 'strike',
      );
      const id = await page.locator(root).getAttribute('data-strike-record');
      await page.evaluate(() => scrollBy(0, 6000));
      await assertRecovered(page);
      assert.ok((await rig(page)).recoveries > 0);
      const y = await page.evaluate(() => scrollY);
      await page.waitForTimeout(1000);
      assert.equal(
        await page.evaluate(() => scrollY),
        y,
        'follow mode cannot fight external scrolling',
      );
      await page.locator(`${root} .pause`).click();
      await page.evaluate((y) => scrollTo(0, y), originalY);
      await page.waitForTimeout(200);
      assert.ok(
        await page
          .locator(`${root} .piece`)
          .evaluateAll((ns, id) => ns.some((n) => n.dataset.recordId === id), id),
      );
      assertBounded(await page.evaluate(() => rigAudit));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main').innerHTML(), html);
    } finally {
      await page.close();
    }
  },
);

test(
  'paused and reduced-motion rapid scrolling use calm finite poses across resize and type changes',
  { timeout: 20000 },
  async () => {
    const page = await fixture({ path: '/reference.html?theme=night' });
    try {
      await start(page);
      await waitForPiece(page);
      await page.locator(`${root} .pause`).click();
      await auditRig(page);
      for (const personality of ['feral', 'dreamy', 'curious']) {
        await page.locator('#demo-personality').selectOption(personality);
        for (const y of [32000, 3000, 60000, 0]) {
          await page.evaluate((y) => scrollTo(0, y), y);
          await page.waitForTimeout(60);
        }
        await page.setViewportSize({ width: 900, height: 600 });
        await page.waitForTimeout(80);
        const r = await rig(page);
        assert.equal(r.recovery, 'none');
        assert.ok(r.maxReach <= r.reachLimit + 0.01);
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(100);
      const count = await page.locator(root).getAttribute('data-fragments');
      for (const y of [32000, 80000, 2000, 0]) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await page.waitForTimeout(100);
      }
      const a = await rig(page);
      assert.equal(a.recovery, 'none');
      await page.waitForTimeout(200);
      assert.deepEqual(await rig(page), a, 'quiet rig has no ongoing animation');
      assert.equal(await page.locator(root).getAttribute('data-fragments'), count);
      assertBounded(await page.evaluate(() => rigAudit));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
    } finally {
      await page.close();
    }
  },
);

test(
  'external programmatic scrolling disarms edge intent through follow toggles, blur and recovery',
  { timeout: 14000 },
  async () => {
    const page = await fixture({ path: '/reference.html' });
    try {
      await page.evaluate(() => scrollTo(0, 3500));
      await page.locator('#demo-follow').check();
      await start(page);
      await page.mouse.move(600, 995);
      await page.waitForTimeout(900);
      await page.evaluate(() => scrollTo(0, 24000));
      await page.waitForTimeout(100);
      const y = await page.evaluate(() => scrollY);
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(() => scrollY), y);
      assert.equal(await page.locator(root).getAttribute('data-edge-velocity'), '0.0');
      await page.locator('#demo-follow').uncheck();
      await page.locator('#demo-follow').check();
      await page.evaluate(() => dispatchEvent(new Event('blur')));
      await page.evaluate(() => dispatchEvent(new Event('focus')));
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => scrollY), y);
      await assertRecovered(page);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
    } finally {
      await page.close();
    }
  },
);
