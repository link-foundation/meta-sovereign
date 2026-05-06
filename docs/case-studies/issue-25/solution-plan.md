# Solution plan — Issue #25

This plan splits the issue #25 work into six small commits. Each
commit ships at least one new test and is independently reviewable.
Requirement IDs (`R-N1` … `R-N12`) correspond to
[`./requirements.md`](./requirements.md).

## Commit 1 — Mobile-first App Shell (R-N1, R-N2)

**Goal**: replace the wrapping `<nav>` row with an adaptive shell
that switches between bottom-nav, side-rail, and drawer based on
viewport width.

**Files changed**

- `js/src/web/index.html` — replace the `<nav>` element with an
  `<div id="app-root">` mount point.
- `js/src/web/app.js` — render `<AppShell>{activeView}</AppShell>`.
- `js/src/web/app.css` — add breakpoint queries (`@media (max-width: 640px)`,
  `@media (min-width: 641px) and (max-width: 1023px)`, `@media (min-width: 1024px)`).
- New `js/src/web/shell/AppShell.js` — chooses the nav layout via
  `useBreakpoint()`.
- New `js/src/web/shell/TopBar.js` — brand + status pill + theme +
  language. ≤56 px tall.
- New `js/src/web/shell/BottomNav.js` — 5 primary destinations + "More".
- New `js/src/web/shell/SideRail.js` — vertical icons + labels, 80 px wide.
- New `js/src/web/shell/Drawer.js` — permanent at expanded widths.
- New `js/src/web/shell/useBreakpoint.js` — `matchMedia` hook.
- New `js/src/web/shell/index.js` — re-exports.

**Tests added**

- `js/tests/web-shell.test.js` — smoke renders the SPA at
  320 / 768 / 1280 px and asserts the nav structure (selectors:
  `[data-shell="bottom-nav"]`, `[data-shell="side-rail"]`,
  `[data-shell="drawer"]`).

## Commit 2 — Glass surface tokens (R-N11)

**Goal**: introduce the Apple-style translucent surface treatment
with a `prefers-reduced-transparency` fallback.

**Files changed**

- `js/src/web/app.css` — add CSS custom properties:
  - `--surface-glass: rgba(20, 24, 32, 0.55)`
  - `--surface-glass-strong: rgba(14, 17, 23, 0.78)`
  - `--surface-fallback: rgba(20, 24, 32, 0.96)`
  - `--surface-blur: 28px`
  - `--surface-saturate: 180%`
  - utility classes: `.glass`, `.glass-strong`
  - `@supports (backdrop-filter: blur(1px))` rule with the blur
  - `@media (prefers-reduced-transparency: reduce)` solid fallback
- Apply `.glass` to `<TopBar>`, `<BottomNav>`, `<SideRail>`,
  `<Drawer>`, dialog cards, tutorial card.

**Tests added**

- Extend `js/tests/web-shell.test.js` to assert that the rendered
  shell components carry the `.glass` class.

## Commit 3 — Connections module (R-N4, R-N5, R-N6, R-N7, R-N8)

**Goal**: extract the per-provider settings into a dedicated
`Connections` view with overview list and detail screen.

**Files changed**

- `js/src/web/nav-items.js` — replace `settings` with `connections`
  for the Connections entry; keep `settings` as the app-prefs page.
- New `js/src/web/connections/ConnectionsList.js`
- New `js/src/web/connections/ConnectionDetail.js`
- New `js/src/web/connections/ConnectionStateBadge.js`
- New `js/src/web/connections/connection-router.js` — owns the
  list ↔ detail transition (uses local React state, no router
  dependency).
- `js/src/web/connection-guides.js` — extend every provider entry
  with a `setupSteps[]` array. Step shape:

  ```js
  {
    id: 'create-app',
    titleKey: 'connections.telegram.steps.create-app.title',
    bodyKey: 'connections.telegram.steps.create-app.body',
    actionKey: 'connections.telegram.steps.create-app.action', // optional CTA label
    href: 'https://my.telegram.org/apps',                      // optional outbound link
  }
  ```

- `js/src/web/settings-view.js` — strip the provider list. Keep
  archive defaults, theme, language preferences only.
- `js/src/web/locales/en.js`, `ru.js` — add the new keys
  (`connections.title`, `connections.<provider>.title`,
  `connections.<provider>.steps.*`, `connections.state.connected`,
  `connections.state.notConnected`, `connections.state.actionRequired`).

**Tests added**

- `js/tests/connections-screens.test.js` — asserts every provider
  in `providerCatalogue` produces a card whose label resolves via
  `t()`, and that tapping a card invokes the navigate handler with
  the provider id.
- Extend `js/tests/connection-guides-templates.test.js` — every
  provider has at least one `setupSteps` entry whose `titleKey` and
  `bodyKey` resolve in en + ru.

## Commit 4 — Element-anchored tutorial (R-N9, R-N10)

**Goal**: replace the centred tutorial dialog with a spotlight that
dims the page around a target element identified by
`data-tutorial-id`.

**Files changed**

