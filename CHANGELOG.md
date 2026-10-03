# Changelog

## 0.4.1 — first public preview

Experimental GitHub prerelease. The existing package, lockfile and Chrome manifest all use `0.4.1`; this first tag preserves that version. Install the release ZIP unpacked in a permitted Chrome profile. See [Install and upgrade](README.md#install).

- Three procedural spider species, typography hunts and reversible text, image, card and rule treatments.
- Toolbar activation, per-tab settings, cursor guidance, bounded edge scrolling, Pause/Resume and Restore/Escape.
- First-use guidance, origin-local preferences, keyboard controls and reduced-motion behavior.
- Bounded discovery, geometry reuse, persistent marks and cleanup that preserves page/user edits.
- Bundled playground and synthetic fixtures; automated browser, installed-extension and native-popup checks.
- Inline animated README demo, original normal-speed video, deterministic installable ZIP and SHA-256 checksum.

The extension uses only `activeTab` and `scripting`, with no permanent host permissions, runtime network services or saved site content. See [Privacy](PRIVACY.md).

### Known limits

Dense mixed scroll/resize/zoom workloads still have roughly 100ms frame tails on the tested SwiftShader executor, despite 35–43% less measured surface CPU work. This is not steady 60 FPS or representative-GPU certification.

Native background suspension, same-ID changed-bundle updates, physical touch devices, representative GPUs and full-cap/indefinite active-session memory remain unverified. Native 100%→110% zoom was checked locally; the five-minute, 129-mark retention check supports bounded cleanup stabilization only. See [Testing](docs/TESTING.md) and [Performance](docs/RUNTIME-PERFORMANCE.md) for evidence and manual checks.

No Chrome Web Store distribution is included. Browser policy can block unpacked extensions, and restricted pages cannot host the effect.
