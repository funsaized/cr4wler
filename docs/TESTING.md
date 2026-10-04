# Testing

Use Node.js 22.12+, npm, Python 3, Chromium and FFmpeg. Headed checks on Linux also need Xvfb. Run browser harnesses sequentially; the aggregate suite and installed-extension matrix use port 4173.

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:extension
xvfb-run -a -s "-screen 0 1280x900x24" npm run test:popup
npm run package
```

CI runs these static, aggregate, installed-extension, native-popup and packaging checks, and uploads packages and extension evidence. Generated files belong in ignored `artifacts/`; do not commit run output or hand-edit `dist/`.

## Coverage

| Check                    | Scope                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`               | Real Chromium DOM/interaction and procedural geometry; restoration with author edits, protected controls, no observed requests/site actions, repeated activation, navigation, Pause, reduced motion, cached geometry, clipping, budgets, pointer intent, attacks, idle and recovery. Chrome messaging and popup APIs are mocked. |
| `npm run test:extension` | Unmodified installed MV3 bundle, real Chrome APIs and toolbar grant. Denial before a gesture; light/night pointer sessions; hero capture; all three species in both material themes; exact Restore and protected fields. Its popup page is opened in a tab.                                                                      |
| `npm run test:popup`     | Actual headed toolbar popup: acknowledgement before closing, idempotency, live status, first-use dismissal, species/settings, persistence across reload/new tabs, restricted-page failure and retry.                                                                                                                             |

Use `?autostart=off` on controlled fixtures so the standalone engine does not compete with the installed extension. A blocked installation must fail; never bypass browser policy or broaden permissions to make a check pass.

Materials include text, same-origin image tiles, cards/buttons, thin rules and cross-origin outline fallback. Tests cover ownership under source/style/child edits, nested scrolling, Pause/reduced motion and Reset with user edits. Snapshots are at most 256×192 pixels within a 1,048,576-pixel session budget. The 80-image fixture exercises the 72-projection limit and overflow canvas. Synthetic stress checks do not certify arbitrary pathological pages.

## Focused installed checks

These scripts retain installed-product assertions and captures beyond the aggregate suite. Build once, then run the relevant script:

```sh
npm run build
node scripts/attack-check.mjs
node scripts/idle-check.mjs
node scripts/pursuit-check.mjs
xvfb-run -a -s "-screen 0 1440x1080x24" node scripts/recovery-check.mjs
xvfb-run -a -s "-screen 0 1280x900x24" node scripts/first-run-check.mjs
```

