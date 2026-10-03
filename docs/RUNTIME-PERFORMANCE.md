# Runtime performance investigation

The final serial measurement at reviewed base `7cc709a4e0acc276af9bf820ffd18f1971b45b0f` found avoidable repeated native style-property reads in surface measurement. A cache of scalar ancestor paint facts **within each refresh** reduces that work. All movement, contacts, exact probes, target/input identity, material guards, attack phases and adaptive quality rules retain their existing implementation.

This is a measured CPU-work improvement. The dense mixed workload still misses the 60 FPS budget. [Selected measurements](runtime-performance.json) retain individual cases rather than certifying pacing from averages. Full raw samples, traces, source hashes and current native pixels are in the uncommitted review bundle.

## Conditions and method

- Linux 6.18.44 executor; AMD EPYC 7763; 5 visible logical CPUs, a 4-CPU quota, 17.586 GiB reported RAM and 16 GiB memory limit. No quota throttling occurred during the recorded matched runs. This does not exclude every source of shared-host contention.
- Chromium 153.0.8010.12, headless, ANGLE/Vulkan **SwiftShader software rendering**. Viewport 1440×1000 alternating with 1100×1000, DPR 1; CDP page scale 1/1.25/1. Page scale is separate from native browser zoom.
- Dense local reference fixture: approximately 22,000 DOM nodes. Three interleaved baseline/current runs, each with separate host/runtime contexts and two cycles: 8s autonomous destruction, five 900ms pointer visits, twelve document scroll reversals/appends, four viewport changes, page scale, Pause/scroll and Restore. Runtime RNG and idle seed are 42; host RNG is untouched.
- A second fixture exercises real nested wheel input and rapid pointer reversal in two baseline/current cycles. Three additional 60s destruction cycles and six short cleanup cycles record bounded counts and post-GC trends.
- No screenshots or video during timing. Separate matched diagnostic runs use browser tracing and CPU sampling; their overhead disqualifies them as pacing acceptance samples. Trace phase windows exclude forced-GC checkpoints. Trace/method times are inclusive and cannot be summed. Percentile subtraction is not attribution.
- The shared engine is injected through DevTools for profiling. Actual installed MV3, popup and pixel checks are separate. Input latency measures the latest coalesced event receipt to completed canvas draw, not dispatch, GPU presentation, hardware or photon latency.
- Counts are sampled every 250ms and can miss short phases. Older raw `activeShards` counts impact shards; `settledShards` includes everything outside current impact, including settling. The final harness additionally distinguishes settling, simulated and frozen shards. Direct selected references and whole-renderer counters do not constitute a complete heap-retainer analysis.
- Older raw `over33` counters use >33.34ms. The selected report recomputes **strict >33ms** from retained raw frame samples; >50 and >100 are also strict.
- The first baseline raw file predates harness/GPU/cgroup metadata fields. Subsequent dense files record the same measurement-harness hash; pointer/trace/endurance files record its next version. Both exact measured harness versions are retained alongside the final expanded harness. The first file's missing metadata is not retroactively invented.

## Repeated results

Each cost below is the median across six individual cycle values; rows remain available in the JSON. Times are milliseconds.

