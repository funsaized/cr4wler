# Runtime performance investigation

## Outcome

Less main-thread work and a confirmed Reset retention fix; **not a certified steady-60-FPS release**. Normal quality, all three anatomies, targeting, leg motion, and persistent damage remain intact. The dense fixture still produces 50–67 ms frames during resize/scroll/zoom. The live MDN page met the measured frame budget in these headless runs, but already did so before the changes.

[Machine-readable before/after evidence](runtime-performance.json) includes frame distributions, long tasks, method timings, active/settled shard counts, direct DOM-reference counts, browser work, and post-GC memory checkpoints. Full per-phase count samples remain in `artifacts/runtime*.json` locally. The evidence identifies the baseline revision and each measured bundle's SHA-256; the after samples measure the working tree, not a new commit.

## Inspected paths and changes

- **Scheduling:** the hunting RAF and independent geometry RAF could both refresh/render within one display frame. They now share one pending RAF. Resize is coalesced there. Pause/reduced motion still permits event-driven geometry without running a hunting loop.
- **Geometry:** `refreshGeometry()` interleaved range/style reads with rebuilding/removing projections. It now collects reads before projection writes and reuses shard layouts when dimensions and typography have not changed. Target bounds use a revision cache invalidated by scroll (including nested containers), resize, visual-viewport events, mutations, and fonts. Font replacement explicitly invalidates shard layouts even if total line width stays unchanged. Uncommitted targeting also rechecks at roughly 150 ms intervals for CSS animation, which does not emit mutations. A strike still performs an uncached safety check before masking source text.
- **Discovery/input:** the existing progressive walker already bounds visits to 1,800 nodes per scan, returns at most 80 candidates, and yields after approximately 2 ms. No document-per-frame scan or spatial-index rewrite was needed. Mouse-follow no longer launches autonomous scans. Stationary hover hit testing now uses the previously unused dirty flag, with the CSS-animation fallback above; pointer movement still uses the existing 35 ms probe interval. Discovery timers resolve and cancel immediately on abort, including Pause, backgrounding, and Reset.
- **Particles/strands:** there is no dust emitter or strand particle simulation. The strand is a canvas curve; destruction uses at most 16 text shards on one active record. Settled damage already lives outside simulation, with 512 retained records, 72 DOM projections and a shared overflow canvas. Those boundaries remain. Pooling was not justified by these measurements; unchanged shard layouts are reused instead.
- **Coordinates:** body, contacts, target ranges, clips and projections use viewport CSS pixels; document anchors subtract page scroll. Existing recovery, bounded integration and clipped/nested-scroll behavior remain. Visual-viewport zoom events now invalidate geometry too. Tests check pinch zoom plus nested scrolling while paused.
- **Cleanup:** Reset cleared the root but retained `activity`, `pauseButton`, and `tip`, keeping a detached shadow tree alive. These references are now cleared. Mutation/resize observers, event listeners, pending RAF/discovery work, ranges and source masks are released. The content-script controller/message listener intentionally remains available for another explicit launch. Pagehide still restores; source DOM is never rewritten, so concurrent user edits and page-owned highlights survive.

## Adaptive quality

The policy is deliberately decorative and starts at full quality on every launch:

| Level | New scatter/disassemble/erase marks | Other changes                                 |
| ----- | ----------------------------------- | --------------------------------------------- |
| 0     | Up to 16 shards                     | Existing rendering                            |
| 1     | Up to 10 shards                     | Disable small joint/emitter blur              |
| 2     | Up to 6 shards                      | Also halve the orb-weaver's peripheral fibers |

All text is partitioned into the remaining shards, never dropped. Peel/shear, body movement, silhouette, legs, input sampling and targeting are unchanged. A mark captures its budget at creation: settled marks never change topology when quality changes.

Frames over 22 ms accumulate pressure; healthy frames drain it. One second of pressure lowers quality one step, with a four-second cooldown. Recovery needs six consecutive seconds below 18 ms. Gaps over 250 ms do not influence quality. Backgrounding cancels work and resets the foreground clock on return. Physics remains capped at 33 ms; an already committed strike can finish on a long foreground frame, but no missed hunts/effects are replayed. The measured ordinary workloads stayed at level 0; hysteresis and reduced shard completeness are tested separately, not claimed as a measured speedup.

