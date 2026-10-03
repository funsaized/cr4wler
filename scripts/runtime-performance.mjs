/** Matched host/runtime workload. Optional URL must be a public, non-sensitive page. */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { serve } from './serve.mjs';
const output = process.argv[2] ?? 'artifacts/runtime-performance.json';
const cycles = Number(process.env.CYCLES ?? 2);
const huntMs = Number(process.env.HUNT_MS ?? 8000);
const harnessSha256 = createHash('sha256')
  .update(await readFile(import.meta.filename))
  .digest('hex');
if (!Number.isInteger(cycles) || cycles < 1 || !Number.isFinite(huntMs) || huntMs < 1000)
  throw new Error('CYCLES must be a positive integer; HUNT_MS must be at least 1000.');
const bundle = await build({
  stdin: {
    contents: `import { Cr4wler } from ${JSON.stringify((process.env.RUNTIME_SOURCE ?? './src') + '/engine')}; globalThis.runtime = new Cr4wler(42);`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  define: { 'Math.random': 'globalThis.runtimeRandom' },
  write: false,
  format: 'iife',
});
const server = await serve();
const browser = await chromium.launch({
  channel: 'chromium',
  headless: process.env.HEADED !== '1',
});
const summary = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return {
    count: sorted.length,
    mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? 0,
    over20: values.filter((x) => x > 20).length,
    over33: values.filter((x) => x > 33).length,
    over50: values.filter((x) => x > 50).length,
    over100: values.filter((x) => x > 100).length,
  };
};
const results = [];
const startedAt = new Date().toISOString();
const loadBefore = os.loadavg();
const diagnosticTrace = process.env.TRACE === '1';
const quota = await readFile('/sys/fs/cgroup/cpu.max', 'utf8').catch(() => 'unavailable');
const cpuBefore = await readFile('/sys/fs/cgroup/cpu.stat', 'utf8').catch(() => 'unavailable');
const browserSession = await browser.newBrowserCDPSession();
const graphics = (await browserSession.send('SystemInfo.getInfo')).gpu;
try {
  for (const enabled of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(
      process.env.URL ?? 'http://127.0.0.1:4173/reference.html?theme=night&autostart=off',
    );
    await page.evaluate(() => {
      globalThis.__cr4wlerPlayground?.engine.restore();
      document.querySelector('#reference-volume-8')?.scrollIntoView();
      let seed = 42;
      globalThis.runtimeRandom = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000);
    // DevTools injection, like an extension, does not require weakening the host CSP.
    await page.evaluate(bundle.outputFiles[0].text);
    await page.evaluate(() => {
      globalThis.samples = {
        startedAt: performance.now(),
        frames: [],
        calls: {},
        longTasks: [],
        counts: [],
        inputLatency: [],
      };
      const wrap = (object, key, label = key) => {
        const original = object[key].bind(object);
        object[key] = (...args) => {
          const start = performance.now();
          try {
            return original(...args);
          } finally {
            (samples.calls[label] ??= []).push(performance.now() - start);
          }
        };
      };
      for (const key of [
        'frame',
        'refreshGeometry',
        'updateHover',
        'onMutations',
        'scan',
        'updateActivity',
        'readGeometry',
        'readUnmaskedMaterials',
        'targetFresh',
        'notify',
        'recoveryLanding',
      ]) {
        wrap(runtime, key);
      }
      globalThis.pendingInput = null;
      for (const type of ['pointermove', 'wheel', 'scroll', 'resize'])
        addEventListener(
          type,
          () => {
            // Latest received event to completed canvas draw, not hardware/photon latency.
            pendingInput = { type, at: performance.now() };
          },
          { capture: true, passive: true },
        );
      const summon = runtime.summon.bind(runtime);
      runtime.summon = (...args) => {
        const result = summon(...args);
        for (const key of ['update', 'discover', 'measure'])
          wrap(runtime.pageSurfaces, key, `surfaces.${key}`);
        for (const key of ['update', 'render']) wrap(runtime.spider, key, `spider.${key}`);
        const render = runtime.spider.render.bind(runtime.spider);
        runtime.spider.render = () => {
          render();
          if (pendingInput) {
            samples.inputLatency.push({
              ...pendingInput,
              milliseconds: performance.now() - pendingInput.at,
            });
            pendingInput = null;
          }
        };
        return result;
      };
      const measure = Range.prototype.getBoundingClientRect;
      Range.prototype.getBoundingClientRect = function () {
        const start = performance.now();
        const result = measure.call(this);
        (samples.calls.rangeBounds ??= []).push(performance.now() - start);
        return result;
      };
      new PerformanceObserver((list) =>
        samples.longTasks.push(
          ...list
            .getEntries()
            .filter((e) => e.startTime >= samples.startedAt)
            .map((e) => e.duration),
        ),
      ).observe({ type: 'longtask' });
      globalThis.lastFrame = null;
      const tick = (now) => {
        if (lastFrame !== null) samples.frames.push(now - lastFrame);
        lastFrame = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setInterval(() => {
        const records = runtime.fragments;
        samples.counts.push({
          marks: records.length,
          activeShards: runtime.current?.shards.length ?? 0,
          settlingShards: runtime.settling?.shards.length ?? 0,
          simulatingShards:
            (runtime.current?.shards.length ?? 0) + (runtime.settling?.shards.length ?? 0),
          frozenShards: records
            .filter((r) => r !== runtime.current && r !== runtime.settling)
            .reduce((n, r) => n + r.shards.length, 0),
          settledShards: records
            .filter((r) => r !== runtime.current)
            .reduce((n, r) => n + r.shards.length, 0),
          // Unique source/control/clip nodes held directly by the runtime, not a heap dominator count.
          retainedNodes: new Set(
            [
              ...records.flatMap((r) => [r.target.node, r.target.element, ...r.clips]),
              ...runtime.targets.flatMap((t) => [t.node, t.element]),
              runtime.candidate?.node,
              runtime.hover?.target.node,
              runtime.activity,
              runtime.pauseButton,
              runtime.tip,
            ].filter(Boolean),
          ).size,
          detachedControls: [runtime.activity, runtime.pauseButton, runtime.tip].filter(
            (n) => n && !n.isConnected,
          ).length,
          quality: runtime.quality?.level ?? 0,
          mode: runtime.mode,
          effects: Object.fromEntries(
            [...new Set(records.map((r) => r.effect))].map((effect) => [
              effect,
              records.filter((r) => r.effect === effect).length,
            ]),
          ),
          domProjections: records.filter((r) => r.el).length,
          visible: runtime.visibleCount,
          materialPixels: runtime.bitmapPixels(),
          surfaces: runtime.pageSurfaces.diagnostics,
        });
      }, 250);
    });
    const phases = [];
    const phase = async (name, work) => {
      await page.evaluate(() => {
        samples.startedAt = performance.now();
        samples.frames = [];
        samples.calls = {};
        samples.longTasks = [];
        samples.counts = [];
        samples.inputLatency = [];
        pendingInput = null;
        lastFrame = null;
      });
      const before = await cdp.send('Performance.getMetrics');
      await work();
      const after = await cdp.send('Performance.getMetrics');
      const data = await page.evaluate(() => samples);
      const metrics = Object.fromEntries(
        after.metrics.map((m) => [
          m.name,
          m.value - (before.metrics.find((b) => b.name === m.name)?.value ?? 0),
        ]),
      );
      phases.push({
        name,
        windowSeconds: {
          start: before.metrics.find((m) => m.name === 'Timestamp')?.value,
          end: after.metrics.find((m) => m.name === 'Timestamp')?.value,
        },
        frames: summary(data.frames),
        rawFrames: data.frames,
        rawCalls: data.calls,
        inputLatency: {
          summary: summary(data.inputLatency.map((s) => s.milliseconds)),
          raw: data.inputLatency,
        },
        calls: Object.fromEntries(
          Object.entries(data.calls).map(([k, v]) => [
            k,
            { ...summary(v), total: v.reduce((a, b) => a + b, 0) },
          ]),
        ),
        longTasks: data.longTasks,
        counts: data.counts,
        workSeconds: {
          script: metrics.ScriptDuration,
          layout: metrics.LayoutDuration,
          style: metrics.RecalcStyleDuration,
          task: metrics.TaskDuration,
        },
      });
    };
    const memory = [];
    const snapshot = async (label) => {
      await cdp.send('HeapProfiler.collectGarbage');
      memory.push({
        label,
        ...(await cdp.send('Memory.getDOMCounters')),
        ...(await cdp.send('Runtime.getHeapUsage')),
        runtime: await page.evaluate(() => ({
          roots: document.querySelectorAll('[data-cr4wler-root]').length,
          raf: runtime.raf,
          scanning: runtime.scanning,
          records: runtime.fragments.length,
          targets: runtime.targets.length,
          surfaces: runtime.pageSurfaces.diagnostics.anchors,
          detachedControls: [runtime.activity, runtime.pauseButton, runtime.tip].filter(
            (n) => n && !n.isConnected,
          ).length,
          userEdit: document.querySelector('#fixture-input, #protected-input')?.value,
        })),
      });
    };
    await snapshot('before');
    if (diagnosticTrace) {
      await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,v8,blink,cc,gpu,disabled-by-default-devtools.timeline',
        transferMode: 'ReturnAsStream',
      });
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    for (let cycle = 0; cycle < cycles; cycle++) {
      await page.evaluate((cycle) => {
        const input = document.querySelector('#fixture-input, #protected-input');
        if (input) input.value = `Preserved user edit ${cycle}`;
      }, cycle);
      if (enabled)
        await page.evaluate(() =>
          runtime.summon({ personality: 'feral', intensity: 0.8, followMouse: false }),
        );
      await phase(`destruction-${cycle}`, () => page.waitForTimeout(huntMs));
      await phase(`follow-${cycle}`, async () => {
        if (enabled) await page.evaluate(() => runtime.configure({ followMouse: true }));
        for (let i = 0; i < 5; i++) {
          await page.mouse.move(520 + i * 22, 240 + i * 65);
          await page.waitForTimeout(900);
        }
      });
      if (await page.locator('#nested').count()) {
        await phase(`nested-manual-reversal-${cycle}`, async () => {
          await page.locator('#nested').scrollIntoViewIfNeeded();
          const box = await page.locator('#nested').boundingBox();
          for (let i = 0; i < 12; i++) {
            await page.mouse.move(box.x + 90 + (i % 2) * 270, box.y + 80);
            await page.mouse.wheel(0, i % 2 ? -160 : 160);
            await page.waitForTimeout(100);
          }
        });
      }
      await phase(`scroll-resize-zoom-mutations-${cycle}`, async () => {
        for (let i = 0; i < 12; i++) {
          await page.evaluate((i) => {
            scrollBy(0, i % 3 === 0 ? -600 : 440);
            const p = document.createElement('p');
            p.textContent = 'Newly appended infinite-scroll content '.repeat(30);
            document.body.append(p);
          }, i);
          if (i % 3 === 0) await page.setViewportSize({ width: i % 2 ? 1440 : 1100, height: 1000 });
          if (i === 3 || i === 9)
            await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: i === 3 ? 1.25 : 1 });
          await page.waitForTimeout(160);
        }
      });
      await phase(`pause-${cycle}`, async () => {
        if (enabled) await page.evaluate(() => runtime.pause());
        await page.waitForTimeout(700);
        await page.evaluate(() => scrollBy(0, 250));
        await page.waitForTimeout(300);
      });
      await snapshot(`active-${cycle}`);
      await phase(`reset-${cycle}`, async () => {
        if (enabled) await page.evaluate(() => runtime.restore());
        await page.waitForTimeout(700);
      });
      await snapshot(`reset-${cycle}`);
    }
    if (diagnosticTrace) {
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(
        `${output}.${enabled ? 'runtime' : 'host'}.cpuprofile`,
        JSON.stringify(profile),
      );
      const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end');
      const { stream } = await complete;
      let trace = '';
      for (;;) {
        const chunk = await cdp.send('IO.read', { handle: stream });
        trace += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
        if (chunk.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      await writeFile(`${output}.${enabled ? 'runtime' : 'host'}.trace.json`, trace);
    }
    results.push({ enabled, phases, memory });
    await page.close();
  }
  const evidence = {
    scenario: { cycles, huntMs },
    startedAt,
    completedAt: new Date().toISOString(),
    loadBefore,
    loadAfter: os.loadavg(),
    cpuQuota: quota.trim(),
    cpuStatsBefore: cpuBefore,
    cpuStatsAfter: await readFile('/sys/fs/cgroup/cpu.stat', 'utf8').catch(() => 'unavailable'),
    graphics,
    harnessSha256,
    seed: 42,
    diagnosticTrace,
    sourceDirectory: resolve(process.env.RUNTIME_SOURCE ?? './src'),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        (await readdir(process.env.RUNTIME_SOURCE ?? './src'))
          .filter((name) => name.endsWith('.ts'))
          .sort()
          .map(async (name) => [
            name,
            createHash('sha256')
              .update(await readFile(resolve(process.env.RUNTIME_SOURCE ?? './src', name)))
              .digest('hex'),
          ]),
      ),
    ),
    bundleSha256: createHash('sha256').update(bundle.outputFiles[0].text).digest('hex'),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    machine: {
      cpu: os.cpus()[0].model,
      logicalCPUs: os.cpus().length,
      ramGiB: os.totalmem() / 2 ** 30,
      platform: `${os.platform()} ${os.release()}`,
    },
    browser: browser.version(),
    headed: process.env.HEADED === '1',
    url: process.env.URL ?? 'local dense reference fixture (>10,000 elements)',
    viewport: '1440x1000 -> 1100x1000; DPR 1; pinch scale 1/1.25 (not browser UI zoom)',
    results,
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(output);
} finally {
  await browser.close();
  server.close();
}
