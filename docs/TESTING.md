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

`npm run test:extension` uses Playwright's persistent Chromium context and the DevTools unpacked-extension loader. It never edits browser policy. A blocked load exits with failure and must not be counted as passing. Even a successful load only covers installation and popup rendering; complete the toolbar checklist below.

## Actual environment limitation

On 2026-10-02, the selected execution environment blocked unpacked extension loading. Chromium returned:

> Loading of unpacked extensions is disabled by the administrator.

Both a bundled Chromium 141 load attempt and a system Chromium 151 load attempt were investigated. The administrator policy was left untouched. Actual extension installation, toolbar invocation, permission grant/revocation, and Chrome Web Store behavior remain **unverified**. This POC is not store-published or installed in the user's browser.

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
