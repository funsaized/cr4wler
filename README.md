# cr4wler

**A tiny neon troublemaker for the open web.** Eight legs. Excellent taste. Questionable manners.

cr4wler is a Chrome extension proof of concept that climbs over a real page, grips a phrase, and borrows it for an impromptu typographic composition. The original page stays in place. Press **Escape** and everything returns immediately.

![cr4wler exploring the playground](docs/playground.png)

[Watch the captured browser demo](docs/demo.webm) · [Privacy](PRIVACY.md) · [Testing and limitations](docs/TESTING.md) · [Contributing](CONTRIBUTING.md)

## Try it

Requires Node.js 22+ and npm. Python 3 is needed only to package the ZIP.

```sh
git clone https://github.com/funsaized/cr4wler.git
cd cr4wler
npm ci
npm run build
```

1. Open `chrome://extensions` in a Chrome profile where local extensions are allowed.
2. Turn on **Developer mode**, choose **Load unpacked**, and select this project's `dist/` directory.
3. Open a regular website, click cr4wler in the extension toolbar, and choose **Summon your spider**.
4. Try Curious, Dreamy, or Feral. Use the mischief slider to change scale and the number of borrowed fragments.
5. Pause from the popup or floating dock. **Restore** or **Escape** removes the visitor and every fragment.

The popup's **Try the playground** link opens the bundled demo. For the standalone version:

```sh
npm run dev
# http://127.0.0.1:4173
```

The playground runs the same animation and interaction engine directly. It does not require extension installation and is not evidence that extension permissions work.

## What makes it move

- Eight independent planted feet, analytic inverse kinematics, sharp knees, minute neon joints, and a narrow wireframe torso. No animated images or external assets.
- Silk arrival, spring-driven body movement, staggered steps, cursor gaze, and a front claw that tracks the selected fragment's actual contact point.
- Live text ranges become inert, colored fragments with different scale, stretch, tilt, and fill treatments. Links are preferred. Hover near a loose fragment to give it a little wobble.
- A small tutorial and quiet reduced-motion mode. No flashes, strobing, sound, or explosive particle storms.

## A guest, not a wrecking ball

Only `activeTab` and `scripting` are requested. No host permissions or automatic content scripts. A toolbar gesture grants access to the current tab; Summon injects a single controller into its main frame.

The controller adds a fixed Shadow DOM overlay. It copies **text only**, never HTML, scripts, buttons, images, or embedded content. CSS Custom Highlights temporarily paint the source ranges transparent. The source text, attributes, event handlers, input values, and layout are never rewritten. Restoration deletes only cr4wler's own highlight entry and overlay. Existing highlights and page edits are preserved.

Inputs, forms, buttons, editors, dialogs, embedded frames, hidden content, live regions, and conservatively recognized payment/authentication/private widgets are excluded. Authors can also opt out any subtree with `data-cr4wler-ignore`. This is a visual POC, not a sensitive-data classifier: don't summon it on pages you do not want animated.

Nothing is clicked, submitted, fetched, uploaded, or stored. All fragment text lives only in this page's memory while the effect is active. There are no runtime dependencies, trackers, telemetry, fonts from CDNs, or remote services. See [PRIVACY.md](PRIVACY.md).

## Development

```sh
npm run typecheck
npx playwright install chromium
npm test
npm run test:extension
npm run package
```

`npm test` runs real Chromium DOM/interaction tests, a packaged content-script harness with mocked messaging, and popup tests with mocked Chrome APIs. `test:extension` separately attempts a real unpacked load and fails loudly if policy blocks it. The toolbar permission checklist remains a manual release gate. See [the validation record](docs/TESTING.md) for what was actually verified.

`npm run package` creates `artifacts/cr4wler-0.1.0.zip` and its SHA-256 digest. ZIP entry order, timestamps, and modes are fixed. With the lockfile and the same toolchain, repeated builds produce identical bytes. Unzip before selecting **Load unpacked**. This has not been submitted to the Chrome Web Store.

Useful files:

| File                | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `src/spider.ts`     | Procedural gait, IK, canvas rendering, silk and grip     |
| `src/targets.ts`    | Pruned and bounded safe text scanning                    |
| `src/engine.ts`     | Animation state, fragment projection, lifecycle and undo |
| `src/content.ts`    | Idempotent isolated-world message controller             |
| `src/popup.ts`      | Explicit per-tab activation and settings                 |
| `src/playground.ts` | Standalone demo controls                                 |

Scanning is capped at 1,800 visited nodes and 80 useful ranges per pass, sliced with a roughly 2 ms budget. At most 10 fragments are retained. Device pixel ratio is capped at 2. Animation stops when paused or the tab is hidden. Reduced motion shows a stationary spider and does not select text. Scroll/resize releases all borrowed fragments before scanning the new viewport. No particles are allocated.

## POC boundaries

Protected browser pages, the Chrome Web Store, PDFs, and other extensions' pages cannot be scripted. The built-in playground has its own direct engine. Shadow roots and iframes are deliberately not traversed. CSS-transformed pages, hostile page styles, unusual vertical text, animated layouts, extreme zoom, and live collaborative editors need broader compatibility work. Targets farther than the bounded scan will not be reached on very large documents. Settings are deliberately ephemeral and reset when the popup is reopened without an active visitor.

Motion inspiration: [the reference by @rybinfx](https://x.com/rybinfx/status/2105700296760688790), viewed and analyzed before implementation. All code, procedural motion, visual assets, and playground copy here are original; no video, artwork, or source code was copied. This project is unaffiliated with that creator.

MIT licensed, made for **funsaized**. Contributions with fewer legs are also welcome.
