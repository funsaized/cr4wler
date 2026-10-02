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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  await page.goto(base);
  return page;
}
async function pieces(page) {
  return page.locator(`${root} .piece`).count();
}
async function waitForPiece(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-cr4wler-root]')?.shadowRoot?.querySelector('.piece'),
    {},
    { timeout: 10000 },
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
      const texts = await page.locator(`${root} .piece`).allTextContents();
      assert.deepEqual(texts, ['A wonderfully eligible phrase']);
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
      assert.deepEqual(await page.locator(`${root} .piece`).allTextContents(), [
        'A fresh page after navigation',
      ]);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(root).count(), 0);
    } finally {
      await page.close();
    }
  },
);

test(
  'scroll and resize release fragments; reduced motion stays still',
  { timeout: 18000 },
  async () => {
    const page = await fixture();
    try {
      await start(page);
      await waitForPiece(page);
      await page.evaluate(() => scrollTo(0, 450));
      await page.waitForTimeout(100);
      assert.equal(await pieces(page), 0);
      await page.setViewportSize({ width: 1100, height: 900 });
      assert.equal(await pieces(page), 0);
      await page.keyboard.press('Escape');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await start(page);
      await page.waitForTimeout(700);
      assert.equal(await pieces(page), 0);
      const first = await page.locator(`${root} canvas`).evaluate((c) => c.toDataURL());
      await page.waitForTimeout(300);
      assert.equal(await page.locator(`${root} canvas`).evaluate((c) => c.toDataURL()), first);
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
    await page.locator('#summon').click();
    assert.equal(await page.locator('#summon').isDisabled(), true);
    assert.equal(await page.locator('#pause').isDisabled(), false);
    assert.equal(
      (await page.evaluate(() => sent.find((x) => x.action === 'summon'))).settings.personality,
      'feral',
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
