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
  await page.goto(`${base}/pointer.html?autostart=off`);
  await page.evaluate((personality) => {
    globalThis.runtime = __cr4wlerPlayground.engine;
    globalThis.feedback = [];
    globalThis.inputAt = 0;
    window.addEventListener('pointermove', () => {
      inputAt = performance.now();
    });
    const frame = runtime.frame;
    runtime.frame = (now) => {
      frame(now);
      if (runtime.lastSpiderOptions?.attention && inputAt) {
        feedback.push(performance.now() - inputAt);
        inputAt = 0;
      }
    };
    runtime.summon({ personality, followMouse: true });
  }, personality);
  await page.waitForTimeout(1700);
  return page;
}
async function aim(page, id, x = 80) {
  const r = await page.locator('#' + id).boundingBox();
  await page.mouse.move(r.x + x, r.y + 14);
}
async function phase(page, mode) {
  await page.waitForFunction((mode) => runtime.mode === mode, mode, { polling: 'raf' });
}
async function still(page, read = () => scrollY) {
  await page.waitForTimeout(80);
  const before = await page.evaluate(read);
  await page.waitForTimeout(320);
  assert.ok(Math.abs((await page.evaluate(read)) - before) < 2);
}

for (const followMouse of [true, false]) {
  test(`protected idle keeps its gesture and quiet delay through tremor, then yields immediately (follow ${followMouse})`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    try {
      await page.goto(`${base}/idle.html?autostart=off`);
      await page.evaluate((followMouse) => {
        // Protect the whole fixture so disabled following cannot autonomously
        // choose another source. Keep the real idle scheduler and frame clocks.
        document.querySelector('main').setAttribute('data-cr4wler-ignore', '');
        globalThis.runtime = __cr4wlerPlayground.engine;
        globalThis.pointerEvents = 0;
        window.addEventListener('pointermove', () => pointerEvents++);
        runtime.idleSeed = 42;
        runtime.summon({ personality: 'curious', followMouse });
      }, followMouse);
      await page.mouse.move(144, 260); // Real pointer remains inside a protected input.
      await page.waitForFunction(
        () => {
          const action = runtime.spider.idleScheduler.action;
          return (
            runtime.spider.idleGesture &&
            action?.elapsed > 0.15 &&
            action.duration - action.elapsed > 0.8
          );
        },
        null,
        { polling: 'raf', timeout: 15000 },
      );
      await page.evaluate(() => {
        globalThis.idleBefore = {
          gesture: runtime.spider.idleGesture,
          action: runtime.spider.idleScheduler.action,
          elapsed: runtime.spider.idleScheduler.action.elapsed,
          until: runtime.idleInputUntil,
          events: pointerEvents,
        };
      });
      for (const offset of [0, 1, -1, 2, 0, 1, 2, -1, 0]) {
        await page.mouse.move(144 + offset, 260);
        await page.waitForTimeout(15);
        assert.deepEqual(
          await page.evaluate(() => ({
            sameGesture: runtime.spider.idleGesture === idleBefore.gesture,
            sameAction: runtime.spider.idleScheduler.action === idleBefore.action,
            sameDelay: runtime.idleInputUntil === idleBefore.until,
            hunt: !!runtime.candidate || !!runtime.current || runtime.fragments.length > 0,
            scroll: scrollY,
            edge: runtime.edgeDirection,
          })),
          { sameGesture: true, sameAction: true, sameDelay: true, hunt: false, scroll: 0, edge: 0 },
        );
      }
      assert.ok(await page.evaluate(() => pointerEvents - idleBefore.events >= 9));
      assert.ok(
        await page.evaluate(() => runtime.spider.idleScheduler.action.elapsed > idleBefore.elapsed),
      );
      await page.mouse.move(147, 260); // Cross 3px from the meaningful-input anchor.
      assert.deepEqual(
        await page.evaluate(() => ({
          gesture: runtime.spider.idleGesture,
          action: runtime.spider.idleScheduler.action,
          delayRenewed: runtime.idleInputUntil > idleBefore.until,
          hunt: !!runtime.candidate || !!runtime.current || runtime.fragments.length > 0,
          scroll: scrollY,
          edge: runtime.edgeDirection,
        })),
        { gesture: null, action: null, delayRenewed: true, hunt: false, scroll: 0, edge: 0 },
      );
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => !!runtime.spider.idleGesture), false);
      assert.equal(await page.locator('#protected').inputValue(), 'Keep this value');
    } finally {
      await page.close();
    }
  });
}

