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

`npm test` exercises real Chromium DOM and animation behavior in two local fixtures: the night garden and a light reference document containing over 11,000 elements. It checks protected controls, exact source DOM/layout preservation, no observed site actions or requests, pause/resume, Reset/Escape, SPA source replacement, existing page highlights and concurrent edits. Persistent records must survive paused scrolling away and back, resizing, and more than 26 seconds of running time. Deep discovery must reach volume 60. Additional checks cover a measurable lock-before-strike delay, diverse effects, opt-in cursor following, and changing reduced-motion preferences.

The packaged content script has a separate idempotency harness with Chrome messaging explicitly mocked. Popup controls are tested with mocked Chrome APIs, including the 600px popup height limit. These two harnesses do **not** prove installation or extension permissions.

`npm run test:extension` loads the actual unmodified MV3 package into a persistent Chromium context through the DevTools extension loader. It verifies scripting is denied before a gesture, triggers Chrome's real toolbar action, and then exercises Summon, Feral, intensity, cursor following, and Pause/Resume through the real popup page and real Chrome APIs. It records a long session on the dense light fixture, scrolls to volume 30 and back, asserts old record IDs return, presses Escape, and compares the source DOM and form values. The recording includes a restored frame. Requests, navigation, site clicks, input/change events and submissions are checked.

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

Capture requires a clean committed source tree. It records an actual browser session, screenshots the accumulated composition and return scroll, and measures frame intervals and tasks over 50ms. The separate performance sample omits video and screenshots to distinguish capture overhead. Results describe the tested software-rendered container, not a performance guarantee on every site or device.

The record cap is 512. DOM projection is capped at 72 records and 16 shards per record; excess visible settled marks share one canvas. The automated ordinary-session tests do not exhaust all 512 records or certify pathological layouts. Use representative pages and Chrome's Performance panel for a broader release gate.

## Manual compatibility checklist

- In a profile that allows local extensions, load `dist/`, invoke the native toolbar popup, summon, close/reopen it, and check settings and pause state.
- Reset from the popup and floating dock. Summon/Escape repeatedly; verify no duplicate visitors or leftover source highlights.
- Navigate to a different origin. Confirm no automatic injection and that access requires a fresh toolbar gesture. Check the error on a restricted `chrome://` page.
- Scroll nested containers, resize, zoom, switch tabs, and exercise fixed/sticky/transformed layouts. Marks should stay anchored; page-owned edits must never be overwritten.
- Use a synthetic form/editor fixture and verify values, submissions, navigation and requests remain unchanged.
- Change the OS reduced-motion preference during a session. New hunts stop; existing marks remain still until Reset.
- Inspect permission and network panels. There are no host permissions or runtime network services.

## Release evidence

The v0.2 implementation and capture are being verified together. The committed evidence JSON and CI artifact result identify the exact runtime source; release results are recorded after those checks finish.

The previous v0.1 installed-extension validation passed in [CI run 36983851870](https://github.com/funsaized/cr4wler/actions/runs/36983851870) on `34a26facd33daf7a71ecba943fc9ecae114ce037`. That historical result does not certify v0.2.
