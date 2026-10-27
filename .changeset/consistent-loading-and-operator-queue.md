---
'meta-sovereign': patch
---

Center page and pane loading states in the same content regions as empty states, retain the Operator toolbar during startup, and align profile actions with consistent spacing. Preserve the selected conversation when a narrow screen opens a chat deep link.

Keep skipped Operator cards unread at the end of a tab's queue across navigation and reloads. Only successful Done acknowledges messages; completion respects postponed order.

Track media decoding and playback readiness separately from URL availability. Reserve photo/album geometry, show loading for photos, viewers, previews, avatars, video, audio, round videos, stickers and imported/remote media, and expose retry/fallback after failures. Open known Telegram peers through native protocol links; explain separate Web sign-in for contacts without a username or visible phone number.

Drain or cancel snapshot workers before releasing the store writer lock, preventing a background snapshot from racing application-folder migration. Handle Deno worker completion without waiting for an exit event its compatibility layer may omit. Preserve Profile after passcode unlock in browser regression coverage.

Wait for passcode status before rendering cached data. Validate persisted loopback certificates with portable crypto primitives so Deno does not replace trusted certificates because optional X509 methods are missing.
