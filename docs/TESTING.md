# Validation and release checks

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run format:check
npm test
npm run test:extension
npm run package
```

## What each test proves

`npm test` exercises real Chromium DOM and animation behavior in two local fixtures: the night garden and light and dark reference documents containing over 11,000 elements. It checks protected controls, exact source DOM/layout preservation, no observed site actions or requests, pause/resume, Reset/Escape, SPA source replacement, existing page highlights and concurrent edits. Persistent records must survive paused scrolling away and back, resizing, and more than 26 seconds of running time. Deep discovery must reach volume 60. Additional checks cover exact hover preemption, pointer jitter and protected targets, three distinct lock/strike timing profiles, diverse effects, bidirectional edge crawling, immediate stopping, manual-scroll priority, and changing reduced-motion preferences.

The packaged content script has a separate idempotency harness with Chrome messaging explicitly mocked. Popup controls are tested with mocked Chrome APIs, including the 600px popup height limit. These two harnesses do **not** prove installation or extension permissions.

`npm run test:extension` loads the actual unmodified MV3 package into a persistent Chromium context through the DevTools extension loader. It verifies scripting is denied before a gesture, triggers Chrome's real toolbar action, and then exercises Summon, Feral, intensity, cursor following, and Pause/Resume through the real popup page and real Chrome APIs. It records real pointer sessions on both dense light and dark fixtures: an immediate hover redirect, hunts in all three temperaments, top/bottom edge scrolling and center stops, then a paused excursion to volume 30 and back. It asserts old record IDs return, presses Escape, and compares the source DOM and form values. The recording includes a restored frame. Requests, navigation, site clicks, input/change events and submissions are checked.

The popup page is addressed in a browser tab after toolbar activation. Native popup-window opening/closing/focus behavior is still a manual compatibility check; the test does not claim otherwise. No Chrome APIs or permissions are replaced in this installed-extension test. The fixture sidebar belongs to its standalone engine and stays inactive during installed-extension recordings; settings are changed through the real extension popup page.

## Environment boundary

The selected local execution environment blocks unpacked extension loading:

> Loading of unpacked extensions is disabled by the administrator.

The administrator policy is left untouched. The installed-extension test runs on GitHub's permitted CI runner. A blocked load fails loudly and is never reported as a passing test. This project is not submitted to the Chrome Web Store or installed in the user's browser.

Local capture uses the shared playground engine directly. It is clearly distinguished from the installed-extension video. Every evidence JSON identifies its source commit, browser version, surface and viewport. Screenshots use `caret: 'initial'` so the recorder itself does not leave empty style attributes on editable fixture elements.

## Capture and performance

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

## Release evidence (v0.3)

Runtime source: `27e939736b87480f17401a7415d92416ad45e4eb`. The release evidence commit changes documentation and captured assets only.

[CI run 36993698123](https://github.com/funsaized/cr4wler/actions/runs/36993698123) passed on that exact source: TypeScript, formatting, all **16 browser tests**, actual installed-extension integration on both themes, and packaging.

| Recording                                               | Duration | Input → selection | Median / p95 frame interval |
| ------------------------------------------------------- | -------- | ----------------- | --------------------------- |
| [Installed extension, daylight](extension-demo.webm)    | 20.80s   | 1–49ms            | 33.3 / 50.1ms               |
| [Installed extension, night](extension-night-demo.webm) | 20.60s   | 26–62ms           | 33.3 / 66.6ms               |
| [Standalone night playground](demo.webm)                | 19.96s   | 13–74ms           | 16.7 / 33.4ms               |

All recordings use Chromium 153.0.8010.12 at 1440×1000 and real pointer events. Each shows an immediate hover redirect, all three temperaments, four effects, deliberate bidirectional edge scrolling, a paused deep-scroll excursion and exact restoration. Five earlier record IDs survived the excursion to volume 30 and return. There were no observed page errors, requests, navigation or site actions in either installed session. [Installed results and phase timings](extension-evidence.json) · [Standalone capture data](evidence.json). The [popup screenshot](popup.png) uses mocked Chrome APIs; the installed sessions use the actual extension popup page and real Chrome APIs.

The [dense-page sample without recording](performance.json) ran the same pointer scenario for 14.52 seconds, collecting 861 frame intervals. Median was **16.7ms**, p95 **16.8ms**, and p99 **16.8ms**. Pointer-to-selection was **14–33ms**. Two long tasks of 55ms and 68ms were observed. These are measurements from one synthetic page in a software-rendered container, not a guarantee across websites or devices.

Capture has material overhead. The installed recordings include screenshots, popup control changes and tasks up to 228ms; their p95 intervals are reported separately above. Performance on arbitrary large or complex pages remains a POC limitation.

Additional [interaction checks](interaction-v3-validation.json) verify the latest pending hover wins during an atomic strike, the 1,800px edge-visit budget, and fresh intent after manual scrolling. [Procedural gait checks](spider-v3-validation.json) measured zero planted-foot slip over 1,080px of surface movement in each temperament, at least four support contacts, exact paused translation and bounded poses after 32,000px document jumps. These are local development measurements, separate from the CI browser suite.

Two local release builds were byte-identical, and the downloaded CI package matched those bytes.

```text
c74b912d95d2e976ca8bc6c1ac1c9fdfca336cdd517867734dd29f961d690763  cr4wler-0.3.0.zip
```

CI artifacts: [installed-extension evidence](https://github.com/funsaized/cr4wler/actions/runs/36993698123/artifacts/11220413980) · [unpacked package and digest](https://github.com/funsaized/cr4wler/actions/runs/36993698123/artifacts/11220862937). Repository access is required. GitHub's retention applies to artifact links; the checked-in videos, screenshots and JSON remain with the source.
