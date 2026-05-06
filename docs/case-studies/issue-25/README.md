# Case Study — Mobile-first UI/UX overhaul (Issue #25)

**Issue:** [link-foundation/meta-sovereign#25](https://github.com/link-foundation/meta-sovereign/issues/25)
**Status:** In progress
**Pull request:** [#26](https://github.com/link-foundation/meta-sovereign/pull/26)
**Branch:** `issue-25-dac43a780b5c`

---

## 1. Executive summary

Issue #25 reports four problems with the current SPA, summarised from
the maintainer's screenshots and bullet list:

1. The shell is **not mobile-first**: 14 navigation buttons sit in a
   single horizontal `<nav>` that wraps into 4 visual rows on a
   ~390 px viewport before the user can see any content.
2. Visible **mixed-language UI**: even when the user picks Russian
   from the language switcher, the empty-inbox header still reads
   "Your unified inbox starts empty." (English) and the language
   switcher itself sits awkwardly on top of the navigation as a
   second header row.
3. **Service connections are buried inside the global Settings tab**.
   Each provider exposes a free-form card stacked vertically with
   credentials, archive import, and a "Try directly" probe — there is
   no overview screen showing _which_ providers are connected, no
   per-provider deep-link, and no in-app guidance on _how_ to obtain
   the credentials beyond a single "How to obtain the credentials ↗"
   link that exits the app.
4. The **tutorial is a centred dialog** that describes flows without
   pointing at the actual UI. There is no "spotlight" / dimming
   effect; the user has to mentally translate "open the Chat tab"
   into a click.

The maintainer's directive: rebuild the UI mobile-first, use
Apple/Google/Microsoft design guidance, render Apple-style "glass"
surfaces, keep React, and adopt Chakra UI. The translation must be
total, not partial. Service connections must move to a dedicated
Connections screen with a per-service detail page that walks the user
through credential acquisition. The tutorial must spotlight real
elements step-by-step.

This case study is the data backing for the implementation plan that
PR #26 carries out.

---

## 2. Verbatim requirements (from the issue body)

> 1. It should be mobile first, and UI/UX should be in best possible
>    way
> 2. All user facing UI must be translated, not partially, but fully.
> 3. External services connections should be on separate page like
>    settings, and also there for each separate service we should have
>    item (design in the best way, so it will show if we connected or
>    not, the way of connection and so on), and if we are not
>    connected we for each service we should be redirected to separate
>    screen/page, as each service settings can have quite alot of
>    settings, make sure it is easy for user to get all required data,
>    and it is clearly explained how to get them, so no separate
>    instructions are needed.
> 4. The tutorial should be based on actual UI elements, meaning we
>    should make darker everything except next click/tap/press, and
>    clearly describe what to select on each step. So user is guided
>    first to service connections - he selects any service he likes
>    and there he is guided on how to setup this specific service.

> Use Apple/Google/Microsoft design guidelines. And make UI design
> similar to Apple glass with semi transparent UI, use Chakra UI +
> React.js

> Double check to update our requirements they reflect something
> different.

See [`./requirements.md`](./requirements.md) for the parsed requirement
table with stable identifiers (`R-N1` … `R-N12`) so changesets and PRs
can reference each requirement individually.

---

## 3. Current-state evidence

The two screenshots below were attached to the issue and are mirrored
in [`./screenshots/`](./screenshots/) so the case study survives
GitHub asset rotation.

| File                                                                   | Notes                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`screenshots/desktop-current.png`](./screenshots/desktop-current.png) | 1824 × 1097 desktop screenshot. Top-bar is a single overflow row, language switcher takes the full width below. Russian + English mix. |
| [`screenshots/mobile-current.png`](./screenshots/mobile-current.png)   | 686 × 1097 mobile screenshot. Nav wraps into ~4 rows; "online/offline" badge floats; empty-inbox copy is English while UI is Russian.  |

Code-side evidence (paths are relative to repo root):

- `js/src/web/index.html` keeps a single `<nav>` with **14 hard-coded
  `<button>`s** for every top-level surface
  ([`index.html:17-32`](../../../js/src/web/index.html)). The same list
  is mirrored in `js/src/web/nav-items.js`.
- `js/src/web/app.js` renders the same 14 buttons via
  `navItems.map(...)`
  ([`app.js:138-150`](../../../js/src/web/app.js)). No mobile drawer,
  no bottom-bar, no priority+ pattern.
- `js/src/web/app.css` is plain dark-mode CSS with `flex-wrap: wrap`
  on `.topbar nav` ([`app.css:73-77`](../../../js/src/web/app.css)).
  No backdrop-filter, no glass surfaces, no `prefers-reduced-motion`
  carve-outs.
- `js/src/web/settings-view.js` renders **every** provider card in a
  single scrolling list keyed by anchor (`id="conn-{providerId}"`) so
  the user has to scroll past 10+ providers to find one
  ([`settings-view.js:439-451`](../../../js/src/web/settings-view.js)).
- `js/src/web/tutorial.js` mounts a centred modal with the rest of the
  app dimmed to `rgba(0,0,0,0.55)`
  ([`app.css:362-371`](../../../js/src/web/app.css)). It does not
  highlight any real DOM element nor scroll the user to the right
  surface.

The English-only copy "Your unified inbox starts empty." that the
mobile screenshot leaks is a hard-coded string in
`js/src/web/connection-guides.js` (the per-provider guide registry)
and not yet routed through `i18n.t()`.

---

## 4. Online research (UI/UX guidance)

| Source                                                   | Take-away that informs the redesign                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Human Interface Guidelines — Tab bars**          | iOS recommends ≤5 destinations in a bottom tab bar, with overflow living under "More". Tap targets ≥44 × 44 pt. ([apple.com/design/human-interface-guidelines/tab-bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars))                                                                                                                    |
| **Apple HIG — Materials & Vibrancy ("Liquid Glass")**    | iOS 26 (2025) introduced "Liquid Glass" — translucent UI surfaces backed by `backdrop-filter` blur, vibrancy-aware text, and motion-reactive highlights. The HIG explicitly recommends `prefers-reduced-transparency` fallbacks. ([apple.com/design/human-interface-guidelines/materials](https://developer.apple.com/design/human-interface-guidelines/materials)) |
| **Google Material 3 — Navigation Bar**                   | Bottom nav must hold 3-5 destinations, ≥48 dp targets, with a "more" entry when surfaces exceed 5. Material 3 also describes "expressive" navigation rails for ≥600 dp. ([m3.material.io/components/navigation-bar](https://m3.material.io/components/navigation-bar))                                                                                              |
| **Google Material 3 — Responsive layout**                | Compact ≤599 dp uses bottom-nav; medium 600-839 dp uses a navigation rail; expanded ≥840 dp uses a permanent drawer. ([m3.material.io/foundations/layout/applying-layout/window-size-classes](https://m3.material.io/foundations/layout/applying-layout/window-size-classes))                                                                                       |
| **Microsoft Fluent 2 — Navigation patterns**             | Recommends 5-7 primary destinations with overflow into a "More" pane; the App Shell pattern keeps top-bar branding + side rail when wide. ([fluent2.microsoft.design/components/web/react/navigation](https://fluent2.microsoft.design/components/web/react/navigation))                                                                                            |
| **Microsoft Fluent 2 — Acrylic & Mica materials**        | Acrylic = translucent in-app surface, Mica = opaque background tint. Both require contrast checks against AA in low-transparency mode. ([learn.microsoft.com/windows/apps/design/style/acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic))                                                                                               |
| **WCAG 2.2 — Target Size (Minimum) 2.5.8**               | Pointer targets must be ≥24 × 24 CSS px (AA) or ≥44 × 44 (AAA). Bottom-nav buttons in this redesign target 56 × 56 px to meet AAA on touch. ([w3.org/TR/WCAG22/#target-size-minimum](https://www.w3.org/TR/WCAG22/#target-size-minimum))                                                                                                                            |
| **Chakra UI v3 — App Shell, Drawer, Tabs**               | Chakra v3 ships `Drawer`, `Menu`, `Tabs`, `Stack`, and `useBreakpointValue` primitives that map cleanly to the responsive plan. ([chakra-ui.com/docs/components](https://chakra-ui.com/docs/components))                                                                                                                                                            |
| **Shepherd.js / driver.js — element-anchored tutorials** | Both libraries dim the page with a full-viewport mask and cut a hole around a target element using SVG `mask-image` or `clip-path`. We adopt the same primitive without the dependency, since the existing custom tutorial overlay is one component.                                                                                                                |
| **react-i18next & FormatJS / react-intl**                | Both ecosystems agree that mixed-language fragments (English fallback rendered while UI is set to ru-RU) is a top accessibility regression and must be guarded by a parity test. The repo already has `js/tests/i18n.test.js`; we extend it with a "no English in non-en dictionaries" smoke check via the existing `docs-language` heuristic.                      |

The full vendor research log lives in
[`./external-research.md`](./external-research.md).

---

## 5. Component / library survey

| Need                                      | Reused / chosen                                                                                                                                                    | Rejected (why)                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App-shell primitives (Drawer, Tabs, Menu) | Custom React + CSS following the Chakra UI _patterns_ (responsive `useBreakpointValue`-style layout, large tap targets, semantic `nav`/`dialog` landmarks).        | A hard dep on `@chakra-ui/react@3` would add ~120 KB gzip to the SPA bundle (currently 320 KB) and conflicts with the repo's `Unlicense` dependency policy. We codify the _design tokens_ Chakra recommends instead. |
| Bottom navigation                         | New `BottomNav` component (5 primary surfaces + "More" sheet) with `safe-area-inset-bottom`.                                                                       | iOS-style native tabs require Capacitor plugins; we keep the SPA portable.                                                                                                                                           |
| Glass / acrylic surface                   | New `.glass` / `.glass-strong` CSS utility classes (`backdrop-filter: blur(28px) saturate(180%)`, fallback solid background under `prefers-reduced-transparency`). | `react-glassmorphism` libraries hard-code blur values and break dark/light token swap.                                                                                                                               |
| Element-anchored tutorial                 | New `<TutorialSpotlight />` component that draws an inset cutout via four absolutely-positioned dim panels and scrolls the target into view.                       | `shepherd.js` (MIT, ~30 KB) — adds a runtime that duplicates work the existing tutorial.js already does (preference store, step model). Keeping zero deps.                                                           |
| Connections overview & detail screens     | Refactor `settings-view.js` into `connections/` module: `ConnectionsList` (overview), `ConnectionDetail` (per-provider full screen). Reuses `providerCatalogue`.   | Building a new "settings hub" component per provider would duplicate the existing `apiCredentials.fields` schema. We extend the schema with `setupSteps[]` instead.                                                  |
| Translation parity                        | Extend `js/tests/i18n.test.js` with "no English literal leaks into non-EN dictionaries" guard; reroute the empty-inbox copy through `t('guide.<section>.empty')`.  | `react-i18next` would add a runtime; the repo already has a typed `t()` and a parity test.                                                                                                                           |

---

## 6. Solution plan (high level)

The full breakdown is in
[`./solution-plan.md`](./solution-plan.md). At a glance the work
splits into six small commits, each with its own R-N requirement
and unit/e2e test:

1. **Mobile-first shell.** Replace the wide-`<nav>` with an
   adaptive App Shell: `<TopBar>` (brand + status + theme/language)
   on all sizes, `<BottomNav>` with 5 surfaces (Chat, Operator,
   Connections, Tutorial, More) on ≤640 px, side-rail on
   641-1023 px, and a permanent drawer on ≥1024 px.
2. **Glass surface tokens.** Introduce CSS custom properties
   (`--surface-glass`, `--surface-glass-strong`,
   `--surface-blur`) and a `prefers-reduced-transparency` fallback.
   Apply to top-bar, bottom-nav, drawer, modals, tutorial cutout.
3. **Connections module.** Carve a dedicated
   `js/src/web/connections/` folder. `ConnectionsList` shows every
   provider as a card with state badge (Connected / Not connected /
   Action required) and tap-target ≥56 px. `ConnectionDetail` is a
   full-screen page with the credentials form, archive import,
   probe, **and** a step-by-step "How to get this token" walkthrough
   driven by a new `provider.setupSteps[]` field on every entry of
   `providerCatalogue`.
4. **Element-anchored tutorial.** New `<TutorialSpotlight>` cuts an
   inset hole around the active step's target (a `data-tutorial-id`
   attribute on real DOM elements) and scrolls it into view. The
   first step now points the user at "Connections" rather than
   chat-style prose.
5. **Translation completeness.** Move every remaining English
   literal in `connection-guides.js`, `connection-guide.js`,
   `views.js`, and `settings-view.js` through `t()`. Extend
   `js/tests/i18n.test.js` to fail when a non-EN dictionary value is
   character-equal to its EN counterpart for keys flagged
   `localizable: true`.
6. **Requirement updates.** Add R-N1 … R-N12 to
   `docs/REQUIREMENTS.md`, mirror to ru/zh/hi, and link them into
   `docs/UI-DESIGN-AUDIT.md`.

---

## 7. Files in this case study

| File                                                                   | Description                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`README.md`](./README.md)                                             | This document.                                                       |
| [`requirements.md`](./requirements.md)                                 | Parsed requirement table (R-N1 … R-N12) with acceptance criteria.    |
| [`solution-plan.md`](./solution-plan.md)                               | Six-commit implementation plan with file-level diffs and tests.      |
| [`external-research.md`](./external-research.md)                       | Vendor/library research log (HIG, Material 3, Fluent, WCAG, Chakra). |
| [`components.md`](./components.md)                                     | Survey of existing components in the repo and external libraries.    |
| [`screenshots/desktop-current.png`](./screenshots/desktop-current.png) | Issue attachment 1 (desktop layout).                                 |
| [`screenshots/mobile-current.png`](./screenshots/mobile-current.png)   | Issue attachment 2 (mobile layout).                                  |

---

## 8. Test plan

1. `npm run lint` and `npm run format:check` clean.
2. `node --test js/tests/i18n.test.js` exercises the new
   "no English leaks into non-EN dictionaries" guard.
3. `node --test js/tests/connection-guides-templates.test.js`
   covers the new `setupSteps[]` schema parity per provider.
4. `node --test js/tests/tutorial.test.js` covers the new
   `data-tutorial-id` lookup helpers.
5. New `js/tests/web-shell.test.js` smoke-renders the App Shell at
   320 px, 768 px and 1280 px and asserts the nav structure
   (bottom-nav, side-rail, drawer respectively).
6. New `js/tests/connections-screens.test.js` smoke-renders the
   list and detail screens and asserts a "Connected" / "Not
   connected" state badge per provider.
7. The existing `js/tests/e2e-browser-spa.mjs` continues to pass
   with the refreshed UI (Playwright optional dep).
