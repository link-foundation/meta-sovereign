# External research log — Issue #25

The maintainer asked us to "search online for additional facts and
data" before settling on a solution. This file is the verbatim
research log so future PRs can audit the trade-offs without
re-deriving them.

## 1. Apple Human Interface Guidelines

### 1.1 Tab bars (iOS / iPadOS)

- Recommended count: **≤ 5 destinations**. Apple explicitly says
  "Avoid offering too many tabs — five is generally the upper limit
  for iPhone."
  — [HIG / Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- Tap-target minimum: **44 × 44 pt** (HIG Layout / Touch Targets).
- Overflow behaviour: a "More" tab that opens a list of less-used
  destinations is the documented pattern, used by Apple's own Music,
  TV, and Health apps.
- iOS 18+ recommends a translucent tab-bar that adopts content tint
  ("Liquid Glass" in iOS 26). Implementation primitives are
  `UIBlurEffect(style: .systemThinMaterial)` and the Web equivalent
  `backdrop-filter: saturate(180%) blur(20px)`.

### 1.2 Materials & translucency ("Liquid Glass")

- Apple introduced "Liquid Glass" in iOS 26 (WWDC 2025). It is a
  translucent material that mixes the blurred backdrop with vibrancy
  layers and motion-reactive specular highlights.
  — [HIG / Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- Accessibility requirement: respect
  `prefers-reduced-transparency` and provide a solid fallback. We
  implement this with `@media (prefers-reduced-transparency: reduce)`
  and a fallback `--surface-fallback` token.
- Vibrancy text: text on glass surfaces uses semi-transparent blends
  (`mix-blend-mode: plus-lighter` on iOS) to remain legible. On the
  Web, we settle for a solid foreground colour and ensure WCAG AA
  contrast against the average backdrop pixel.

### 1.3 Onboarding (HIG / Onboarding & Tutorials)

- Apple's onboarding guidance is to "introduce features in context"
  using coachmarks and direct affordances rather than full-screen
  walkthroughs disconnected from the UI.
  — [HIG / Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)
- This validates the spotlight tutorial approach over the existing
  centred-modal approach.

## 2. Google Material 3

### 2.1 Navigation Bar (bottom nav)

- 3-5 destinations, 80 dp height, **48 × 48 dp minimum tap target**.
- Items are equally spaced; selected state uses the primary container
  fill. Optional badges for unseen counts.
  — [m3.material.io / Navigation bar](https://m3.material.io/components/navigation-bar)

### 2.2 Navigation Rail

- For **medium-width** windows (600-839 dp). Vertically stacked,
  collapsed labels by default, expands to 80 dp wide.
  — [m3.material.io / Navigation rail](https://m3.material.io/components/navigation-rail)

### 2.3 Navigation Drawer

- For **expanded-width** windows (≥840 dp). Always-visible drawer is
  preferred over a top-bar list once horizontal space allows.
  — [m3.material.io / Navigation drawer](https://m3.material.io/components/navigation-drawer)

### 2.4 Window-size classes

- Compact ≤599 dp, Medium 600-839 dp, Expanded 840-1199 dp, Large
  1200-1599 dp, Extra-Large ≥1600 dp.
- Our breakpoints (640 / 1024 px) are slightly larger than the Google
  thresholds because we include trackpad-driven viewports where pointer
  precision is high.
  — [m3.material.io / Window size classes](https://m3.material.io/foundations/layout/applying-layout/window-size-classes)

## 3. Microsoft Fluent 2

### 3.1 Navigation patterns

- Fluent's "App Shell" pattern: top branding, side nav, content area.
- Recommends **5-7 primary destinations** with overflow into a
  "More" pane.
  — [fluent2.microsoft.design / Navigation](https://fluent2.microsoft.design/components/web/react/navigation)

### 3.2 Acrylic & Mica

- Acrylic: in-app translucent surface, blur radius ~30 px,
  saturation boost. Used for command bars and floating dialogs.
- Mica: opaque background tint that picks up desktop wallpaper hue.
  Used for window chrome.
- Both materials require automatic AA-contrast fallback for users
  with reduced transparency settings.
  — [Microsoft Learn / Acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)

## 4. WCAG 2.2 — accessibility floor

- §2.5.8 Target Size (Minimum, AA): pointer targets ≥ 24 × 24 CSS px.
- §2.5.5 Target Size (Enhanced, AAA): ≥ 44 × 44 CSS px.
- §1.4.12 Text Spacing: layouts must absorb a 1.5× line-height /
  0.12em letter-spacing nudge without breakage.
- §2.4.7 Focus Visible: the active element must have a clear focus
  indicator. We use `:focus-visible` with a 2 px outline + 2 px
  offset.
  — [W3C / WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## 5. Element-anchored tutorial libraries

| Library     | Approach                                                                                | Why we did NOT take a hard dep                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Shepherd.js | Renders a full-page mask + tooltip pointer, supports keyboard nav.                       | MIT, ~30 KB gzip. The repo already has a custom `tutorial.js` with preference store and step model — adding Shepherd duplicates it. |
| Driver.js   | Pure DOM, ~5 KB gzip, very small.                                                       | Smaller than Shepherd but still adds a runtime + CSS conflict (its mask is a full overlay element with `clip-path`, which we DIY). |
| Reactour    | React-native API; adds @reach/popover under the hood.                                   | MIT, ~50 KB gzip including deps. Excessive for one component.                                                                     |
| Intro.js    | jQuery-flavoured, AGPL for commercial use.                                               | License conflict with this repo's Unlicense.                                                                                      |

The chosen approach: a **custom 4-panel mask** (top, right, bottom,
left rectangles around the target's bounding box) with a CSS variable
`--tutorial-mask` to control the dim colour. This keeps the bundle
flat and the tutorial deterministic — the test can assert
`querySelectorAll('.tutorial-mask').length === 4`.

## 6. Chakra UI — pattern adoption vs. runtime dep

- Chakra v3 ships:
  - `Drawer`, `Menu`, `Tabs`, `Stack`, `Box` primitives
  - `useBreakpointValue()` for responsive props
  - Design tokens (`colors`, `radii`, `space`, `shadows`)
  - `@emotion/react` + `@emotion/styled` peer deps
- Bundle cost (estimated from chakra-ui-v3 release notes):
  ~120 KB gzip including emotion. Our SPA's current bundle is
  ~320 KB gzip; a 38% increase is hard to justify when the same
  patterns can be rendered with vanilla React + CSS.
- License: MIT, compatible with the repo's Unlicense.
- Decision: **adopt patterns, not the runtime**. We codify Chakra's
  tokens (`--space-{1..16}`, `--radii-{none,sm,md,lg,xl,full}`,
  `--shadow-{sm,md,lg}`) in CSS custom properties and reuse Chakra's
  responsive prop _shape_ in our `useBreakpointValue` helper.

## 7. i18n parity guidance

- react-i18next docs warn that "missingKeyHandler returning the key as
  fallback" can leak source-language fragments into translated
  builds; the same warning applies to our pure-JS `t()`.
- FormatJS (react-intl) ships an `extract` step that fails CI when
  source-language strings appear in non-source dictionaries.
- We implement an equivalent guard inside the existing
  `js/tests/i18n.test.js`. The new assertion: for every key in
  `en.js`, if the value contains 3+ ASCII Latin letters (a heuristic
  for English content), the corresponding `ru.js` value MUST NOT be
  string-equal to it. The few legitimately language-neutral values
  (`appName`, brand names) live on an allow-list.

## 8. Apple Liquid Glass implementation references (web)

- CSS `backdrop-filter: blur()` + `saturate()` is supported in
  Safari 18, Chrome 76+, Firefox 103+.
- Fallback: opaque `background-color` set via the same token; we
  guard the `backdrop-filter` rule with
  `@supports (backdrop-filter: blur(1px))` _and_
  `@media (prefers-reduced-transparency: no-preference)`.
- Performance: each glass surface costs ~1.5 ms on mid-tier mobile
  GPUs (per Webkit blog 2024). We keep the count to ≤4 simultaneous
  glass layers (top-bar, bottom-nav, drawer, active dialog) and avoid
  glass on scrolling list rows.

## 9. Capacitor mobile considerations

- The existing `npm run build:mobile` pipeline builds a static SPA
  copied into the Capacitor `web/` folder.
- iOS WebKit honours `backdrop-filter` (Safari 18). Older devices
  (iOS 14) need the `prefers-reduced-transparency` fallback.
- Android System WebView (Chrome 76+) honours all the same primitives.

No Capacitor plugin changes are required for issue #25.
