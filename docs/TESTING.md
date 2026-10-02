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

`npm test` exercises real Chromium DOM and animation behavior in two local fixtures: the night garden and light and dark reference documents containing over 11,000 elements. It checks protected controls, exact source DOM/layout preservation, no observed site actions or requests, pause/resume, Reset/Escape, SPA source replacement, existing page highlights and concurrent edits. Persistent records must survive paused scrolling away and back, resizing, and more than 26 seconds of running time. Deep discovery must reach volume 60. Additional checks cover fixed leg reach and finite joints during rapid wheel/fling movement, direction reversals, Home/End/PageDown, programmatic jumps, offscreen resize and mid-strike scrolling, plus exact hover preemption, pointer jitter and protected targets, three distinct lock/strike timing profiles, diverse effects, bidirectional edge crawling, immediate stopping, manual-scroll priority, and changing reduced-motion preferences.

The packaged content script has a separate idempotency harness with Chrome messaging explicitly mocked. Popup controls are tested with mocked Chrome APIs, including the 600px popup height limit. These two harnesses do **not** prove installation or extension permissions.

`npm run test:extension` loads the actual unmodified MV3 package into a persistent Chromium context through the DevTools extension loader. It verifies scripting is denied before a gesture, triggers Chrome's real toolbar action, and then exercises Summon, Feral, intensity, cursor following, and Pause/Resume through the real popup page and real Chrome APIs. It records real pointer sessions on both dense light and dark fixtures, including all three distinct spider anatomies and rapid-scroll recovery: an immediate hover redirect, hunts in all three temperaments, top/bottom edge scrolling and center stops, then a paused excursion to volume 30 and back. It asserts old record IDs return, presses Escape, and compares the source DOM and form values. The recording includes a restored frame. Requests, navigation, site clicks, input/change events and submissions are checked.

The popup page is addressed in a browser tab after toolbar activation. Native popup-window opening/closing/focus behavior is still a manual compatibility check; the test does not claim otherwise. No Chrome APIs or permissions are replaced in this installed-extension test. The fixture sidebar belongs to its standalone engine and stays inactive during installed-extension recordings; settings are changed through the real extension popup page.

## Environment boundary

The selected local execution environment blocks unpacked extension loading:

> Loading of unpacked extensions is disabled by the administrator.

The administrator policy is left untouched. The installed-extension test runs on GitHub's permitted CI runner. A blocked load fails loudly and is never reported as a passing test. This project is not submitted to the Chrome Web Store or installed in the user's browser.

Local capture uses the shared playground engine directly. It is clearly distinguished from the installed-extension video. Every evidence JSON identifies its source commit, browser version, surface and viewport. Screenshots use `caret: 'initial'` so the recorder itself does not leave empty style attributes on editable fixture elements.

## Capture and performance

The [runtime investigation](RUNTIME-PERFORMANCE.md) adds matched host-only/runtime workloads,
before/after distributions on the dense fixture and a live public page, lifecycle retention
checks, and explicit limits. Run `npm run perf:runtime`; see that report for reproduction
options, measured results, and the distinction between runtime cost and displayed frame pacing.

```sh
npm run build
npm run capture
node scripts/performance.mjs
```

Capture requires a clean committed source tree. It records an actual pointer-controlled browser session, screenshots the accumulated composition and return scroll, and measures input-to-selection response, visible-page frame intervals and tasks over 50ms. The pointer ring is recording instrumentation and follows real pointer events. The separate performance sample omits video and screenshots to distinguish capture overhead. Results describe the tested software-rendered container, not a performance guarantee on every site or device.

The record cap is 512. DOM projection is capped at 72 records and 16 shards per record; excess visible settled marks share one canvas. The automated ordinary-session tests do not exhaust all 512 records or certify pathological layouts. Use representative pages and Chrome's Performance panel for a broader release gate.

## Manual compatibility checklist

