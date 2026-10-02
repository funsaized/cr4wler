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
      assert.ok(strike.at - lock.at >= 550, 'Curious must hold its lock for an anticipation pause');
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

test('mouse following is opt-in, bounded and can be disabled', { timeout: 14000 }, async () => {
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
      Math.hypot(followed.x - 340, followed.y - 650) <
        Math.hypot(initial.x - 340, initial.y - 650) - 100,
    );
    assert.ok(
      Math.hypot(followed.x - 340, followed.y - 650) > 55,
      'spider maintains space around pointer',
    );
    await page.locator('#demo-follow').uncheck();
    await page.mouse.move(900, 200, { steps: 10 });
    await page.waitForTimeout(300);
    assert.equal(await visitor.getAttribute('data-motion'), 'explore');
    await page.keyboard.press('Escape');
  } finally {
    await page.close();
  }
});