## Measurement conditions

- AMD Ryzen 9 5900XT, 16 cores / 32 logical CPUs, 31.25 GiB RAM; Linux `7.2.5-3-omarchy`.
- Playwright Chromium `153.0.8010.12`, headless, 1440×1000 alternating with 1100×1000, DPR 1. No video/screenshots during timing. This is a capable desktop, **not a representative low-end laptop**.
- Dense local reference fixture: over 10,000 elements / approximately 22,000 DOM nodes.
- Real public page: `https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver`, loaded with its real scripts/styles in fresh signed-out contexts. Host scripts are not disabled; live-page changes remain a source of variance.
- Each before/after run has separate host-only and runtime-enabled contexts and two launch/reset cycles. Each cycle: 8 seconds of autonomous destruction, five 900 ms pointer visits, 12 scroll reversals/appends, four viewport resizes, pinch scale 1→1.25→1, Pause plus scrolling, then Reset. Fonts and a two-second warmup precede sampling. Runtime randomness is seeded without replacing the host's RNG.
- Baseline runtime is extracted from the starting Git revision into a temporary directory and built by the same harness. The extension engine is injected through DevTools without changing host CSP. **This measures shared runtime overhead, not MV3 injection or popup startup cost.** Installed-extension correctness/visual recordings are a separate check.
- RAF intervals measure browser frame pacing, not just JS callback duration. Method timings are inclusive and must not be summed. `scan` timing covers synchronous setup; cooperative slices are reflected in browser script/task totals. Range instrumentation is document-wide, including any host calls. CDP script/layout/style/task deltas and the host-only arm help separate page work; percentile subtraction is not valid attribution.
- Counts are sampled every 250 ms and can miss a short strike. `retainedNodes` counts unique source/control/clip nodes directly held by selected runtime fields, not all transitive heap references. CDP DOM counters cover the whole renderer. Forced GC occurs at memory checkpoints outside workload phases; heap totals include host code, instrumentation and JIT warmup.

## Before / after

Pairs below are the two cycles, not averages. Times are milliseconds.

| Metric                                                    | Before             | After              |
| --------------------------------------------------------- | ------------------ | ------------------ |
| Dense: hover CPU total per ~4.6 s phase                   | 117.2 / 102.3      | 44.7 / 47.3        |
| Dense: geometry CPU total during scroll/resize/zoom       | 51.4 / 51.3        | 29.6 / 30.9        |
| Dense: runtime frame callback p95 during that phase       | 4.2 / 4.8          | 2.1 / 2.4          |
| Dense: range-bound reads during that phase                | 1,559 / 1,576      | 541 / 557          |
| Dense: browser frame p95 / p99 / worst, cycle 1           | 16.8 / 66.7 / 66.7 | 16.8 / 66.6 / 66.7 |
| Dense: browser frame p95 / p99 / worst, cycle 2           | 16.8 / 66.7 / 66.7 | 16.8 / 66.7 / 66.7 |
| Dense: frames >20 ms during those phases                  | 4 / 5              | 5 / 4              |
| Dense: frames >50 ms during those phases                  | 3 / 2              | 2 / 3              |
| MDN: hover CPU total                                      | 110.8 / 76.0       | 37.0 / 16.9        |
| MDN: runtime frame callback p95 during scroll/resize/zoom | 4.1 / 4.3          | 2.1 / 1.0          |
| MDN: browser frame p99 / worst across measured phases     | 16.8 / 16.8        | 16.8 / 16.8        |
| Direct detached control references after Reset            | 3                  | 0                  |

Median frame interval was approximately 16.7 ms in all arms. Dense host-only scroll/resize phases also missed frames: two >20 ms frames per cycle in both before and after runs, with worst intervals around 33.4 ms. Adding the runtime still increases tail latency. Reset itself sometimes costs a 33–50 ms interval. One 51 ms long task was recorded during the dense baseline Reset; frame misses are not synonymous with >50 ms main-thread tasks. The MDN host/runtime arms recorded no >20 ms frames or long tasks. These results show reduced callback cost, **not improved worst-case display pacing**.