- `js/src/web/tutorial.js`:
  - Replace the centered `<TutorialOverlay>` with `<TutorialSpotlight>`.
  - New `findTutorialTarget(stepId)` helper that locates the DOM
    node via `[data-tutorial-id="<stepId>"]`.
  - New `computeMaskRects(targetRect, viewportRect)` returns four
    `{top, right, bottom, left}` rectangles that surround the target.
  - The card position adapts to available space (above/below/right
    of the target).
  - Steps reordered to start with `connections` (R-N10).
- `js/src/web/app.css` — `.tutorial-mask` (4 absolutely-positioned
  panels), `.tutorial-card.glass` styling, scroll-into-view animation.
- `js/src/web/locales/en.js`, `ru.js` — add `tutorial.connections.*`,
  `tutorial.connectionDetail.*` keys; keep existing welcome/chat/etc.
  keys.
- `js/src/web/shell/BottomNav.js` — add `data-tutorial-id="connections"`
  to the Connections nav button so the first tutorial step can find it.
- `js/src/web/connections/ConnectionDetail.js` — add
  `data-tutorial-id="connection-detail"` to the credentials form.

**Tests added**

- `js/tests/tutorial.test.js` extended with:
  - `findTutorialTarget()` returns the element when present, `null`
    otherwise.
  - `computeMaskRects()` returns 4 rects whose union covers the
    viewport minus the target.
  - The default step list opens with the `connections` step.

## Commit 5 — Translation completeness (R-N3)

**Goal**: zero English literals reach the user when locale = ru.

**Files changed**

- `js/src/web/connection-guides.js` — every English `description`,
  `connectionState.connectedLabel`, `connectionState.disconnectedLabel`,
  `archive.note`, `apiCredentials.fields[].helpText`, etc. moved to
  `*Key` properties.
- `js/src/web/connection-guide.js` — render via `t()`, fall back to
  the key only if missing.
- `js/src/web/views.js` — sweep for any remaining hard-coded user
  strings (e.g. "Your unified inbox starts empty.").
- `js/src/web/settings-view.js` — empty-state copy via `t()`.
- `js/src/web/locales/en.js`, `ru.js` — translation pairs.
- `js/tests/i18n.test.js` extended with the "no English leaks"
  guard:

  ```js
  for (const [key, enValue] of Object.entries(en)) {
    if (typeof enValue !== 'string') continue;
    if (LANG_NEUTRAL.has(key)) continue; // appName, brand
    if (!HAS_LATIN_WORD.test(enValue)) continue;
    assert.notStrictEqual(
      ru[key], enValue,
      `ru.${key} is identical to en — translation missing`,
    );
  }
  ```

**Tests added** (covered above).

## Commit 6 — Requirements doc + changeset + finalize (R-N12)

**Goal**: keep `docs/REQUIREMENTS.md` in sync, mirror the changes to
the translated requirement files, and bump the version.

**Files changed**

- `docs/REQUIREMENTS.md` — new "N. Mobile-first UI overhaul (issue #25)"
  section listing R-N1…R-N12 with their acceptance criteria.
- `docs/REQUIREMENTS.ru.md`, `docs/REQUIREMENTS.zh.md`,
  `docs/REQUIREMENTS.hi.md` — mirror new section (translated rows).
- `docs/UI-DESIGN-AUDIT.md` — link to the new R-N section.
- `.changeset/issue-25-mobile-first-glass.md` — minor version bump
  to 0.18.0 with summary aligned with the case study README.
- PR #26 description updated with screenshots, test plan, and PR
  diff highlights.

**Tests added** — none (docs only).

## Risks & mitigations

| Risk                                                                         | Mitigation                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaking existing e2e (`js/tests/e2e-browser-spa.mjs`) due to new selectors. | Add `data-view` aliases on the new shell so the existing test selectors keep working; update the e2e if the structural change is unavoidable. |
| Glass surfaces hurt low-end mobile GPUs.                                     | Limit to 4 simultaneous glass layers; respect `prefers-reduced-transparency`; gate via `@supports (backdrop-filter: blur(1px))`.             |
| Translation leaks not caught by the new assert (string equality is fragile). | Add a regex-based "looks like an English sentence" detector as a second guard; allow-list a small set of brand names (`appName`, `Telegram`). |
| Tutorial spotlight covers the target on small screens.                        | When the target rect occupies more than 60% of the viewport, fall back to a centred card — log this branch for review.                       |
| Provider `setupSteps[]` schema drift between providers.                       | A schema test (`connection-guides-templates.test.js`) asserts each step has `id`, `titleKey`, `bodyKey`. Extra fields are optional.          |

## Rollback plan

Each commit is independently revertible:

1. Revert commit 6 → docs only.
2. Revert commit 5 → translations regress, but the UI keeps working.
3. Revert commit 4 → tutorial returns to the centred-modal version.
4. Revert commit 3 → connections move back into Settings.
5. Revert commit 2 → glass surfaces fall back to opaque.
6. Revert commit 1 → restores the original wide-`<nav>` shell.

The PR aims to land all six together, but if review surfaces a
regression we can park the later commits behind a feature toggle.
