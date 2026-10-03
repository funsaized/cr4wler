# Validation and release checks

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:extension
npm run package
```

## What each test proves

`npm test` exercises Chromium DOM and animation behavior in the night garden and dense light/dark reference fixtures. It covers:

- Protected controls, source DOM/layout preservation, page-owned highlights and concurrent edits, no observed site actions or requests, and SPA replacement.
- Pause/Resume, Reset/Escape, repeated activation, pagehide and cached navigation, hidden tabs, reduced motion, and pending-work cancellation.
- Persistent marks after scrolling away/back, resizing and more than 26 seconds of animation; discovery deep into volume 60.
- Hover preemption, pointer jitter, protected targets, distinct temperament rhythms, bidirectional edge scrolling, and manual-scroll priority.
- Fixed leg reach, finite joints, gait support, large frame deltas, rapid wheel/fling reversals, document jumps, and offscreen mid-strike recovery.
- Bounds caching, mutation/font invalidation, read-before-write batching, adaptive quality hysteresis, complete shard text, and pinch zoom with nested scrolling.

The packaged content-script idempotency harness and popup tests mock Chrome messaging. They do **not** prove installation or extension permissions. The popup tests enforce the 600px height limit, visible footer and no horizontal overflow across all temperaments and active/error states. Historical profiling results are recorded in the [runtime investigation](RUNTIME-PERFORMANCE.md).

`npm run test:extension` loads the unmodified MV3 package into a disposable persistent Chromium context through the DevTools extension loader. It verifies scripting is denied before a toolbar gesture, triggers the real action, and exercises the real popup page and Chrome APIs. Light/night pointer sessions cover all three anatomies, immediate hover redirects, rapid-scroll recovery, edge crawling, persistent deep-scroll return, and exact restoration. Protected form values, page actions, requests, navigation and errors are checked. The shared hero session adds a focused cursor-following capture.

The popup page in that test runs in a browser tab after toolbar activation. Native popup-window behavior is tested separately:

```sh
xvfb-run -a -s "-screen 0 1280x900x24" npm run test:popup
```

This headed check loads the packaged extension, triggers its actual toolbar popup and observes closure only after acknowledgement. It checks successful/idempotent launch, active-status menus, restricted-page failures, preserved settings, one visitor, and exact restoration. It requires Xvfb on headless Linux. Neither installed-extension check bypasses browser policy; a blocked load fails loudly. A permitted local installed-extension run is documented in the runtime report, not a guarantee about every environment.

Use **`?autostart=off`** for controlled playground/reference fixtures so the standalone engine does not compete with an installed extension. Ordinary site visits still autostart. Reset remains off across bundle reentry and cached navigation; an active or paused session can resume once on a cached return.

## Performance

`tests/materials.test.mjs` drives the shared engine through all three temperaments on `materials.html` in light/night themes. It checks recognizable source-colored text, bounded source-image tiles, cards/buttons, rule recoil and cross-origin outline fallback. It also covers scroll return, nested scrolling, interruption, Pause/reduced motion, source/style/child changes, exact Reset with user edits, protected controls and the bitmap/DOM budgets. `npm run test:extension` repeats the material matrix with the actual installed content bundle and saves screenshots plus normal/3× playback sequences under `artifacts/extension-evidence/materials/`. The slow sequences repeat captured frames without interpolation.

Material snapshots are at most 256×192 pixels with a 1,048,576-pixel session budget; mounted tile canvases add bounded copies. Unsupported origins/paint and budget exhaustion use stable outline treatments rather than reading unsafe pixels or evicting earlier damage. A compact panel uses at most 24 inspected descendant nodes and 160 text characters. The controlled 80-image stress test reaches the 72 DOM projection limit and shared overflow canvas; it does not certify arbitrary pathological documents.

```sh
npm run perf:runtime
```

The [runtime investigation](RUNTIME-PERFORMANCE.md) and [measurement evidence](runtime-performance.json) retain the current before/after comparison: matched host-only/runtime workloads, frame distributions, long frames, active/settled shard counts, DOM retention and memory trends. The harness covers dense-page destruction, mouse-follow, scrolling, resizing, pinch zoom, page mutations, Pause and repeated launch/reset. The report includes commands for live public pages, longer sessions, baseline revisions and headed runs.

Timing runs omit video/screenshots. Installed-extension recordings are correctness/visual evidence, not comparable performance samples. A session caps retained records at 512 and DOM projections at 72, with at most 16 shards per record; excess visible settled marks share one canvas. Ordinary tests do not exhaust these caps or certify pathological layouts. Headless results do not establish steady on-screen 60 FPS on representative hardware.

## Capture and artifact retention

`tests/attack.test.mjs` checks the shared notice → investigate → lock → prepare → strike → settle hunt, including the exact text range selected before commitment. Named preparation times in `hunt-profiles.ts` are 200ms for Curious, 90ms for Feral and 420ms for Dreamy. Pointer replacement cancels uncommitted preparation; a committed impact finishes before latest intent starts, while at most three existing fragments briefly settle. Pause freezes the hunt and impact clocks; changed/removed/hidden sources and manual/nested scroll safely abandon or finish owned state.

For focused installed-extension pixels, run `npm run build && node scripts/attack-check.mjs`. It records three normal and 3× slow sequences, actual preparation/impact/aftermath screenshots, exact footprints and interruption evidence on `anticipation.html` under `artifacts/item4/attack/`. Recording labels are fixture instrumentation; slow playback repeats captured frames without interpolation. Use the full installed-extension matrix above for other materials and page contacts.

Keep generated output under ignored `artifacts/`:

| Producer                  | Output                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| `npm run test:extension`  | `artifacts/extension-evidence/` and raw `artifacts/extension-video/` |
| `npm run test:popup`      | `artifacts/extension-evidence/popup/`                                |
| `npm run perf:runtime`    | `artifacts/runtime-performance.json` by default                      |
| `scripts/github-demo.mjs` | `artifacts/github-demo/`                                             |
| `npm run package`         | Versioned ZIP and digest under `artifacts/`                          |

CI uploads extension evidence and packages. The manual **Record GitHub repository demo** workflow captures the native browser and uploads its source video. Keep only the README demo and its provenance, plus the current runtime report/data, in `docs/`; superseded screenshots, alternate videos and old profiling JSON are available in Git history rather than duplicated in the current tree. Local run output is disposable but is not deleted by the test commands.

### README demo provenance

[The GIF](cr4wler-demo.gif), [full browser WebM](github-demo.webm), and [capture evidence](hero-evidence.json) document a historical recording, not the latest runtime. Captured source: `dc2d77e814a72d151ca1cba935c1cf24675e9f8c`; [capture CI](https://github.com/funsaized/cr4wler/actions/runs/37044012741).

The continuous 32.92-second excerpt shows the actual installed extension on its public GitHub repository, first Feral and then Curious following the cursor. Chromium 153.0.8010.12 ran in a fresh signed-out profile on a 1440×1080 Xvfb desktop. FFmpeg captured the whole native window, including tabs and address bar, at approximately 30fps; the GIF samples at 25fps without interpolation. The harness checks one visitor, bounded finite limbs, scrolling, persistent damage and exact restoration. Pointer rings and labels are recording instrumentation, not extension UI.

To capture a new native-window session, install FFmpeg and Xvfb, then run:

```sh
npm run build
xvfb-run -a -s "-screen 0 1440x1080x24" node scripts/github-demo.mjs
```

## Manual compatibility checklist

- In a profile permitting local extensions, load `dist/`, summon via the native toolbar popup, reopen it, and check settings and Pause/Reset.
- Summon/Escape repeatedly; verify no duplicate visitors or leftover source highlights.
- Navigate to another origin. Confirm no automatic injection and that access requires a fresh toolbar gesture. Check a restricted `chrome://` page.
- Scroll nested containers, resize, use native browser zoom, switch tabs, and exercise fixed/sticky/transformed layouts. Marks should remain anchored and user edits must survive Reset.
- Use synthetic form/editor fixtures; verify values, submissions, navigation and requests stay unchanged.
- Change reduced-motion preference during a session. New hunts stop; existing marks remain until Reset.
- Inspect permission/network panels. There are no host permissions or runtime network services.
