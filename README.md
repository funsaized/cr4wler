# cr4wler

**A tiny neon troublemaker for the open web.** Eight legs. Excellent taste. Questionable manners.

cr4wler is a Chrome extension for the sake of _whimsey_ that climbs over a real page, locks onto phrases with a head-mounted beam, 'eats' its typography. A persistent composition accumulates as you scroll. The original page stays in place. Press **Escape** and everything returns immediately.

![Full Chromium window: cr4wler in neon color, Feral at maximum intensity, then Curious following the cursor.](docs/cr4wler-demo.gif)

[Full browser demo · 30fps](docs/github-demo.webm) · [Watch the night-archive demo](docs/demo.webm) · [Installed extension: daylight](docs/extension-demo.webm) · [Installed extension: night](docs/extension-night-demo.webm) · [Privacy](PRIVACY.md) · [Testing and limitations](docs/TESTING.md) · [Contributing](CONTRIBUTING.md)

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
4. The popup closes after a successful launch. Reopen it to try Curious, Dreamy, or Feral. Use the mischief slider to change the force of the typographic effects. Enable **Follow my cursor**, hover a word to choose its next target, then guide it toward the top or bottom edge to crawl through the page.
5. Pause from the popup or floating dock. **Reset page** or **Escape** removes the visitor and every fragment.

The popup's **Try the playground** link opens the bundled night garden. Its **Daylight stress test** link opens an ordinary document with 1,800 fictional references across 60 sections; **Night archive** switches the same dense fixture to dark colors. For the standalone version:

```sh
npm run dev
# http://127.0.0.1:4173
```

The playground runs the same animation and interaction engine directly. It does not require extension installation and is not evidence that extension permissions work.

The demo site welcomes one spider automatically when each page is ready. Pause keeps it still; Reset or Escape leaves it off until you choose Summon. Reduced motion shows a quiet, static visitor. Cached history returns preserve your active, paused or reset choice. The extension still needs its toolbar Summon action on other websites.

## What makes it move

- Eight planted feet, analytic inverse kinematics, articulated knees, crisp neon leg cores and luminous joints. A compact braced body, forward eyes and little palps turn toward your next target. All procedural; no animated images or external assets.
- Silk arrival and spring-driven movement. The head points toward a live target; a sweeping selector settles into a lock box, pauses in anticipation, then strikes. A gripping front leg follows the contact point during peeling and shearing.
- Five rotating effects: peeling phrases, skewed shear, scattered glyph groups, staggered disassembly, and ragged erasure trails. Original text is visually masked; colored inert shards form the aftermath.
- Every committed mark keeps its identity, color, and displacement as you scroll away and return. Reflow updates its anchor to the original live range. Nothing times out. Reset, Escape, or refresh clears the whole composition.
- Optional cursor following resolves the actual eligible text under your pointer. The eyes and selector acknowledge it promptly; a stable hover replaces a wandering target, approach or lock. Only an already-started strike finishes before the latest hover takes over.
- Small moving selector accents and low-contrast local pulses; no full-page flashes or high-contrast strobing. Reduced motion shows a still visitor, disables scanning/strikes and retains existing aftermath without continuous animation.

## Take the lead

With **Follow my cursor** enabled, hover an eligible phrase or link. Small pointer jitter stays on the same target. Moving to another element changes the next hunt; it does not activate that element. Inputs and protected widgets remain excluded.

Hold near the top or bottom edge for a deliberate crawl. Speed increases toward the edge, with a 440px/s ceiling. Move back toward the center to stop immediately. Each edge visit rests after six seconds or 1,800px; move again or leave/re-enter the zone to continue. Wheel, touch and navigation-key scrolling take priority and require fresh pointer movement before edge crawling resumes. Pause, leaving the page, losing focus, disabling follow or reduced motion stops scrolling.

| Temperament | How it feels                                                      | Stable hover / lock / strike |
| ----------- | ----------------------------------------------------------------- | ---------------------------- |
| Dreamy      | Orb-weaver: rounded and tufted, buoyant steps, deliberate peeling | 140 / 460 / 420ms            |
| Curious     | Widow: round abdomen, narrow waist, long purposeful stalking legs | 75 / 200 / 300ms             |
| Feral       | Jumping spider: compact body, large front eyes, short pounces     | 35 / 75 / 180ms              |

These are intended timing budgets. Body approach and browser frame cadence also affect completion time. A strike already in progress is briefly atomic; moving during it queues your latest target. Each temperament is a different procedural spider type, with its own anatomy, gait, acquisition, effect ordering and rhythm. Curious is a widow with a round abdomen, narrow waist and long stalking legs. Dreamy is a rounded, gently tufted orb-weaver with slow buoyant steps. Feral is a compact jumping spider with large front eyes, quick scuttles and short crouched pounces.