The dense runs produced 10–11 marks before and 11 after; peak sampled active shards remained 16 and settled shards reached 137 in both versions. Thus the reported reductions did not come from adaptive quality or disabling destruction. MDN hunts vary (9 marks before, 9–10 after), so its method comparisons are indicative, not identical-content microbenchmarks.

### Retention and memory

After the two dense resets, baseline DOM counts exceeded the host-only count by **21 nodes each time**. After the fix, DOM and listener counts matched host-only at both checkpoints: 22,115/22,139 nodes and 10 listeners, with zero direct runtime source/control references. MDN resets likewise returned to the host counts of 8,387/8,411 nodes and 175 listeners.

Dense post-reset JS heap was 1.639→1.727 MiB before and 1.627→1.667 MiB after. This is whole-context memory, not an isolated extension allocation number.

A separate six-cycle after run (2-second autonomous phases, otherwise the same workload) had zero direct retained runtime references after every Reset and returned listeners to 10 each time. Post-reset heap was **1.577, 1.642, 1.657, 1.706, 1.721, 1.729 MiB**; host-only was approximately 1.008→1.035 MiB. Whole-renderer node counts matched the growing host document at four checkpoints and were seven nodes higher at two. The page's own control polling rebuilds text nodes, but these counters alone do not establish their ownership. Heap growth has slowed, **not demonstrated a plateau**; longer allocation/retainer profiling is still warranted. The regression test additionally performs eight immediate launch/scan/reset cycles and checks no runtime roots, controls, highlights, targets or queued animation remain.

## Reproduce

```sh
npm run perf:runtime -- artifacts/runtime-after.json
URL=https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver \
  node scripts/runtime-performance.mjs artifacts/runtime-real-after.json
CYCLES=6 HUNT_MS=2000 node scripts/runtime-performance.mjs artifacts/runtime-cycles.json
# Longer damage accumulation; wall-clock samples, not forced synthetic strikes:
CYCLES=3 HUNT_MS=60000 node scripts/runtime-performance.mjs artifacts/runtime-long.json
```

For a baseline, extract the desired revision's `src/` into a temporary directory with `git archive`, then set `RUNTIME_SOURCE=/absolute/path/to/extracted/src` and run the same command. The checked-in evidence records the revision used here. Set `HEADED=1` to measure an actual visible browser; the attempted local headed run was interrupted by browser closure and is not included as evidence. `URL` is only for public, non-sensitive pages: the scenario appends content and uses a fresh disposable context.

## Verification and remaining release gates

- `npm run typecheck`: pass.
- Seven new runtime regressions: pass (scheduler lifecycle, immediate discovery cancellation/bounds, cached bounds and edits, read-before-write batching, font invalidation, adaptive hysteresis/text completeness, large deltas, pinch zoom/nested scroll).
- Full `npm test`: **50/51 pass**. The failure is the untouched popup test's `body.height <= 600` assertion at `tests/browser.test.mjs:611`; it also fails in isolation. No popup styles or behavior were changed to hide it.
- `npm run test:extension`: **pass** using the actual loaded MV3 extension and real Chrome APIs on light/night fixtures, including all three anatomies, recovery, protected inputs, no observed site actions/network, and exact restoration. Local recordings/results: `artifacts/extension-evidence/`. This run was permitted; older release notes describing a blocked local loader do not describe this execution.
- Modified-file Prettier check and `git diff --check`: pass.

Remaining gates: representative laptop/GPU and native browser-zoom runs, uninterrupted headed testing on several real sites, long sessions approaching 512 marks / 72 simultaneously visible projections, and allocation/retainer profiling to explain residual heap growth. Pinch scale is **not** browser UI zoom. Perpetually animated source layouts can still outrun the 150 ms target cache; settled projections remain event-driven. Full-viewport canvas resizing and rendering/compositing tails need a browser trace before another architectural change. No worker, spatial index, resource pool, reduced skeleton, or global-resolution downgrade was added to manufacture better numbers.