test('a moving sweep acknowledges attention but waits for local stability before choosing exactly one target', async () => {
  const page = await fixture();
  try {
    const r = await page.locator('#track').boundingBox();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(r.x + 25 + i * 45, r.y + 15);
      await page.waitForTimeout(25);
    }
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
    assert.equal(await page.evaluate(() => !!runtime.candidate), false);
    await page.waitForFunction(() => runtime.candidate?.element.id === 'track');
    await page.waitForFunction(
      () => runtime.fragments.length === 1 && !runtime.current && !runtime.settling,
    );
    await page.waitForTimeout(650);
    assert.deepEqual(await page.evaluate(() => runtime.fragments.map((f) => f.target.element.id)), [
      'track',
    ]);
    const latency = await page.evaluate(() => feedback);
    assert.ok(latency.length >= 10);
    assert.ok(Math.max(...latency) < 180, 'feedback arrives on the next available rendered frame');
  } finally {
    await page.close();
  }
});

test('a 2px boundary tremor retains one target; a deliberate crossing replaces uncommitted preparation', async () => {
  const page = await fixture();
  try {
    const r = await page.locator('#target-a').boundingBox();
    await aim(page, 'target-a');
    await page.waitForFunction(() => runtime.candidate?.element.id === 'target-a');
    const intent = await page.evaluate(() => runtime.hover.at);
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(r.x + 80 + (i % 2 ? 1 : -1), r.y + 14);
      await page.waitForTimeout(10);
    }
    assert.equal(await page.evaluate(() => runtime.hover.at), intent);
    await phase(page, 'prepare');
    await aim(page, 'target-b');
    await page.waitForFunction(() => runtime.candidate?.element.id === 'target-b');
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
    await phase(page, 'strike');
    await aim(page, 'track');
    assert.equal(await page.evaluate(() => runtime.current?.target.element.id), 'target-b');
    await page.waitForFunction(() => runtime.candidate?.element.id === 'track');
    assert.equal(await page.evaluate(() => !!runtime.settling), true);
  } finally {
    await page.close();
  }
});

test('sub-deadband crossing of adjacent text boundaries does not swap the selected target', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:900px;top:550px;font:24px Georgia;white-space:nowrap';
      el.innerHTML = '<span id="boundary-a">AmberEdge</span><span id="boundary-b">BlueEdge</span>';
      document.body.append(el);
    });
    const r = await page.locator('#boundary-a').boundingBox();
    const x = r.x + r.width - 1.5,
      y = r.y + r.height / 2;
    await page.mouse.move(x, y);
    await page.waitForFunction(() => runtime.hover?.target.element.id === 'boundary-a');
    const at = await page.evaluate(() => runtime.hover.at);
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(x + (i % 2 ? 0 : 1.5), y);
      await page.waitForTimeout(12);
      assert.equal(await page.evaluate(() => runtime.hover?.target.element.id), 'boundary-a');
    }
    assert.equal(await page.evaluate(() => runtime.hover.at), at);
    await page.mouse.move(x + 50, y);
    await page.waitForFunction(() => runtime.hover?.target.element.id === 'boundary-b');
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
  } finally {
    await page.close();
  }
});

test('an exhausted ancestor budget cannot turn a deeply nested edge into document navigation', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      const outer = document.createElement('div');
      outer.style.cssText =
        'position:absolute;left:900px;top:850px;width:300px;height:150px;overflow:auto';
      let inner = outer;
      for (let i = 0; i < 40; i++) {
        const child = document.createElement('div');
        inner.append(child);
        inner = child;
      }
      inner.style.height = '1400px';
      inner.id = 'deep-edge';
      document.body.append(outer);
    });
    await page.mouse.move(1000, 995);
    await page.waitForTimeout(750);
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.evaluate(() => runtime.edgeDirection), 0);
  } finally {
    await page.close();
  }
});

