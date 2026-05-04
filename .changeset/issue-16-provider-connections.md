---
'meta-sovereign': minor
---

R-O1..R-O19: Centralise every provider connection on a new Settings nav
surface. Per-provider cards expose typed credential inputs, archive
file upload + paste-fallback, and a "Try directly" probe that builds
the URL from a `probeUrlTemplate` (e.g. Telegram
`bot{token}/getMe`, Meta Graph `?access_token={token}`) so it never
fires the broken legacy `/bot/getMe` or tokenless `/me` requests that
returned 404/400. Each per-section guide now surfaces a "Connect first"
CTA that deep-links into the matching Settings card via a custom
`meta-sovereign:navigate` event. Credentials persist as
encrypted-at-rest `secret:*` links via the existing `wrapSecretStore`
contract and are still filtered from peer sync.
