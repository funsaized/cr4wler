# Runtime performance

The scoped ancestor-paint cache reduces repeated native style-property reads during surface measurement. Scalar facts are shared only within one synchronous refresh; no persistent paint cache, contact-probe reduction, movement change or safety relaxation is involved. The regression exercises 32 supports sharing one ancestor, nested scrolling, immediate release under unsupported paint and recovery after removing it.

## Reviewed measurements

Baseline `7cc709a4e0acc276af9bf820ffd18f1971b45b0f` compared with `23773248ace4c46a12b8a694b06ced31212d463a`: three interleaved runs, six cycles per version, separate host/runtime contexts, no capture during timing. Conditions: AMD EPYC 7763 executor, four-CPU quota, Chromium 153.0.8010.12, headless ANGLE/Vulkan SwiftShader, DPR 1, 1440×1000 alternating with 1100×1000. The synthetic reference page has roughly 22,000 DOM nodes. Runtime RNG/idle seed is 42; host RNG is untouched.

Each cycle includes 8s destruction, five 900ms pointer visits, twelve scroll reversals/appends, four viewport changes, CDP page scale, Pause/scroll and Restore. Values below are medians of six per-cycle values, in milliseconds, except frame counts.

| Metric                               | Baseline                                   | Cache                                      |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Surface-measure mean, destruction    | 2.694                                      | 1.760                                      |
| Surface-measure mean, pointer follow | 4.143                                      | 2.660                                      |
| Surface-measure mean, mixed events   | 2.491                                      | 1.412                                      |
| Frame callback p95, destruction      | 4.20                                       | 3.15                                       |
| Frame callback p95, pointer follow   | 6.50                                       | 4.70                                       |
| Frame callback p95, mixed events     | 8.25                                       | 6.85                                       |
| Mixed frame maxima, six cases        | 100.1 / 83.4 / 116.7 / 100.0 / 99.9 / 83.4 | 100.0 / 99.9 / 99.9 / 99.9 / 100.0 / 100.0 |
| Mixed frames >33ms                   | 5 / 7 / 8 / 8 / 5 / 7                      | 7 / 5 / 5 / 7 / 6 / 5                      |
| Mixed frames >50ms                   | 4 / 4 / 4 / 4 / 4 / 4                      | 4 / 4 / 4 / 4 / 4 / 4                      |
| Mixed frames >100ms                  | 1 / 0 / 2 / 0 / 0 / 0                      | 0 / 0 / 0 / 0 / 0 / 0                      |

Surface CPU work fell **35–43%** at full quality with comparable work/effect counts. Dense mixed tails remain near **100ms** on SwiftShader; this does not establish 60 FPS. Counts use strict thresholds from raw frames. Separate nested-wheel/reversal cases had no >33ms frames, which does not certify dense workloads or arbitrary sites.

Diagnostic traces and CPU profiles incur overhead and are separate from pacing samples. Inclusive JS/layout/paint/Canvas events overlap; totals or percentile subtraction cannot attribute every tail. Earlier 266.7ms dense and 93.6ms isolated Canvas outliers were not established as causal regressions and remain historical debt.

## Memory and evidence limits

Instrumented long and repeated-cleanup runs returned owned roots, frames, scans, records, targets, surfaces and detached controls to zero, while whole-renderer heap grew by roughly 0.3MiB. Warmup and instrumentation are included; these totals neither prove a leak nor establish a plateau.

A separate five-minute unmodified installed-product run used independent host/product renderer processes, with measurements stored in Node and no renderer sample arrays or method wrappers. It accumulated 129 marks. After repeated launch/Pause/Restore, owned counts were zero and input edits survived; product post-GC heap was 2,778,596 bytes (2.6499MiB) at 30/60/120 seconds after cleanup. This supports bounded quiescent stabilization, not indefinite active-session or full-cap memory behavior. Sparse checkpoints can miss short impact phases.

The timing harness injects the shared engine through DevTools. It does not prove MV3 installation; [installed/native checks](TESTING.md) use the actual product. Input latency measures latest coalesced event receipt to completed Canvas draw, excluding GPU presentation/hardware/photon latency. Native zoom 100%→110% was verified; native background suspension, same-ID changed-bundle updates, physical touch, representative GPUs, arbitrary live sites and full-cap/indefinite memory remain unverified.

The [historical detailed report](https://github.com/funsaized/cr4wler/blob/23773248ace4c46a12b8a694b06ced31212d463a/docs/RUNTIME-PERFORMANCE.md) and [selected per-case data](https://github.com/funsaized/cr4wler/blob/23773248ace4c46a12b8a694b06ced31212d463a/docs/runtime-performance.json) retain their original provenance in Git history. Complete raw evidence remains in the reviewed Library handoff; do not commit new raw reports into the runtime/package tree.

## Reproduce

```sh
npm run perf:runtime -- artifacts/runtime-current.json
mkdir -p artifacts/baseline
git archive 7cc709a4e0acc276af9bf820ffd18f1971b45b0f src | tar -x -C artifacts/baseline
RUNTIME_SOURCE=./artifacts/baseline/src node scripts/runtime-performance.mjs artifacts/runtime-baseline.json
TRACE=1 CYCLES=1 node scripts/runtime-performance.mjs artifacts/runtime-diagnostic.json
URL='http://127.0.0.1:4173/pointer.html?autostart=off' node scripts/runtime-performance.mjs artifacts/runtime-pointer.json
CYCLES=3 HUNT_MS=60000 node scripts/runtime-performance.mjs artifacts/runtime-long.json
CYCLES=6 HUNT_MS=1000 node scripts/runtime-performance.mjs artifacts/runtime-cleanup.json
```

Run baseline/current workloads interleaved with the same harness, browser, fixture and toolchain. Reports record the harness/source hashes, environment, frame distributions, work counts and heap checkpoints. `TRACE=1` writes CPU profiles/browser traces; `HEADED=1` requires a desktop display. `URL` must identify public, non-sensitive content and disable demo autostart. Timing runs must remain free of screenshots/video. Forced-GC checkpoints and direct-node counts are not a heap-retainer analysis.