| Metric                               | Reviewed baseline                          | Current                                    |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| Surface-measure mean, destruction    | 2.694                                      | 1.760                                      |
| Surface-measure mean, pointer follow | 4.143                                      | 2.660                                      |
| Surface-measure mean, mixed events   | 2.491                                      | 1.412                                      |
| Frame callback p95, destruction      | 4.20                                       | 3.15                                       |
| Frame callback p95, pointer follow   | 6.50                                       | 4.70                                       |
| Frame callback p95, mixed events     | 8.25                                       | 6.85                                       |
| Mixed frame maximum, six cases       | 100.1 / 83.4 / 116.7 / 100.0 / 99.9 / 83.4 | 100.0 / 99.9 / 99.9 / 99.9 / 100.0 / 100.0 |
| Mixed frames >33ms                   | 5 / 7 / 8 / 8 / 5 / 7                      | 7 / 5 / 5 / 7 / 6 / 5                      |
| Mixed frames >50ms                   | 4 / 4 / 4 / 4 / 4 / 4                      | 4 / 4 / 4 / 4 / 4 / 4                      |
| Mixed frames >100ms                  | 1 / 0 / 2 / 0 / 0 / 0                      | 0 / 0 / 0 / 0 / 0 / 0                      |
| Mixed event-to-draw p95              | 7.7 / 8.2 / 14.4 / 7.3 / 9.9 / 8.6         | 6.7 / 7.1 / 7.0 / 8.0 / 7.2 / 8.0          |

Full quality stayed at level 0. Mixed-phase mark counts were 7/9, 7/9, 7/10 before and 7/9, 7/10, 7/9 after; impact shards peaked at 16. Reduced activity or adaptive decoration does not explain the measured cost reduction. Discovery/refresh/probe counts and per-phase effects are retained in raw data. Hunt timing and budgeted discovery still introduce small count variation.

The nested-wheel/reversal cases had no >33ms frames in either version. Current event-to-completed-draw p95 was 3.3/2.8ms. This narrow successful condition does not establish performance on dense mixed events, arbitrary sites or physical devices.

## Causal findings and scope

CPU sampling identified surface measurement, hit testing and native style-property inspection. The regression supplies 32 supports sharing one ancestor: the reviewed implementation reads its safety fact 32 times per refresh; current reads it once. The same test verifies nested translation, immediate release under newly unsupported clipping and reappearance after removing that clipping. Existing visibility, transform, rounded-boundary, clipping and exact-contact tests pass.

The new map expires at the end of the synchronous refresh. Author styles, CSS animation, scrolling, resize, fonts and mutations continue to use the existing refresh/invalidation schedule. There is no persistent paint cache to become stale, and no reduction of candidate or contact probes. Additional transient memory is bounded by the existing 40-anchor / 24-ancestor limits.

Browser traces distinguish JS cost from style/layout and canvas work. In the diagnostic mixed phase, host-only Layout maxima were 27–28ms and style-tree maxima about 19ms. The baseline runtime trace also included a 50.5ms Layout event, a 46.4ms style-tree event, a 23.5ms canvas-resource event and a 34.8ms commit. Current diagnostic maxima were lower in that one run, but capture-free mixed pacing did not improve consistently. Follow traces still spend hundreds of milliseconds across the phase on canvas resource production, paint and layer updates. These are inclusive events, with overlap; they do not justify adding their totals or claiming a single component caused every tail.

The earlier 266.7ms dense and 93.6ms isolated Canvas observations were not reproduced as causal regressions. Their outliers remain historical debt; the new raw outliers are retained. Full-viewport rendering/resource transfer and viewport reflow merit separate hardware/browser investigation before changing canvas architecture.

Inspection also covered target bounds, geometry batching, mutation rescans, material snapshots/masks, notifications and particle lifecycle. The coordinated scheduler, bounded cached discovery, uncached strike safety check, explicit invalidations and settled-effect virtualization remain. Snapshot correctness requires inspection without the owned overriding filter. Notification work was smaller than surface work in these cases. Active text shards and the canvas strand do not establish a need for a resource pool. No architecture or material-safety change was justified by this evidence.

## Endurance and cleanup

Three 60s destruction phases produced 19/23/21 marks and at most 23 DOM projections, at full quality. Their raw frame counts were 3600/3601/3597; only the third had a >50ms interval (50.1ms). This includes periods after visible targets are consumed; it is not constant simulated activity. Mixed and Restore phases remain slower.

After each long Restore, whole-renderer DOM/listener counts matched the growing host arm: 22,106 / 22,130 / 22,154 nodes and 27 listeners. Runtime post-GC heap was 3.161→3.421→3.460MiB; host was 2.118→2.149→2.152MiB. The whole-context heap has not demonstrated a plateau or an attributable new leak.

