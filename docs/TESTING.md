# Validation and release checks

## Automated checks

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:extension
npm run package
```

The default browser suite covers real page range selection and visual mutation, unchanged source DOM/layout, protected form values, no site click/input/change/submit events, no page requests, no navigation, pause/resume, Escape cleanup, repeated injection/summon/restore, SPA text replacement, sensitive subtree exclusions, scroll/resize cleanup, reduced motion, and popup error handling.

The packaged content script is exercised as shipped, with Chrome messaging explicitly mocked. Popup API calls are also mocked. These are integration tests of local JavaScript, **not** proof of extension installation or `activeTab` behavior.

`npm run test:extension` uses Playwright’s persistent Chromium context, the DevTools unpacked-extension loader, and Chrome’s real toolbar action. It checks denial before activation, then Summon/Pause/Resume through the actual popup page, live isolated-world text grabs, Escape, exact DOM restoration, form values, requests, navigation, and site events. The popup page is exercised in a browser tab after the toolbar action so Playwright can address its controls; Chrome APIs are not mocked and the shipped manifest is not modified. The native popup’s focus behavior and the wider compatibility checklist below remain manual. No browser policy is edited; a blocked load exits with failure.

## Actual environment limitation

On 2026-10-02, the selected execution environment blocked unpacked extension loading. Chromium returned:

> Loading of unpacked extensions is disabled by the administrator.

Both a bundled Chromium 141 load attempt and a system Chromium 151 load attempt were investigated. The administrator policy was left untouched. Local installation remains blocked. GitHub’s CI runner permits unpacked extensions and subsequently verified actual installation, toolbar invocation, permission grant, and real extension interactions (see below). Cross-origin permission revocation and Chrome Web Store behavior remain manual checks. This POC is not store-published or installed in the user’s browser.

The video and screenshots are captured from the running local playground, not from an installed extension. Capture metadata records the exact source commit, browser version, viewport, timings, source DOM comparison, and page network requests in `artifacts/evidence.json`.

## Manual toolbar release gate

Use an ordinary local fixture in a Chrome profile that permits unpacked extensions:

- Load `dist/` and open the local playground URL. Do not press the playground's Summon button.
- Invoke the extension toolbar popup, select a personality, and press Summon. Confirm only one visitor appears and the dock responds.
- Close/reopen the popup. Confirm active settings and pause state are reflected. Change intensity; restore from both popup and dock.
- Summon, press Escape, summon again, and repeat several times. Confirm no duplicate overlays, persistent highlights, or console errors.
- Navigate to a different origin. Confirm no automatic injection; summon requires another toolbar invocation. Check a restricted `chrome://` page gives an approachable error.
- Run on a synthetic form page. Confirm no field values, submissions, link navigation, requests, or user edits change.
- Scroll, resize, replace the article in an SPA, and switch tabs. Confirm borrowed fragments release and hidden/paused animation stops.
- Enable the OS reduced-motion setting. Confirm no descent, text grabs, drift, or continuous animation.
- Inspect the extension's permission list and network activity. No host permissions or runtime network requests should exist.

## Capture and performance

```sh
npm run build
npm run capture
```

Capture requires Playwright's Chromium and FFmpeg. It runs a real 22-second playground session, records the video, captures actual browser screenshots, and measures frame intervals and long tasks. Results describe one software-rendered container, not a performance guarantee on every site or device. Keep background tabs, recording overhead, and display refresh rate in mind. Use Chrome's Performance panel on representative ordinary pages before a public release.

## Recorded result — 2026-10-02

- Runtime source captured at `773ccde34829b701636de628607f7ecab2f358d2`; later evidence/report commits do not change runtime code.
- TypeScript and formatting checks passed. Seven browser integration checks passed, including preservation of a pre-existing CSS highlight and edits made by the page during animation. The compact popup separately passed its 600px height check after final styling.
- Actual browser video: [26.36-second WebM](demo.webm), 1440×1000, Chromium 141.0.7390.37. [Capture data](evidence.json) records the source commit. This is the local playground; the [popup image](popup.png) uses mocked Chrome APIs.
- Final capture: four fragments at the screenshot checkpoint, exact source DOM restoration, zero observed page requests after activation, and zero page errors. The recorder is configured not to alter input/editor caret styles.
- Without recording or screenshots: 725 frame samples over 12 seconds, median 16.7ms, p95 16.7ms, and zero observed tasks over 50ms. [Raw sample](performance.json). With recording/screenshots, p95 was 16.8ms and one 83ms long task was observed. These are container samples, not universal frame-rate claims.
- The local extension load check failed with the documented administrator-policy error. Actual extension validation was subsequently completed on GitHub’s permitted CI runner; this local failure was never counted as a passing test.
- Two successive release builds produced byte-identical ZIPs; the final archive ships alongside its SHA-256 digest.

## Actual installed extension — successful CI validation

[CI run 36983851870](https://github.com/funsaized/cr4wler/actions/runs/36983851870) passed on source commit `34a26facd33daf7a71ecba943fc9ecae114ce037`.

This run loaded the **unmodified Manifest V3 extension** into a real Chromium persistent profile. It verified that scripting was denied before a gesture, invoked Chrome's toolbar action, and used the actual popup page with real Chrome APIs to Summon/Pause/Resume. The installed isolated-world controller grabbed live text, restored the source DOM exactly on Escape, preserved input/password values, and produced no observed site clicks, form changes/submissions, requests, or navigation. All seven other browser integration tests, TypeScript, formatting, and packaging also passed.

The real popup page was exercised in a browser tab after toolbar activation; it was not a mock. Native popup-window focus/closing behavior and cross-origin permission revocation still belong to the manual checklist. No permissions or policies were changed to make the test pass.

- [Actual extension video, screenshot, and exact-commit result JSON](https://github.com/funsaized/cr4wler/actions/runs/36983851870/artifacts/11216836070)
- [CI-built installable ZIP and SHA-256](https://github.com/funsaized/cr4wler/actions/runs/36983851870/artifacts/11216717402)

GitHub artifact links require repository access and are subject to GitHub's retention period. The workflow regenerates these artifacts on future runs. The installed-extension recording is distinct from the longer standalone playground recording committed in this repository.

CI produced exactly the same release ZIP as the local reproducibility check:

```text
2cbb2e5164f818be2b00e5d29f60006322fd9a79f97390a4f642cb868363df69  cr4wler-0.1.0.zip
```
