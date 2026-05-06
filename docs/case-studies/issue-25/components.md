# Components survey — Issue #25

This document catalogues:

1. The components already in `js/src/web/` that the redesign reuses
   or refactors.
2. External libraries that we evaluated and either adopted or
   rejected, with the rationale captured for future maintainers.

## 1. Existing components in this repo

| Component                                                       | Path                              | What it does today                                                                        | Role in the redesign                                                                                        |
| --------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `App`                                                           | `js/src/web/app.js`               | Top-level shell. Hosts `<TopBar>`, single `<nav>`, and the active view.                   | Replaced by `<AppShell>` that swaps between `<BottomNav>`, `<SideRail>`, and `<Drawer>` per breakpoint.     |
| `navItems`                                                      | `js/src/web/nav-items.js`         | List of `[id, translationKey]` pairs (14 entries).                                        | Re-grouped: 5 primary entries get pinned to the bottom-nav; the rest move into a "More" sheet/drawer.       |
| `useT` / `LocaleContext` / `t()`                                | `js/src/web/i18n.js`              | Pure-JS i18n with locale detection, key fallback, ICU-lite interpolation.                 | Reused as-is; we add an "English-leak" guard in the parity test.                                            |
| `ConnectionGuide`, `LocalServerHelp`, `SettingsConnectFirstCta` | `js/src/web/connection-guide.js`  | Help blocks rendered inline inside Settings.                                              | Reused as the body of `ConnectionDetail`; the empty-state copy is moved into translated keys.               |
| `providerCatalogue`                                             | `js/src/web/connection-guides.js` | Registry of all providers + their `apiCredentials.fields`, `archive`, `probeUrlTemplate`. | Extended with a new `setupSteps[]` field (issue R-N8). Every existing provider gets a per-step walkthrough. |
| `SettingsView`                                                  | `js/src/web/settings-view.js`     | Single-screen list of all provider cards (form + archive + probe).                        | Split into `ConnectionsList` (overview) and `ConnectionDetail` (per provider). Settings keeps app prefs.    |
| `TutorialOverlay`, `TutorialButton`                             | `js/src/web/tutorial.js`          | Centred dialog with 5 default steps. Uses `metaSovereignTutorial` localStorage key.       | Refactored into `<TutorialSpotlight>` that dims the page around a `data-tutorial-id` target.                |
| `useAsyncValue`, `AsyncFrame`                                   | `js/src/web/views.js`             | Async data wrappers used by every list view.                                              | Reused unchanged. They isolate transitions between loading / error / empty / data states.                   |
| `globalThis.localStorage` reads/writes                          | various                           | Theme + locale + tutorial preferences.                                                    | Reused; new `connections.lastVisited` preference added to remember which provider the user last opened.     |

## 2. External libraries

### 2.1 Adopted (zero new runtime deps)

The redesign explicitly avoids new runtime dependencies. We adopt
**design tokens** from Chakra UI and **patterns** from Material 3 /
HIG / Fluent without taking a hard dep.

| Source           | What we lift                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Chakra UI v3     | Token names + scale (`--space-1..16`, `--radii-*`, `--shadow-*`), the `useBreakpointValue` hook _shape_, semantic colour roles. |
| Material 3       | Window-size-class breakpoints (compact / medium / expanded), bottom-nav anatomy, navigation rail.                               |
| Apple HIG        | "Liquid Glass" surface treatment, ≤5 primary destinations, in-context onboarding spotlights.                                    |
| Microsoft Fluent | App-shell composition (top-bar + side rail + content), focus-ring style.                                                        |
| WCAG 2.2         | Tap target ≥ 44 × 44 px (AAA), focus-visible outline, reduced-transparency fallback.                                            |

### 2.2 Evaluated and rejected

