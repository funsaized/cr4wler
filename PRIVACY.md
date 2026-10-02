# Privacy

cr4wler 0.1.0 performs a local visual effect on a page you explicitly choose.

- **Permissions:** `activeTab` gives temporary access after a toolbar gesture. `scripting` injects the effect into that tab's main frame. No permanent website access is requested.
- **Page text:** a bounded scan reads short eligible text ranges in the current viewport and copies them into inert visual fragments. That text is not sent to a background worker or any server. It is not logged, persisted, analyzed by AI, or used for training.
- **Protected controls:** forms, inputs, editors, buttons, dialogs, live regions, iframes, and recognized sensitive widgets are excluded. The heuristic cannot identify every sensitive page; activation remains your choice.
- **Actions:** cr4wler never clicks site controls, follows site links, submits forms, changes field values, or issues requests to websites.
- **Storage:** no cookies, local storage, extension storage, accounts, analytics, telemetry, or identifiers are used. Current settings and animation state exist only in memory.
- **Network:** the extension has no network functionality. All code, styles, icons, and the playground ship in the package. The playground's View source link opens GitHub only if you click it.
- **Restore:** Escape or Restore removes the overlay and the effect's CSS highlight. Navigating away unloads the page controller; restoring releases its text references. Pausing freezes the effect until you resume or restore it.

Report a privacy issue without including real page text, private URLs, or screenshots containing sensitive information. See [CONTRIBUTING.md](CONTRIBUTING.md).