| Script                | Checks and capture conditions                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attack-check.mjs`    | Three species, exact footprint, preparation/impact/settling, replacement intent, committed impact, Pause, nested scrolling and Restore. Dock keyboard Pause captures short preparation windows without pointer-click stability waits. |
| `idle-check.mjs`      | 26s stationary-pointer clips, gestures, immediate interruption and subsequent preparation. Production clocks/geometry; Curious RNG seed 42, Feral/Dreamy seed 7.                                                                      |
| `pursuit-check.mjs`   | Tracking/reversal, jitter, preparation, committed redirection, nested/document edges, wheel/PageDown priority, native controls, Pause, controlled blur and reduced motion.                                                            |
| `recovery-check.mjs`  | Headed wheel bursts/reversal, PageDown, native scrollbar drag, nested wheel, resize, CDP page scale, controlled visibility and reduced motion. Continuous clips run without Pause; stage screenshots use real Pause.                  |
| `first-run-check.mjs` | Headed Pause/species/Restore matrix across ten phases for each species; demo startup, keyboard, edited fields, persisted preferences, one hint, 320/390px touch emulation and reduced motion.                                         |

Outputs use `artifacts/extension-evidence/<attack|idle|pursuit|recovery|first-run>/`. The main installed matrix writes `artifacts/extension-evidence/`, plus raw recordings in `artifacts/extension-video/`; native popup output is in `artifacts/extension-evidence/popup/`. Diagnostics support assertions; screenshots and normal-speed recordings provide pixel evidence. Slow clips repeat actual frames at 3× duration without interpolation. Fixture rings/labels are instrumentation, not extension UI. Preserve the caret in DOM-comparison captures (`caret: initial`).

For whole-window native-popup recordings, set `CR4WLER_RECORD_DESKTOP=1` and `CR4WLER_DESKTOP_SIZE=1280x900`, matching the Xvfb screen. Keep Xvfb and the recorder in the same IPC namespace. Optional `CR4WLER_CHECK_RELOAD=1` attempts a same-ID extension reload; it is a compatibility experiment, not a replacement for a normal-profile update check.

## Performance and limits

Run `npm run perf:runtime` for separate host/runtime timing workloads; see [Performance](RUNTIME-PERFORMANCE.md) for baseline extraction, tracing and longer runs. Timing excludes screenshots/video. Capture overhead makes installed recordings unsuitable as comparable performance samples. Event receipt to completed Canvas draw excludes hardware input, GPU presentation and photon latency.

The reviewed measurements reduced surface CPU work by 35–43%; dense mixed-frame tails remain around 100ms on SwiftShader. No 60 FPS certification follows. The five-minute installed retention run observed cleanup stabilization after 129 marks; indefinite memory behavior and full record/projection-cap sessions remain unverified.

Native browser UI zoom from 100% to 110% was verified. CDP page scale is separate. Native tab-switch pixels did not establish background suspension because the source document continued reporting `document.hidden=false`; controlled visibility regressions do not establish native background behavior. Same-ID changed-bundle updates remain unverified after `chrome.runtime.reload()` produced `ERR_BLOCKED_BY_CLIENT`. Touch captures are emulation, not physical-device evidence. Representative hardware GPUs and arbitrary live sites remain manual gates.

## Manual compatibility

- Load `dist/` in a permitted profile. Summon via the native popup; reopen it and check settings, Pause/Resume and Restore/Escape.
- Repeat activation/restoration; check for duplicate visitors or leftover effects. Verify a fresh origin requires its own toolbar gesture and restricted pages retain retry guidance.
- Scroll nested containers, resize, zoom and switch tabs. Test fixed/sticky/transformed layouts; effects must stay anchored or release safely.
- Edit synthetic inputs and page content during a session. Restore must preserve those edits without invoking site actions or requests.
- Change reduced motion while active. New hunts stop and marks remain until Restore. Inspect permissions/network: no permanent host access or runtime network services.
- Update the extension with the same ID in a normal profile, reload existing tabs, then explicitly Summon again.

## README media provenance

The [GIF](cr4wler-demo.gif) and [video](cr4wler-demo.webm) show the same 25.44-second visit on a local synthetic field-notes page, using the bundled cabin illustration. The unchanged standalone playground engine was built from `d36583fb2beb488514b65e0027b257e5498848a3`; its `playground.js` SHA-256 was `45058fe51474ed95ca6b2cb16ba578e5fcda368dfc2703a1b4d72ecb56efe61c`. This is demonstration media, separate from installed-extension acceptance evidence.

Real controls summon Feral, guide its text/image/card hunts, switch to Curious, and Restore. There is one visitor at a time. Both 356×214 same-origin loaded images produced 256×154 bitmap snapshots without fallback. Feral separates four of nine tiles; Curious moves one. Both effects remain visible through the later travel and text hunts. No runtime, animation clock, geometry or effect was changed for the recording.

PNG screencasting began after fonts, images and layout settled at a fixed 1120×800 viewport. The original 1,412 frames, capture timestamps, scene and read-only traces are retained with the review evidence outside the repository. Timestamp ordering corrects capture-event delivery order; encoding samples or repeats actual frames at normal speed, without interpolation, spatial cropping or cuts. The closing restored frame is held to the output frame boundary, and the loop returns to the opening shot.

All 636 video frames and 424 GIF frames were decoded and checked for dimensions, fixed page anchors and gray/blank/resize corruption. The article's before/Restore comparison differs in only five of 492,480 pixels, by one color-channel level; its DOM restores exactly. GitHub desktop/mobile previews and timestamped contact sheets accompany the external review evidence.

The GIF is 840×600 at 16⅔fps, with 60ms frame delays, a 128-color palette and ordered dithering: 4,577,057 bytes, SHA-256 `1b593c09ed395b48f21a802f55e7eadb5fee175acd0152741e4ab55e40234e62`. The VP9 WebM is 1120×800 at 25fps: 7,703,109 bytes, SHA-256 `3bfc271884cdba683bd2aa1106336d7f1075a133c26eecdf8d67e4df8694ee06`.

To reproduce the encodes with the retained timestamp-ordered PNG capture, put its `frames/` directory and `ordered.ffconcat` in `artifacts/readme-source/` (FFmpeg 7.1.5 was used):

```sh
ffmpeg -f concat -safe 0 -i artifacts/readme-source/ordered.ffconcat \
  -vf 'fps=25,trim=end=25.44,setpts=PTS-STARTPTS' \
  -c:v libvpx-vp9 -crf 24 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  -an -r 25 -fps_mode cfr docs/cr4wler-demo.webm
ffmpeg -i docs/cr4wler-demo.webm \
  -filter_complex '[0:v]fps=50/3,scale=840:600:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle' \
  -loop 0 -final_delay 6 docs/cr4wler-demo.gif
```