| Library                  | License  | Bundle cost (gzip) | Reason rejected                                                                                                                                                                          |
| ------------------------ | -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@chakra-ui/react@3`     | MIT      | ~120 KB            | 38% bundle bloat over the current 320 KB SPA. The repo's design philosophy is "small, dependency-light, easy to fork." Adopting Chakra _patterns_ achieves the same UX without the cost. |
| `shepherd.js`            | MIT      | ~30 KB             | Existing `tutorial.js` already has the preference store and step model. The new spotlight primitive is a single function (`computeMaskRects`) — Shepherd would duplicate work.           |
| `driver.js`              | MIT      | ~5 KB              | Smaller than Shepherd but still adds a runtime + CSS conflict.                                                                                                                           |
| `reactour`               | MIT      | ~50 KB             | Brings @reach/popover transitively. Too heavy for one component.                                                                                                                         |
| `intro.js`               | AGPL-3.0 | ~24 KB             | License clash with the repo's Unlicense.                                                                                                                                                 |
| `react-i18next`          | MIT      | ~30 KB             | The existing pure-JS `t()` is sufficient and fast. A runtime swap would expand surface area for no UX gain.                                                                              |
| `@formatjs/intl`         | BSD-3    | ~50 KB             | Same reason as react-i18next.                                                                                                                                                            |
| `framer-motion`          | MIT      | ~45 KB             | Tutorial spotlight + drawer animations are simple enough for CSS transitions. Avoiding a JS animation runtime keeps the SPA fast on mid-tier mobile GPUs.                                |
| `react-glassmorphism`    | MIT      | ~3 KB              | Hard-codes blur values; breaks dark/light token swap. We codify the glass surface as a CSS utility class instead.                                                                        |
| `@radix-ui/react-dialog` | MIT      | ~15 KB             | The repo already has tiny custom dialog rendering via `el(...)`; introducing Radix would force us to replace 12 places where we render dialogs.                                          |

### 2.3 Optional native enhancements (not in scope for this PR)

- `@capacitor/haptics`: nice-to-have for tap feedback in the mobile
  build but adds a peer dep and a native plugin. Tracked as a
  follow-up.
- `@capacitor/status-bar`: would let us tint the iOS status-bar to
  match the glass surface. Same follow-up bucket.

## 3. Component dependency graph after the refactor

```
js/src/web/
├── app.js                       ← assembles AppShell + active view
├── shell/
│   ├── AppShell.js              ← TopBar + (BottomNav | SideRail | Drawer) + content
│   ├── TopBar.js
│   ├── BottomNav.js
│   ├── SideRail.js
│   ├── Drawer.js
│   └── useBreakpoint.js         ← media-query hook
├── connections/
│   ├── ConnectionsList.js
│   ├── ConnectionDetail.js
│   ├── ConnectionStateBadge.js
│   └── connection-router.js     ← mediates list ↔ detail transitions
├── tutorial.js                  ← refactored TutorialSpotlight
├── settings-view.js             ← simplified (app prefs only)
├── connection-guide.js          ← reused for setupSteps rendering
├── connection-guides.js         ← provider catalogue + new setupSteps[]
├── views.js                     ← unchanged shell-of-views (Chat, Operator, etc.)
└── locales/
    ├── en.js                    ← extended with new keys
    └── ru.js                    ← parity-mirrored
```

This module shape lets the existing tests in `js/tests/` keep
working with minimal churn — the "shell" and "connections" folders
are new, but the existing files keep their public exports.

## 4. Public API stability

The redesign does not change any public exports of
`meta-sovereign` (the `package.json` `exports` map). The Web SPA is
internal to the repo's build pipeline; only the `nav-items.js` order
changes externally-visible behaviour for downstream embedders.

The new files added to the public API:

- `js/src/web/shell/index.js` (re-exports the shell components)
- `js/src/web/connections/index.js` (re-exports the connections
  components)

Both are added to the SPA bundle, not to the npm `exports` map, so
no semver bump is required for downstream consumers. The `0.17.0` →
`0.18.0` bump documented in the changeset reflects the user-visible
UX overhaul.
