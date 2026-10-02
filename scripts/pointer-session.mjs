/** Real pointer interaction shared by standalone capture and installed-extension CI.
 * The pointer marker is recording instrumentation, not part of the extension. */
import assert from 'node:assert/strict';

export async function preparePointerSession(page, options = {}) {
  await page.evaluate((surface) => {
    const marker = document.createElement('div');
    marker.dataset.cr4wlerIgnore = '';
    marker.id = 'recording-pointer';
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText =
      'position:fixed;left:-100px;top:-100px;width:13px;height:13px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #131625;z-index:2147483646;pointer-events:none;transform:translate(-50%,-50%);background:#13162599';
    document.documentElement.append(marker);
    const label = document.createElement('div');
    label.dataset.cr4wlerIgnore = '';
    label.id = 'recording-type';
    label.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:7px 12px;border:1px solid #8df9d755;border-radius:50px;background:#10131aee;color:#b8ffde;font:10px monospace;z-index:2147483646;pointer-events:none';
    document.documentElement.append(label);
    globalThis.pointerAudit = {
      frames: [],
      longTasks: [],
      phases: [],
      effects: [],
      responses: [],
      intent: null,
      rig: {
        samples: 0,
        maxReachRatio: 0,
        maxBoneRatio: 0,
        finite: true,
        recoveries: [],
        types: [],
      },
    };
    document.addEventListener(
      'pointermove',
      (event) => {
        marker.style.left = `${event.clientX}px`;
        marker.style.top = `${event.clientY}px`;
        if (pointerAudit.intent && !pointerAudit.intent.inputAt)
          pointerAudit.intent.inputAt = performance.now();
      },
      { passive: true },
    );
    new PerformanceObserver((list) =>
      pointerAudit.longTasks.push(
        ...list.getEntries().map((e) => ({ at: e.startTime, duration: e.duration })),
      ),
    ).observe({ type: 'longtask' });
    let previous;
    document.addEventListener('visibilitychange', () => {
      previous = undefined;
    });
    function sample(now) {
      if (!document.hidden) {
        if (previous !== undefined) pointerAudit.frames.push(now - previous);
        previous = now;
      }
      const host = document.querySelector('[data-cr4wler-root]');
      if (host) {
        const type = {
          curious: 'Curious / Widow',
          dreamy: 'Dreamy / Orb-weaver',
          feral: 'Feral / Jumping spider',
        }[host.dataset.personality];
        label.textContent = `${surface} · ${type ?? 'arriving'}`;
        const canvas = host.shadowRoot.querySelector('canvas.visitor');
        if (canvas?.dataset.rig) {
          const d = JSON.parse(canvas.dataset.rig),
            a = pointerAudit.rig;
          a.samples++;
          a.finite &&= d.finite;
          a.maxReachRatio = Math.max(a.maxReachRatio, d.maxReach / d.reachLimit);
          a.maxBoneRatio = Math.max(a.maxBoneRatio, d.maxBoneLength / d.boneLimit);
          if (!a.types.includes(d.type)) a.types.push(d.type);
          const last = a.recoveries.at(-1);
          if (last?.phase !== d.recovery || last?.type !== d.type)
            a.recoveries.push({ type: d.type, phase: d.recovery, reason: d.reason, at: now });
        }
        const phase = host.dataset.phase;
        if (phase && pointerAudit.phases.at(-1)?.phase !== phase)
          pointerAudit.phases.push({ phase, at: now });
        for (const node of host.shadowRoot.querySelectorAll('.piece'))
          if (!pointerAudit.effects.includes(node.dataset.effect))
            pointerAudit.effects.push(node.dataset.effect);
        const intent = pointerAudit.intent;
        if (intent?.inputAt && !intent.ackAt) {
          const selected = [...CSS.highlights].some(
            ([name, h]) =>
              name.endsWith('-selection') &&
              [...h].some((r) => document.getElementById(intent.id)?.contains(r.startContainer)),
          );
          if (selected) {
            intent.ackAt = now;
            pointerAudit.responses.push({
              target: intent.id,
              personality: intent.personality,
              inputToSelectionMs: now - intent.inputAt,
            });
          }
        }
      }
      if (pointerAudit.frames.length < 9000) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, options.surface ?? 'Local playground');
}

async function pointAt(page, id, personality) {
  const point = await page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  await page.evaluate(
    ({ id, personality }) =>
      (pointerAudit.intent = { id, personality, inputAt: null, ackAt: null }),
    { id, personality },
  );
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => pointerAudit.intent?.ackAt !== null, null, { timeout: 2500 });
  return point;
}
async function waitForMark(page, id) {
  await page.waitForFunction(
    (id) =>
      [...CSS.highlights].some(
        ([name, h]) =>
          name.startsWith('cr4wler-') &&
          !name.endsWith('-selection') &&
          [...h].some((r) => document.getElementById(id)?.contains(r.startContainer)),
      ),
    id,
    { timeout: 10000 },
  );
}
export async function runPointerSession(page, controls, dir, prefix, options = {}) {
  const screenshot = async (suffix) => {
    if (options.screenshots !== false)
      await page.screenshot({ path: `${dir}/${prefix}-${suffix}.png`, caret: 'initial' });
  };
  await controls.setPersonality('feral');
  await controls.setFollow(true);
  await controls.summon();
  await page.bringToFront();
  await page.waitForSelector('[data-cr4wler-root]');
  // Exact synthetic fixture ids make the recording assertions independent of text.
  const targets = await page.evaluate(() => {
    const links = [...document.querySelectorAll('#reference-volume-8 li>a:first-of-type')];
    return [12, 3, 8, 15, 6, 10].map((i) => links[i].id);
  });
  const originalScroll = await page.evaluate(() => scrollY);
  const originalPoint = await pointAt(page, targets[0], 'feral');
  const redirectedPoint = await pointAt(page, targets[1], 'feral');
  await waitForMark(page, targets[1]);
  const firstSource = await page.evaluate(
    () =>
      [...CSS.highlights]
        .filter(([n]) => n.startsWith('cr4wler-') && !n.endsWith('-selection'))
        .flatMap(([, h]) => [...h].map((r) => r.startContainer.parentElement?.closest('a')?.id))[0],
  );
  assert.equal(firstSource, targets[1], 'second hover must replace first approach');
  await page.waitForTimeout(450);
  await screenshot('redirect');
  for (const id of targets.slice(2, 4)) {
    await pointAt(page, id, 'feral');
    await waitForMark(page, id);
    await page.waitForTimeout(550);
  }
  await controls.setPersonality('dreamy');
  await page.bringToFront();
  await pointAt(page, targets[4], 'dreamy');
  await waitForMark(page, targets[4]);
  await page.waitForTimeout(600);
  await controls.setPersonality('curious');
  await page.bringToFront();
  await pointAt(page, targets[5], 'curious');
  await waitForMark(page, targets[5]);
  await page.waitForTimeout(550);
  await controls.setPersonality('feral');
  await page.bringToFront();
  await screenshot('live');
  const retained = await page
    .locator('[data-cr4wler-root] .piece')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId));
  const rapidScroll = [];
  await page.evaluate(() => (pointerAudit.intent = null));
  for (const personality of ['curious', 'dreamy', 'feral']) {
    await controls.setPersonality(personality);
    await page.bringToFront();
    await page.mouse.move(620, 500);
    await page.waitForTimeout(220);
    await screenshot(`${personality}-type`);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(100);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(120);
    await screenshot(`${personality}-recovery`);
    await page.waitForFunction(
      () => {
        const c = document
          .querySelector('[data-cr4wler-root]')
          ?.shadowRoot?.querySelector('canvas.visitor');
        if (!c?.dataset.rig) return false;
        const r = JSON.parse(c.dataset.rig);
        return r.recovery === 'none' && r.body.y >= 30 && r.body.y <= innerHeight - 30;
      },
      null,
      { timeout: 3000 },
    );
    const after = await page.evaluate(() => scrollY);
    await page.waitForTimeout(180);
    assert.equal(
      await page.evaluate(() => scrollY),
      after,
      'recovery cannot fight wheel scrolling',
    );
    rapidScroll.push({
      personality,
      before,
      after,
      bodyReturnedVisible: true,
      pageUnmovedAfterInput: true,
    });
    await page.evaluate((y) => scrollTo(0, y), originalScroll);
    await page.waitForTimeout(700);
  }
  await controls.setPersonality('feral');
  await page.bringToFront();

  await page.mouse.move(620, 995);
  await page.waitForTimeout(2600);
  const edgeAdvanced = await page.evaluate(() => scrollY);
  assert.ok(edgeAdvanced > originalScroll + 100, 'bottom edge should advance the document');
  await page.mouse.move(620, 500);
  await page.waitForTimeout(80);
  const stopped = await page.evaluate(() => scrollY);
  await page.waitForTimeout(260);
  assert.ok(
    Math.abs((await page.evaluate(() => scrollY)) - stopped) < 3,
    'edge scroll stops at center',
  );
  await screenshot('edge-crawl');
  await page.mouse.move(620, 5);
  await page.waitForTimeout(2000);
  await page.mouse.move(620, 500);
  await page.waitForTimeout(150);
  const edgeReturned = await page.evaluate(() => scrollY);
  assert.ok(edgeReturned < edgeAdvanced - 80, 'top edge should move back toward the earlier trail');
  await controls.pause();
  await page.bringToFront();
  await page.evaluate(() => document.querySelector('#reference-volume-30').scrollIntoView());
  await page.waitForTimeout(350);
  assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0);
  await page.evaluate((y) => scrollTo(0, y), originalScroll);
  await page.waitForTimeout(350);
  const returned = await page
    .locator('[data-cr4wler-root] .piece')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.recordId));
  for (const id of retained)
    assert.ok(returned.includes(id), 'persistent trail must return after deep scroll');
  await screenshot('trail-returned');
  await controls.pause();
  await page.bringToFront();
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  await screenshot('restored');
  assert.equal(await page.locator('[data-cr4wler-root]').count(), 0);
  const stats = await page.evaluate(() => pointerAudit);
  assert.equal(stats.rig.finite, true);
  assert.ok(stats.rig.maxReachRatio <= 1.001, 'all recorded contacts stay within fixed reach');
  assert.ok(stats.rig.maxBoneRatio <= 1.001, 'all recorded bones retain physical length');
  assert.equal(stats.rig.types.length, 3);
  const frames = stats.frames.filter((n) => n > 0).sort((a, b) => a - b);
  return {
    pointerInstrumentation:
      'Visible ring follows actual pointer events; type label is recording instrumentation. No Chrome APIs mocked.',
    rapidScroll,
    rig: stats.rig,
    hoverPreemption: { abandoned: targets[0], next: targets[1], originalPoint, redirectedPoint },
    edgeScroll: {
      initial: originalScroll,
      advanced: edgeAdvanced,
      returned: edgeReturned,
      centerStops: true,
    },
    persistentRecordIds: retained,
    responses: stats.responses,
    effects: stats.effects,
    phases: stats.phases,
    metrics: {
      frameSamples: frames.length,
      medianFrameMs: frames[Math.floor(frames.length * 0.5)],
      p95FrameMs: frames[Math.floor(frames.length * 0.95)],
      p99FrameMs: frames[Math.floor(frames.length * 0.99)],
      over50ms: frames.filter((n) => n > 50).length,
      longTasks: stats.longTasks,
    },
  };
}
