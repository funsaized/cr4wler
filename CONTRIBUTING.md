# Contributing

Welcome. Keep the creature playful, the page usable, and the dependency list small.

1. Fork the repository and create a focused branch.
2. Use Node.js 22.12+; run `npm ci` and `npx playwright install chromium`.
3. Develop with `npm run dev`. The demo and extension use the same engine.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run format:check`. Use `npm run format` (Oxfmt) and `npm run lint:fix` (Oxlint) to apply formatting and safe lint fixes.
5. For extension changes, run `npm run test:extension` and the manual checks in [docs/TESTING.md](docs/TESTING.md) in a profile that allows unpacked extensions.
6. Describe the visible change, the reason for it, and what you actually tested. Include a short recording for motion changes.

Preserve the permission boundary: no permanent host access, background browsing, remote code, content collection, site actions, or credential creation. Restoration must delete only our own effects and preserve edits made by the page or user during a session. Do not clone page HTML into the overlay.

Prefer meaningful browser behavior checks over assertions that duplicate implementation. Keep scans, fragments, rendering resolution, and per-frame work bounded. Test keyboard control and reduced motion. Do not attach private website content to issues or recordings; reproduce with the controlled playground or a minimal synthetic fixture.

For a suspected privacy or security issue, use the repository's private security reporting route if enabled, or contact its owner privately. Do not post sensitive details in a public issue. Contributions are licensed under MIT.

User-facing runtime copy lives in `src/vocabulary.ts`: shared guidance, temperament descriptions, intensity labels, and short activity phrase banks. `src/messaging.ts` selects phrases on activity or temperament changes, without timers or randomness. Add variants to the relevant bank; keep Pause, Resume, Restore, accessibility guidance, and recovery instructions explicit. Static popup/playground text can opt into shared copy with `data-copy`; keep its HTML fallback readable.
