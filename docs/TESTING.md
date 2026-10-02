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

The popup page is addressed in a browser tab after toolbar activation. Native popup-window opening/closing/focus behavior is still a manual compatibility check; the test does not claim otherwise. No Chrome APIs or permissions are replaced in this installed-extension test.

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

## Previous release evidence (v0.2)

The v0.3 implementation and test scenario are above. The following captures belong to v0.2 and will be replaced by source-bound v0.3 captures in the release evidence commit.

Runtime source: `1dd4e83a94a63fad6762c1b5c81c8834cec2abf2`. Later evidence commits change documentation and captured assets only.

[CI run 36987401786](https://github.com/funsaized/cr4wler/actions/runs/36987401786) passed on that exact source. TypeScript, formatting, all **11 browser tests**, actual installed-extension integration, and packaging passed.

- [Installed extension video](extension-demo.webm): **37.76 seconds**, Chromium 153.0.8010.12, 1440×1000. All five effects appear. Nine earlier record IDs survived the excursion to volume 30 and return. The source restored exactly; no page errors, requests, navigation or site actions were observed. [Raw result and phase timings](extension-evidence.json).
- [Night-garden playground video](demo.webm): **36.16 seconds**, same browser and viewport. All five effects, mouse guidance, pause, scroll and return, then exact restoration. No observed page requests or errors. [Capture data](evidence.json). The [popup screenshot](popup.png) uses mocked Chrome APIs.
- [Dense-page sample without recording](performance.json): 1,425 frame intervals over 24 seconds while visiting volume 30, the top, and returning. Median and p95 were **16.7ms**, p99 **33.3ms**. Five long tasks were observed, ranging **61–101ms**; these occasional stalls remain a POC performance limitation on a large document.
- Recording has material overhead in the software-rendered environments: the local capture p95 was 33.3ms, and the installed CI recording p95 was 50ms. The CI recording includes screenshot pauses and tasks up to 221ms. These measurements are reported separately rather than treated as animation-only benchmarks.
- Two local release builds were byte-identical, and CI produced the same ZIP digest.

```text
561f28952cf13dd8853c77f5b1af5bb768c46b6a10f07bda03ed1d64f73a14bf  cr4wler-0.2.0.zip
```

CI artifacts: [installed-extension evidence](https://github.com/funsaized/cr4wler/actions/runs/36987401786/artifacts/11218490469) · [unpacked package and digest](https://github.com/funsaized/cr4wler/actions/runs/36987401786/artifacts/11217988950). Repository access is required. GitHub's retention applies to artifact links; the checked-in videos, screenshots and JSON remain with the source.
