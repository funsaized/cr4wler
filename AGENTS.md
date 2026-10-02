# cr4wler

Chrome MV3 extension and standalone playground for a procedural spider that borrows page text. Strict TypeScript, native DOM/Canvas, esbuild; no runtime dependencies.

## Working approach

- Keep work focused: read the relevant code, make the smallest coherent change, verify it.
- Check `git status` before editing. Preserve unrelated working-tree and staged changes; avoid repository-wide formatting for a local change. Format at the end of edits.
- Use `README.md` for product behavior, `CONTRIBUTING.md` for contribution rules, and `docs/TESTING.md` for browser checks and evidence requirements. Read these as needed rather than loading every document.
- Finish with the visible change, checks actually run, and any failures or limitations.

## Layout

- `src/engine.ts`: shared lifecycle, hunt sequence, persistent marks, virtualization, and restoration.
- `src/spider.ts`: procedural anatomy, gait, inverse kinematics, and canvas rendering.
- `src/targets.ts`: bounded discovery and safe text eligibility.
- `src/effects.ts`: fragment treatments and projections; `src/hunt-profiles.ts`: temperament timing; `src/runtime-quality.ts`: adaptive rendering quality.
- `src/content.ts`: idempotent isolated-world controller; `src/popup.ts`: per-tab activation/settings; `src/background.ts`: intentionally idle service worker.
- `src/playground.ts`: standalone controls; `src/types.ts`: shared settings, status, and messages.
- `public/`: manifest, HTML/CSS, icons, and synthetic fixtures. `scripts/build.mjs` copies these and bundles entry points into `dist/`.
- `tests/*.test.mjs`: Node test runner, Playwright browser behavior, and procedural geometry tests. `scripts/`: build, serve, installed-extension checks, performance, capture, and packaging.
- `docs/`: testing guidance, current performance report/data, and selected demo evidence. Generated runs belong in ignored `artifacts/`; do not hand-edit `dist/`.

## Commands

Use Node.js 22.12+ and npm with the committed lockfile. Python 3 is needed for packaging.

```sh
npm ci
npx playwright install chromium
npm run dev                 # Builds, then serves http://127.0.0.1:4173
npm run typecheck
npm run lint
npm run format:check
npm test                    # Builds, then runs tests/*.test.mjs
```

- Run the four checks above (`typecheck`, `lint`, `format:check`, `test`) for code changes. For documentation-only edits, check formatting of the changed files with `npx oxfmt --check <files>`.
- Extension changes: `npm run test:extension`. Native popup changes: `xvfb-run -a -s "-screen 0 1280x900x24" npm run test:popup` (requires Xvfb on headless Linux).
- Runtime performance changes: `npm run perf:runtime`; use `docs/RUNTIME-PERFORMANCE.md` for measurement methodology.
- Packaging changes: `npm run package` produces a versioned ZIP and digest in `artifacts/`.
- `npm test` includes mocked Chrome APIs; it does not prove installation or permissions. Report browser-policy blocks honestly. Follow the manual checks in `docs/TESTING.md` for extension changes.

## Conventions and invariants

- Follow nearby code: ES modules, extensionless local TypeScript imports, explicit shared types in `src/types.ts`, two-space indentation, single quotes, and semicolons. Oxfmt and Oxlint are authoritative; prefer existing helpers over new dependencies or abstractions.
- Keep the extension and playground on the same engine. Build output targets Chrome 105; preserve compatibility with `public/manifest.json`.
- Preserve `activeTab` + `scripting` and explicit toolbar activation on other websites. No permanent host permissions, background browsing, remote code, runtime network services, telemetry, or persistence of page content.
- Copy text only into the Shadow DOM overlay, never page HTML. Preserve protected-target exclusions and `data-cr4wler-ignore`; do not traverse iframes or page shadow roots or trigger site actions.
- Reset/Escape must remove only our effects and preserve page/user edits. Repeated activation must not duplicate visitors, listeners, or pending work.
- Keep scanning, layout work, projections, and rendering bounded. Preserve persistent marks without silent eviction; avoid per-frame document scans and layout reads. Respect Pause, hidden tabs, reduced motion, keyboard controls, and manual-scroll priority.
- Add meaningful behavior regressions for fixes. Use synthetic fixtures and `?autostart=off` when tests control activation. Include a short recording for motion changes; never capture private site content as evidence.
