---
'meta-sovereign': minor
---

R-M1..R-M18: Replace every empty SPA section with a connection guide,
add a CORS-aware direct-API probe with same-origin server fallback,
and ship a step-by-step tutorial overlay.

- New `js/src/web/connection-guides.js` — provider catalogue
  (Telegram, VK, X, WhatsApp, Facebook, LinkedIn, career.habr.com,
  hh.ru, SuperJob), per-section guide registry mirroring `navItems`,
  `tryDirect()` CORS-classifier, `localServerHelp` install copy
  (Rust / Node / Docker), `applyLocalServerOverride()` manual override.
- New `js/src/web/connection-guide.js` — React `<ConnectionGuide />`
  and `<LocalServerHelp />` components rendered into the empty branch
  of every view in `js/src/web/views.js` (chat, operator, contacts,
  automation, patterns, replies, facts, audience, broadcast, outreach,
  profile, backup, status).
- New `js/src/web/tutorial.js` — in-tree tour layer (`TutorialOverlay`,
  `TutorialButton`, `useTutorialPreference`, `defaultSteps`) that
  opens on first run, supports per-step skip, full turn-off, and
  re-open from a header button. Preference persists under the
  `metaSovereignTutorial` localStorage key.
- `js/src/web/app.js` mounts the tutorial alongside the existing theme
  toggle.
- New `docs/case-studies/issue-10/` with `README.md`, `requirements.md`,
  `solution-plan.md`, `components.md`, `external-research.md`, and raw
  issue/comment payloads under `data/`.
- New section **M. Sovereign onboarding & connection guides
  (issue #10)** in `docs/REQUIREMENTS.md`.
- New `js/tests/connection-guides.test.js` and `js/tests/tutorial.test.js`
  cover the guide registry, `tryDirect()` classification paths, and
  the tutorial preference round trip.
