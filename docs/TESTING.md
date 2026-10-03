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

The [original video](cr4wler-demo.webm) reuses the approved final 15.84s normal-speed material session, byte-for-byte: 1440×1000, 25fps, VP8, SHA-256 `eec9eeb712e46e98dedab0be563e0ab69ff67ebb7c5c79370beaedf1e8590dcd`. It shows the installed visitor on the synthetic material fixture. The [inline GIF](cr4wler-demo.gif) uses the 1.40s–15.84s excerpt at 720×500, sampled at 10fps with a 96-color palette and ordered dithering. The initial inactive page and offscreen arrival were trimmed so the loop starts with the dock and spider visible, avoiding the brief bright-page flash. Its 144 frames retain 14.44s wall-clock duration: 100ms per frame and a final 140ms hold, looping indefinitely. The loop still cuts back to its opening shot; no cropping, interpolation or playback-speed change was applied. The original video is unchanged. These reviewed pixels are reused demonstration media, not a new release acceptance capture; current installed/native checks remain separate.

Reproduce the GIF with FFmpeg (the reviewed encode used FFmpeg 7.1.5):

```sh
ffmpeg -i docs/cr4wler-demo.webm \
  -filter_complex '[0:v]trim=start=1.4,setpts=PTS-STARTPTS,fps=10,scale=720:500:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle' \
  -loop 0 -final_delay 14 docs/cr4wler-demo.gif
```

The earlier 32.92s whole-browser GitHub capture used source `dc2d77e814a72d151ca1cba935c1cf24675e9f8c`. Its [GIF](https://github.com/funsaized/cr4wler/blob/23773248ace4c46a12b8a694b06ced31212d463a/docs/cr4wler-demo.gif), [WebM](https://github.com/funsaized/cr4wler/blob/23773248ace4c46a12b8a694b06ced31212d463a/docs/github-demo.webm), [capture CI](https://github.com/funsaized/cr4wler/actions/runs/37044012741), and [capture script](https://github.com/funsaized/cr4wler/blob/23773248ace4c46a12b8a694b06ced31212d463a/scripts/github-demo.mjs) remain recoverable with their original provenance in Git history.