Six more launch/Pause/Restore cycles returned roots, RAF, scanning, records, targets, surface anchors and detached controls to zero and preserved all six protected input edits. DOM/listener counts matched the corresponding host checkpoints. Runtime post-GC heap was 2.823→2.983→3.020→3.047→3.087→3.105MiB. Instrumentation, host warmup and runtime code are included. No direct detached controls were found, but longer retainer/allocation analysis remains a limit. These wall-clock sessions did not approach the 512-record / 72-projection caps; existing stress tests cover those bounds separately.

### Product retention without the profiling arrays

A further **five-minute continuous installed-product session** used two independent browser renderer processes: an unactivated host control and the unmodified MV3 product. No method wrappers, renderer sample arrays, added page polling timers, frame capture or clock/RNG replacement were present. Primitive CDP reads returned by value; their object group was released after every read. Measurements lived in Node, and each checkpoint followed forced GC. Both arms navigated the same fixed document to fresh volumes every 20 seconds; no host nodes were appended.

The product accumulated **129 retained marks**, at most **12 sampled DOM projections**, and full quality. The 20-second snapshots missed short impact windows (sampled simulation counts were zero); the growing marks establish actual destruction. This memory-only run does not provide frame-pacing acceptance evidence.

After that session, three additional 20-second launch/Pause/Restore cycles yielded product post-GC heaps of **2.6247 / 2.6439 / 2.6476 / 2.6500MiB**. At 30, 60 and 120 seconds after the last cleanup, heap was exactly **2,778,596 bytes (2.6499MiB)** in all three samples. Host heap was **1,012,636 bytes (0.9657MiB)** throughout those cleanup checkpoints. Both arms returned to **22,082 DOM nodes and 10 listeners**. Product roots, RAF, scanning, records, targets, surface anchors, projections, detached controls and owned highlights were zero, and the authored input edit survived.

This is a bounded quiescent stabilization observation following warmup, with report storage excluded from the renderer. It does not establish an indefinite plateau, quantify how much of the earlier ~0.3MiB increase came from instrumentation versus JIT/host/runtime warmup, or identify a new leak. The earlier instrumented growth remains disclosed. Full allocation/retainer attribution and sessions near the record cap remain separate limits; no leak fix was manufactured from the heap totals.

## Verification and remaining gates

TypeScript, Oxlint, Oxfmt and 138/138 aggregate tests pass, including the new baseline-failing regression. Installed/native acceptance and deterministic package evidence are recorded in the review handoff. Normal-speed pixels are actual browser captures and do not serve as timing samples.

A representative laptop/GPU, arbitrary live sites, physical touch, sessions near the full record cap and indefinite memory behavior remain unverified. Native zoom/background and same-ID update outcomes are stated individually in the handoff rather than inherited from older reports. Commit, push and exact-head CI require parent review of the uncommitted patch and pixels.

## Reproduce

```sh
npm run perf:runtime -- artifacts/runtime-current.json
# Extract the exact baseline src/ with git archive first.
RUNTIME_SOURCE=/absolute/baseline/src node scripts/runtime-performance.mjs artifacts/runtime-baseline.json
TRACE=1 CYCLES=1 node scripts/runtime-performance.mjs artifacts/runtime-diagnostic.json
URL=http://127.0.0.1:4173/pointer.html?autostart=off node scripts/runtime-performance.mjs artifacts/runtime-pointer.json
CYCLES=3 HUNT_MS=60000 node scripts/runtime-performance.mjs artifacts/runtime-long.json
CYCLES=6 HUNT_MS=1000 node scripts/runtime-performance.mjs artifacts/runtime-cleanup.json
```

The archived prior foundation report/data retain their original provenance in the review bundle; this report describes the current serial investigation.