- In a profile that allows local extensions, load `dist/`, invoke the native toolbar popup, summon, close/reopen it, and check settings and pause state.
- Reset from the popup and floating dock. Summon/Escape repeatedly; verify no duplicate visitors or leftover source highlights.
- Navigate to a different origin. Confirm no automatic injection and that access requires a fresh toolbar gesture. Check the error on a restricted `chrome://` page.
- Scroll nested containers, resize, zoom, switch tabs, and exercise fixed/sticky/transformed layouts. Marks should stay anchored; page-owned edits must never be overwritten.
- Use a synthetic form/editor fixture and verify values, submissions, navigation and requests remain unchanged.
- Change the OS reduced-motion preference during a session. New hunts stop; existing marks remain still until Reset.
- Inspect permission and network panels. There are no host permissions or runtime network services.

## Fast-scroll recovery

The v0.3 body lived in viewport coordinates while planted contacts followed document scrolling. Its IK solver enlarged segment lengths to meet displaced contacts; stride prediction also used unbounded scroll velocity. A committed grip could follow its source far offscreen. A 120px-per-frame reproduction reached 1,175–3,347px foot distances, well beyond the old 180–245px nominal skeletons.

v0.4 uses bone budgets independent of contact distance, bounded stride destinations and explicit contact ownership. Normal crawling releases an exhausted foot into a short lift. Rapid displacement releases the rig into anticipation, tucked flight and staged landing; impulses during a hop cannot restart or extend it. Nominal recovery budgets are 300ms for the jumping spider, 460ms for the widow and 640ms for the orb-weaver. Browser cadence affects wall-clock completion. Offscreen strikes retain their committed record and release their grip. Nearby visible text is reacquired after landing. Recovery never moves the page. Paused/reduced-motion geometry uses a calm finite reset.

The four new browser regressions cover rapid wheel/fling movement, repeated reversals, PageDown/Home/End, programmatic jumps, resize with distant content, scrolling mid-strike, follow on/off, blur, paused geometry, reduced motion, record persistence and exact reset. Every sampled contact must stay inside its physical reach budget; every joint must remain finite. The visitor must return visibly within the test's 2.5-second bound. Ordinary edge crawling must retain a climbing gait. External movement must disarm stationary edge intent without fighting manual input.

## Demo site autostart

Ordinary visits to the playground and daylight/night reference pages summon one standalone visitor after DOM readiness. Control labels and settings reflect its actual state immediately. A document-level controller is reused across repeated bundles and control remounts; replaced listeners, observers and status timers are cleaned up. Reset and Escape leave the visitor off, while Pause stays paused. Reduced motion starts a static visitor without new strikes.

The shared engine still restores on pagehide. For a cached history return, the site remembers only activity and settings, then restores at most one visitor and its paused state. A prior Reset remains off. A fresh document starts automatically; no choice or page text is written to storage.

Seven site regressions cover first navigation on all three surfaces, Pause/Resume/Reset/Summon, settings and control remounts, repeated bundles before and after readiness, quiet reduced motion, cached lifecycle reentry, and real browser back/forward navigation. The existing safety and installed-extension checks retain explicit launch control through **`?autostart=off`**. Only test/capture URLs add that flag; production links and ordinary visits default to autostart. This prevents a standalone site engine from competing with the installed extension on controlled fixtures. Extension permissions, content-script activation and popup behavior are unchanged.

## Popup launch (v0.4.1)

Summon awaits content-script injection and an acknowledgement that the visitor is active before closing the actual toolbar popup. Repeated clicks cannot start another launch or close twice. Opening the menu while a spider is already active keeps Pause, Reset and settings available. An injection failure or missing, rejected or inactive acknowledgement keeps the menu open with retry guidance and preserves its chosen settings.

At this release, the browser suite had **26 tests**. Its popup regressions delay injection and acknowledgement independently, exercise repeated and idempotent launches, retry failures, and verify settings and controls. Popup pages opened as ordinary extension tabs stay open, retaining the existing real-API interaction and capture coverage. Only the current window returned by Chrome's [popup view API](https://developer.chrome.com/docs/extensions/reference/api/extension#method-getViews) is eligible to close.