Rapid scrolling releases planted contacts before they exceed their fixed leg reach. The spider crouches, tucks its feet for a short hop, lands on the new visible surface, and chooses nearby text. An offscreen strike keeps its committed mark while releasing its grip. Repeated scrolls cannot drag airborne feet or restart a hop indefinitely. Reduced motion and paused geometry use a calm bounded reset. Recovery never scrolls the page.

## Privacy: a guest, not a wrecking ball

Nothing is clicked, submitted, fetched, uploaded, or stored. All fragment text lives only in this page's memory while the effect is active. There are no runtime dependencies, trackers, telemetry, fonts from CDNs, or remote services. See [PRIVACY.md](PRIVACY.md).

The controller adds a fixed Shadow DOM overlay. It copies **text only**, never HTML, scripts, buttons, images, or embedded content. Inputs, forms, buttons, editors, dialogs, embedded frames, hidden content, live regions, and conservatively recognized payment/authentication/private widgets are excluded. Authors can also opt out any subtree with `data-cr4wler-ignore`.

Nothing is clicked, submitted, fetched, uploaded, or stored. All fragment text lives only in this page's memory while the effect is active. There are no runtime dependencies, trackers, telemetry, fonts from CDNs, or remote services. See [PRIVACY.md](PRIVACY.md).

## Development

```sh
npm run typecheck
npx playwright install chromium
npm test
npm run test:extension
npm run package
```

`npm test` runs real Chromium DOM/interaction tests, a packaged content-script harness with mocked messaging, and popup tests with mocked Chrome APIs. `test:extension` separately loads the actual extension, verifies denial before a gesture, triggers Chrome’s toolbar action, and exercises the real popup page and isolated-world controller with unmodified permissions and real Chrome APIs. It records pointer-controlled videos and screenshots on dense light and dark pages and fails loudly if browser policy blocks installation. See [the validation record](docs/TESTING.md), including the remaining manual compatibility checklist.

`npm run package` creates `artifacts/cr4wler-0.4.1.zip` and its SHA-256 digest. ZIP entry order, timestamps, and modes are fixed. With the lockfile and the same toolchain, repeated builds produce identical bytes. Unzip before selecting **Load unpacked**. This has not been submitted to the Chrome Web Store.

Useful files:

| File                | Responsibility                                             |
| ------------------- | ---------------------------------------------------------- |
| `src/spider.ts`     | Procedural gait, IK, canvas rendering, silk and grip       |
| `src/targets.ts`    | Pruned and bounded safe text scanning                      |
| `src/engine.ts`     | Hunt sequence, persistent records, virtualization and undo |
| `src/effects.ts`    | Seeded fragment treatments and bounded projections         |
| `src/content.ts`    | Idempotent isolated-world message controller               |
| `src/popup.ts`      | Explicit per-tab activation and settings                   |
| `src/playground.ts` | Standalone demo controls                                   |

Discovery combines viewport hit testing with a progressive document cursor. Each pass is bounded to 1,800 visited nodes and 80 useful ranges, in roughly 2 ms slices, so deep reference sections can be reached without rescanning an entire document each frame. Layout is read on acquisition and coalesced scroll/resize/content events, not on every animation frame.

A session keeps up to **512 persistent records** and at most **72 DOM projections**, each with no more than 16 shards. Offscreen records retain their source ranges and transforms without mounted DOM. If reflow makes more than 72 records visible together, the excess settled marks use one shared canvas. At 512 marks the spider stops making new ones and explicitly asks for Reset; it never silently evicts old visible aftermath. A source removed, changed, hidden, or made ineligible by its page is safely released rather than overwriting that page's edits.

Device pixel ratio is capped at 2. Hunting stops when paused or the tab is hidden. Paused marks still follow document scrolling and reflow. No particles are allocated, and no record survives a page refresh.

## POC boundaries

Protected browser pages, the Chrome Web Store, PDFs, and other extensions' pages cannot be scripted. The built-in playground has its own direct engine. Shadow roots and iframes are deliberately not traversed. CSS-transformed pages, hostile page styles, unusual vertical text, animated layouts, extreme zoom, and live collaborative editors need broader compatibility work. Discovery is incremental and does not promise to visit every eligible phrase. Settings are deliberately ephemeral and reset when the popup is reopened without an active visitor.

Inspiration behind the implementation: [rybinfx](https://x.com/rybinfx/status/2105700296760688790?s=20)

MIT licensed, made for **fun**. Contributions with fewer legs are also welcome.
