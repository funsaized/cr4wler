import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Pointer-driven material checks on the unmodified, installed content bundle. */
export async function captureMaterialSessions({
  context,
  cdp,
  id,
  worker,
  dir,
  base = 'http://127.0.0.1:4173',
}) {
  const directory = `${dir}/materials`;
  await mkdir(directory, { recursive: true });
  const sessions = [];
  const bundleSha256 = createHash('sha256')
    .update(await readFile('dist/content.js'))
    .digest('hex');
  for (const theme of ['light', 'night'])
    for (const personality of ['curious', 'feral', 'dreamy']) {
      const prefix = `${personality}-${theme}`;
      const page = await context.newPage();
      const capture = (options) => page.screenshot({ caret: 'initial', ...options });
      const video = page.video();
      let popup;
      const result = { personality, theme, passed: false, steps: [] };
      const requests = [],
        errors = [];
      try {
        await page.goto(`${base}/materials.html?autostart=off&theme=${theme}`);
        await page.bringToFront();
        const original = await page.locator('main').innerHTML();
        const originalURL = page.url();
        await capture({ path: `${directory}/${prefix}-before.png` });
        page.on('request', (request) => requests.push(request.url()));
        page.on('pageerror', (error) => errors.push(error.message));
        const denied = await worker.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            return false;
          } catch {
            return true;
          }
        });
        assert.equal(denied, true, 'new fixture needs its own toolbar gesture');
        const tab = (
          await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })
        ).targetInfos.find((t) => t.url === originalURL);
        await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
        popup = await context.newPage();
        await page.bringToFront();
        await popup.goto(`chrome-extension://${id}/popup.html`);
        await popup.locator(`[data-personality="${personality}"]`).click();
        await popup.locator('#follow-mouse').check();
        await popup.locator('#summon').click();
        await page.waitForSelector('[data-cr4wler-root]');
        assert.equal(await page.locator('[data-cr4wler-root]').count(), 1);
        await page.bringToFront();
        const started = Date.now();
        for (const source of [
          'sample-text',
          'sample-image',
          'sample-card',
          'sample-button',
          'sample-foreign',
          'sample-rule',
        ]) {
          const point = await page.locator('#' + source).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: r.x + r.width / 2,
              y: el.id === 'sample-card' ? r.bottom - 7 : r.y + r.height / 2,
            };
          });
          const count = result.steps.length;
          await page.mouse.move(point.x, point.y);
          await page.waitForFunction(
            (count) => {
              const root = document.querySelector('[data-cr4wler-root]')?.shadowRoot;
              const pieces = [...(root?.querySelectorAll('.piece') ?? [])];
              return pieces.length === count + 1 && pieces.at(-1)?.dataset.phase === 'aftermath';
            },
            count,
            { timeout: 14000 },
          );
          const piece = await page
            .locator('[data-cr4wler-root] .piece')
            .last()
            .evaluate((el) => ({
              record: el.dataset.recordId,
              material: el.dataset.material,
              fallback: el.dataset.fallback,
              shards: el.children.length,
              finite: [...el.children].every((s) => !s.style.transform.includes('NaN')),
            }));
          assert.ok(piece.finite && piece.shards <= 16);
          // Read-only proof from the actual isolated controller, without changing its bundle/state.
          const [support] = await worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const engine = globalThis.__cr4wler;
                const anchors = [...engine.pageSurfaces.anchors.keys()];
                const owned = engine.fragments.filter((r) => r.sourceMasked);
                const d = engine.spider.diagnostics;
                return {
                  maskedOriginalAnchors: owned.reduce(
                    (count, r) =>
                      count + anchors.filter((node) => r.target.node.contains(node)).length,
                    0,
                  ),
                  fixedBones:
                    d.finite && d.maxReach <= d.reachLimit + 0.01 && d.maxBoneLength <= d.boneLimit,
                };
              },
            });
          });
          assert.equal(support.result.maskedOriginalAnchors, 0);
          assert.equal(support.result.fixedBones, true);
          result.steps.push({
            source,
            point,
            atMs: Date.now() - started,
            ...piece,
            support: support.result,
          });
          await capture({
            path: `${directory}/${prefix}-${source}.png`,
            clip: { x: 200, y: 175, width: 1040, height: 570 },
          });
        }
        assert.deepEqual(
          result.steps.map((s) => s.material),
          ['text', 'image', 'panel', 'panel', 'image', 'rule'],
        );
        assert.equal(result.steps[4].fallback, 'origin');
        await page.locator('[data-cr4wler-root] .pause').click();
        const frozen = await page
          .locator('[data-cr4wler-root] .pieces')
          .evaluate((el) => el.innerHTML);
        await page.waitForTimeout(150);
        assert.equal(
          await page.locator('[data-cr4wler-root] .pieces').evaluate((el) => el.innerHTML),
          frozen,
        );
        await capture({ path: `${directory}/${prefix}-aftermath.png` });
        await page.evaluate(() => scrollTo(0, 1300));
        await page.waitForTimeout(150);
        assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 0);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(150);
        assert.equal(await page.locator('[data-cr4wler-root] .piece').count(), 6);
        await capture({ path: `${directory}/${prefix}-return.png` });
        await page.evaluate(() => {
          document.querySelector('#fixture-input').value = 'User edit survives Reset';
        });
        await page.locator('[data-cr4wler-root] .restore').click();
        assert.equal(await page.locator('main').innerHTML(), original);
        assert.equal(await page.locator('#fixture-input').inputValue(), 'User edit survives Reset');
        assert.equal(page.url(), originalURL);
        assert.deepEqual(await page.evaluate(() => materialActions), {
          click: 0,
          input: 0,
          change: 0,
          submit: 0,
        });
        assert.deepEqual(requests, []);
        assert.deepEqual(errors, []);
        await capture({ path: `${directory}/${prefix}-reset.png` });
        result.passed = true;
        Object.assign(result, {
          exactRestore: true,
          scrollReturn: true,
          pause: true,
          userEditPreserved: true,
          requests,
          errors,
        });
      } catch (error) {
        result.error = error.message;
        const debug = await page.context().newCDPSession(page);
        const contexts = [];
        debug.on('Runtime.executionContextCreated', (event) => contexts.push(event.context.id));
        await debug.send('Runtime.enable');
        for (const contextId of contexts) {
          const state = await debug.send('Runtime.evaluate', {
            contextId,
            returnByValue: true,
            expression: `(() => { const e=globalThis.__cr4wler; if(!e?.spider)return null;
            const s=e.spider;return {phase:e.status().phase, destination:e.destination,body:s.body,
              velocity:s.velocity,angle:s.angle,lean:s.lean,weightShift:s.weightShift,
              bodyOffset:s.bodyOffset(),reach:s.diagnostics.reachLimit,legs:s.legs}; })()`,
          });
          if (state.result?.value) result.diagnostics = state.result.value;
        }
        await debug.detach();
        await capture({ path: `${directory}/${prefix}-failure.png` }).catch(() => {});
        throw error;
      } finally {
        sessions.push(result);
        await page.close();
        await popup?.close();
        if (video) {
          const normal = `${directory}/${prefix}-normal.webm`,
            slow = `${directory}/${prefix}-slow.webm`;
          await video.saveAs(normal);
          execFileSync(
            'ffmpeg',
            [
              '-y',
              '-i',
              normal,
              '-vf',
              'setpts=3*PTS',
              '-an',
              '-c:v',
              'libvpx-vp9',
              '-b:v',
              '0',
              '-crf',
              '36',
              slow,
            ],
            { stdio: 'ignore' },
          );
          result.motion = {
            normal: `${prefix}-normal.webm`,
            slow: `${prefix}-slow.webm`,
            slowMethod: '3x playback of the captured frames; no interpolation',
            normalSha256: createHash('sha256')
              .update(await readFile(normal))
              .digest('hex'),
          };
        }
        await writeFile(
          `${directory}/result.json`,
          JSON.stringify(
            {
              surface: 'Actual installed MV3 content bundle, real toolbar gesture and popup APIs',
              bundleSha256,
              sessions,
            },
            null,
            2,
          ) + '\n',
        );
      }
    }
  return sessions;
}