test('nested edge pursuit owns its container, stops at its boundary, and never spills into document scrolling', async () => {
  const page = await fixture();
  try {
    const r = await page.locator('#nested').boundingBox();
    await page.mouse.move(r.x + 300, r.y + r.height - 5);
    await page.waitForTimeout(900);
    assert.ok(await page.evaluate(() => document.querySelector('#nested').scrollTop > 35));
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
    await page.locator('#nested').evaluate((el) => {
      el.scrollTop += 70;
    });
    await page.waitForTimeout(80);
    assert.equal(
      await page.evaluate(() => runtime.edgeDirection),
      0,
      'external nested scrolling disarms pursuit',
    );
    await page.evaluate(() => {
      const el = document.querySelector('#nested');
      el.scrollTop = el.scrollHeight - el.clientHeight - 5;
    });
    await page.waitForTimeout(80);
    await page.mouse.move(r.x + 300, r.y + 100);
    await page.mouse.move(r.x + 300, r.y + r.height - 5);
    await page.waitForTimeout(550);
    await still(page, () => document.querySelector('#nested').scrollTop);
    assert.equal(await page.evaluate(() => scrollY), 0);
  } finally {
    await page.close();
  }
});

test('edge travel expires with stale input and wheel, PageDown, touch and external nested scroll yield without rearming', async () => {
  const page = await fixture('feral');
  try {
    await page.mouse.move(1000, 995);
    await page.waitForTimeout(900);
    assert.ok(await page.evaluate(() => scrollY > 40));
    await page.waitForTimeout(2400);
    await still(page);
    assert.equal(await page.evaluate(() => runtime.pointerActive), false);
    for (const action of ['wheel', 'keyboard', 'touch']) {
      await page.mouse.move(1000, 500);
      await page.mouse.move(1000, 995);
      await page.waitForTimeout(550);
      if (action === 'wheel') await page.mouse.wheel(0, 80);
      if (action === 'keyboard') await page.keyboard.press('PageDown');
      if (action === 'touch')
        await page.evaluate(() => window.dispatchEvent(new Event('touchstart')));
      // PageDown has its own native scroll animation; wait for that navigation.
      await page.waitForTimeout(350);
      await still(page);
      assert.equal(await page.evaluate(() => runtime.edgeDirection), 0);
      await page.waitForTimeout(900);
    }
  } finally {
    await page.close();
  }
});

test('species change, controlled visibility and blur discard uncommitted intent and require new input', async () => {
  const page = await fixture();
  try {
    for (const action of ['species', 'visibility', 'blur']) {
      await aim(page, 'target-a');
      await phase(page, 'prepare');
      await page.evaluate((action) => {
        if (action === 'species') runtime.configure({ personality: 'curious' });
        if (action === 'visibility') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        }
        if (action === 'blur') window.dispatchEvent(new Event('blur'));
      }, action);
      await page.waitForTimeout(150);
      assert.equal(
        await page.evaluate(
          () => !!runtime.candidate || !!runtime.hover || runtime.edgeDirection !== 0,
        ),
        false,
      );
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
      await page.mouse.move(1200, 450);
    }
    await aim(page, 'target-a');
    await phase(page, 'prepare');
    await page.evaluate(() => {
      runtime.pause();
      runtime.configure({ personality: 'feral' });
    });
    assert.deepEqual(
      await page.evaluate(() => ({
        candidate: !!runtime.candidate,
        selector: !!runtime.spider.options.selector,
        grip: !!runtime.spider.options.grip,
        pointer: !!runtime.spider.options.pointer,
      })),
      { candidate: false, selector: false, grip: false, pointer: false },
    );
    await page.evaluate(() => runtime.pause());
    await page.waitForTimeout(550);
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
    await page.evaluate(() => {
      runtime.restore();
      runtime.summon({ followMouse: true });
      runtime.summon();
    });
    assert.equal(await page.locator('[data-cr4wler-root]').count(), 1);
    assert.equal(await page.evaluate(() => runtime.pointerActive), false);
  } finally {
    await page.close();
  }
});

test('native button, editor and link clicks stay native and discard pending hunt ownership', async () => {
  const page = await fixture();
  try {
    await page.evaluate(() => {
      globalThis.clicks = 0;
      document.querySelector('#native-button').addEventListener('click', () => clicks++);
    });
    await aim(page, 'target-a');
    await phase(page, 'prepare');
    await page.locator('#native-button').click();
    assert.equal(await page.evaluate(() => clicks), 1);
    assert.equal(await page.evaluate(() => !!runtime.candidate), false);
    await page.locator('#protected-input').fill('User edit survives');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => runtime.fragments.length), 0);
    await page.locator('#native-link').click();
    assert.ok(page.url().endsWith('#destination'));
    await page.evaluate(() => runtime.restore());
    assert.equal(await page.locator('#protected-input').inputValue(), 'User edit survives');
  } finally {
    await page.close();
  }
});