`npm run test:popup` adds a separate **headed native toolbar-popup check**. In permitted CI, `xvfb-run -a -s "-screen 0 1280x900x24" npm run test:popup` loads the packaged extension, triggers the real toolbar action, attaches to the native popover and observes its actual destruction after acknowledgement. It checks one close per successful or idempotent launch, active-status menus staying open, restricted-page failure staying open, selected Feral/83%/Follow settings, one visitor, exact restoration, and the site window remaining open without navigation or requests. Evidence is written to `artifacts/extension-evidence/popup/result.json`. Local installation remains administrator-blocked; this check is run in CI rather than by changing local policy.

[CI run 37049735492](https://github.com/funsaized/cr4wler/actions/runs/37049735492) passed on source `56eb3a3f949c99f926e623599caa559ae16bc693`: all 26 tests, actual installed-extension integration, headed native-popup closure and failure checks, and packaging. The 0.4.1 ZIP is reproducible; only `popup.js` and the manifest version differ from 0.4.0. Existing demonstration recordings retain their original captured-source provenance.

## Release evidence (v0.4)

### Continuous README hero

[The README GIF](cr4wler-demo.gif) is a continuous **32.92-second** excerpt of the actual installed extension on [its public GitHub repository](https://github.com/funsaized/cr4wler). Headed Chromium runs on a 1440×1080 Xvfb desktop; FFmpeg records its **whole native window, including tabs and address bar**. The fresh signed-out profile uses GitHub's dark theme. Browser chrome is real. No private content or secrets appear.

One visitor starts Feral at maximum intensity, then switches through the real extension popup API to Curious with cursor following. Five wheel gestures move the page 1,380px; three hovered text targets and pointer-driven scrolling down and back leave persistent marks. There are no cuts, resummons or resets within the excerpt. Escape restores the original README DOM exactly after recording; no site clicks, input changes or submissions occur. GitHub may perform its ordinary background requests.

| Asset | Before                                  | Current                                                       |
| ----- | --------------------------------------- | ------------------------------------------------------------- |
| GIF   | 720×783, 10fps, 30.9s, 15,814,747 bytes | 1200×900, 25fps sampling, 32.92s, 34,023,129 bytes            |
| Video | 1200×1000 content viewport, 25fps       | 1440×1080 full browser window, 30fps, 32.9s, 15,545,835 bytes |

The old 64-color palette removed the bright neon colors before lossy optimization. The current GIF uses 256 colors, a palette weighted toward changing pixels, Bayer dithering and lossless GIF optimization. In three matched samples, over 99.6% of bright colorful source pixels retain visible color. Its 816 encoded frames include combined identical still frames, averaging 24.79fps while preserving 25fps sampling and elapsed time.

Captured source: `dc2d77e814a72d151ca1cba935c1cf24675e9f8c`, [passing native capture CI](https://github.com/funsaized/cr4wler/actions/runs/37044012741) and [passing build and installed-extension checks](https://github.com/funsaized/cr4wler/actions/runs/37044012537). Runtime source tree remains `fb5dd3b0f04055f2d0228a7888c04f372cde157d`. Chromium 153.0.8010.12 recorded lossless RGB at a measured 30.0003fps. Capture intervals were 33ms median, 34ms p95 and 66ms maximum; browser animation intervals were 16.7ms median and 16.8ms p95, with occasional 52–79ms long tasks. This is a 30fps recording, without interpolation or speed changes.

[Full browser WebM](github-demo.webm) · [Capture, color and review evidence](hero-evidence.json). The continuous source interval is 2.000–34.887 seconds; only initial setup was removed. All 816 final GIF frames and 987 final video frames were inspected. The GIF was played across two loop boundaries and the WebM played successfully in Chromium. Its ordinary infinite GIF loop returns to the beginning. Pointer rings and the source/personality label are recording instrumentation.

To reproduce the permitted headed capture, install FFmpeg and Xvfb, run `npm ci`, `npx playwright install --with-deps chromium`, `npm run build`, then `xvfb-run -a -s "-screen 0 1440x1080x24" node scripts/github-demo.mjs`. The manual **Record GitHub repository demo** workflow runs this flow and retains the lossless source in two parts. The harness asserts one visitor, finite bounded limbs, both personalities, manual and pointer scrolling, and exact restoration. Local administrator policy still blocks unpacked loading in this workspace; GIF/video playback is a separate check and does not establish local extension installation.

### Packaged release

Recorded runtime source: `35243e9b1c1f47f884a07a60459758126dcc3599`. Later release evidence commits update documentation, captured assets and recording harnesses; runtime source remains unchanged.

[CI run 36998438016](https://github.com/funsaized/cr4wler/actions/runs/36998438016) passed on that exact source: TypeScript, formatting, all **20 browser tests**, actual installed-extension integration on both themes, and packaging.

| Recording                                               | Duration | Input → selection | Median / p95 frame interval |
| ------------------------------------------------------- | -------- | ----------------- | --------------------------- |
| [Installed extension, daylight](extension-demo.webm)    | 27.52s   | 18–28ms           | 33.3 / 50.1ms               |
| [Installed extension, night](extension-night-demo.webm) | 27.56s   | 26–37ms           | 33.3 / 50.0ms               |
| [Standalone night playground](demo.webm)                | 24.08s   | 4–16ms            | 16.7 / 16.8ms               |

All recordings use Chromium 153.0.8010.12 at 1440×1000 and real pointer events. Each shows hover preemption, all three distinct spider anatomies, rapid wheel movement and reversal, visible recovery and landing, four effects, bidirectional edge crawling, paused deep-scroll return and exact restoration. Five earlier record IDs survived. In both installed sessions all sampled contact reaches stayed below their physical budget, all joint coordinates remained finite, and the page stayed stationary after manual input settled. There were no observed page errors, requests, unintended navigation, site clicks or form changes. [Installed results, geometry and phase timings](extension-evidence.json) · [Standalone capture data](evidence.json). Pointer rings and type labels are recording instrumentation. The [popup screenshot](popup.png) uses mocked Chrome APIs; installed sessions use real Chrome APIs and the actual popup page.

### Frame pacing comparison

The unrecorded sample uses the same dense synthetic document and software-rendered local environment, with video and screenshots omitted. v0.4 adds rapid-scroll recovery and explicit type demonstrations, so the scenarios have different durations and workloads.

| Sample                                     | Duration / frame samples | Median / p95 / p99   | Long tasks  |
| ------------------------------------------ | ------------------------ | -------------------- | ----------- |
| v0.3 pointer hunts and edge crawling       | 14.52s / 861             | 16.7 / 16.8 / 16.8ms | 2, 55–68ms  |
| [v0.4 extended scenario](performance.json) | 20.09s / 1,178           | 16.7 / 16.8 / 16.8ms | 3, 55–157ms |

v0.4 input-to-selection response was 16–33ms in that unrecorded run. Occasional stalls remain a POC limitation. These samples do not establish performance across websites, hardware or browser configurations. CI recording adds video, screenshots and popup changes; its tasks reached 209ms and its p95 intervals are reported separately above.

Two local release builds were byte-identical. The downloaded CI package matched those bytes.

```text
1a490070c4370dbc5c26cc30c18ae0babe24eccb896374e57692716843a6972a  cr4wler-0.4.0.zip
```

CI artifacts: [installed-extension evidence](https://github.com/funsaized/cr4wler/actions/runs/36998438016/artifacts/11222109100) · [unpacked package and digest](https://github.com/funsaized/cr4wler/actions/runs/36998438016/artifacts/11222019015). Repository access is required. GitHub's retention applies to artifact links; the checked-in videos, screenshots and JSON remain with the source.
