---
'meta-sovereign': minor
---

R-N1..R-N12: Mobile-first overhaul of the SPA shell, the connections
flow, and the tutorial. The new `js/src/web/shell/` module exposes an
`<AppShell>` that swaps between a compact bottom-nav (≤640 px), a
navigation rail (641-1023 px), and a permanent drawer (≥1024 px), with
44 × 44 px tap targets, `:focus-visible` rings, and
`safe-area-inset-bottom` padding. `js/src/web/app.css` adds Apple
Liquid Glass tokens (`--surface-glass`, `.glass`, `.glass-strong`) that
use `backdrop-filter: blur(28px) saturate(180%)` with a solid fallback
when `prefers-reduced-transparency: reduce` is set. A dedicated
Connections page lives under `js/src/web/connections/`: the list
renders one card per provider with translated name, description, and a
`connected` / `not-connected` / `action-required` state badge, and
tapping a "not connected" provider routes to a dedicated detail screen
that walks the user through the provider's `setupSteps[]` (newly
declared on every entry of `js/src/web/connection-guides.js`). The
tutorial overlay (`js/src/web/tutorial.js`) gains an element-anchored
`<TutorialSpotlight>` that dims everything outside a target rect using
a `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` outset; the default
sequence opens with a "Connect a service" step pointing at the
Connections nav entry, with translated copy in `en/ru/zh/hi`. All
user-facing strings — including the connection guides — now route
through `t()`, so the Russian build no longer leaks the English
"Your unified inbox starts empty." literal. Tests:
`js/tests/connections-screens.test.js`,
`js/tests/tutorial-spotlight.test.js`, and the existing
`js/tests/i18n.test.js` parity assertions guard the new surface area.
Full atomic table and evidence: `docs/case-studies/issue-25/`.
