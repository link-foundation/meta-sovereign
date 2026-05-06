# UI Design Audit (languages: en • [zh](UI-DESIGN-AUDIT.zh.md) • [hi](UI-DESIGN-AUDIT.hi.md) • [ru](UI-DESIGN-AUDIT.ru.md))

This audit maps the current SPA surfaces to the issue requirement that
the interface follow Apple Human Interface Guidelines, Google Material
Design, and Microsoft Fluent guidance. It is intentionally practical:
each surface is checked against concrete behavior that the current app
can preserve in tests and code review.

References:

- Apple Human Interface Guidelines: <https://developer.apple.com/design/human-interface-guidelines/>
- Google Material Design accessibility guidance: <https://m1.material.io/usability/accessibility.html>
- Microsoft Fluent 2 accessibility guidance: <https://fluent2.microsoft.design/accessibility>

## Global Shell

| Check                                               | Status | Evidence                                                                   |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Semantic landmarks for fast orientation.            | Done   | `src/web/index.html` and `src/web/dom.js` use header/nav/main structure.   |
| Keyboard-first access to main content.              | Done   | Skip link is the first focusable element and is covered by `stepSkipLink`. |
| Visible focus for every interactive control.        | Done   | `src/web/app.css` defines focus-visible outlines.                          |
| Light/dark/system appearance.                       | Done   | Theme toggle persists and is covered by `stepThemeToggle`.                 |
| Serious/critical accessibility violations fail e2e. | Done   | `stepAxeAudit` runs axe-core WCAG 2.0 A/AA checks on JS and Rust backends. |

## Chat

| Check                                                      | Status | Evidence                                                                        |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Messages are scannable and grouped by conversation source. | Done   | Chat view renders normalized `msg:*` links with source/chat metadata.           |
| Composer supports efficient repeated replies.              | Done   | Autocomplete uses previous outgoing messages with server and offline fallbacks. |
| Empty/offline states do not block local work.              | Done   | Offline client writes locally before any server round trip.                     |

## Operator

| Check                                                     | Status | Evidence                                                                                |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Primary actions are explicit and reachable by keyboard.   | Done   | DONE/NEXT and submit shortcuts are implemented in `operatorView`.                       |
| Work queue stays focused on one context at a time.        | Done   | Operator card stream shows one actionable context, matching the issue's operator model. |
| Automation suggestions stay reviewable in semi-auto mode. | Done   | `automationHandler` persists `plan:*` links instead of sending immediately.             |

## Contacts And CRM

| Check                                                           | Status | Evidence                                                           |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Contact detail aggregates messages, networks, chats, and facts. | Done   | `aggregateContacts()` feeds the contacts view and `/api/contacts`. |
| Audience selection is inspectable before action.                | Done   | Audience/outreach UI previews envelopes before queueing.           |
| Search parameters are visible and reversible.                   | Done   | Search/audience inputs keep user-entered query text in view.       |

## Automation Graph

| Check                                                            | Status | Evidence                                              |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| Graph steps are represented as stable nodes and edges.           | Done   | `graph:*` links persist nodes and edges in the store. |
| Auto and semi-auto modes are explicit data, not hidden UI state. | Done   | `runGraph()` and outreach plans carry `mode`.         |
| Execution output is auditable.                                   | Done   | Planned replies are written as `plan:*` links.        |

## Patterns And Replies

| Check                                                     | Status | Evidence                                                                              |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| Pattern generation keeps examples visible next to output. | Done   | Pattern view accepts examples and renders inferred regex before save.                 |
| Reply variations are editable as user-owned data.         | Done   | Reply groups persist as `reply:*` links.                                              |
| Regex/PEG behavior is covered outside the UI.             | Done   | `tests/patterns.test.js` covers inference, simplification, matching, and PEG compile. |

## Broadcast, Profile, Resume

| Check                                        | Status | Evidence                                                                            |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Network fanout is previewable and traceable. | Done   | Broadcast/outreach/profile/resume routes return queued per-network envelopes.       |
| External side effects are data-driven.       | Done   | `broadcast:*`, `profile:*`, `resume:*`, and `source-pull:*` links trigger handlers. |
| Secrets do not render or sync.               | Done   | `secret:*` links are encrypted at rest and filtered from peer sync.                 |

## Settings, Sync, And Backups

| Check                                                     | Status | Evidence                                                                               |
| --------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| Server discovery has automatic and manual paths.          | Done   | `discover.js` checks same-origin, saved override, localhost ports, and LAN candidates. |
| WebSocket and WebRTC sync are visible through real e2e.   | Done   | Two-browser WebRTC convergence is covered by `stepTwoBrowserWebRtcConvergence`.        |
| Backup and restore are available without leaving the app. | Done   | Backup view covers create/list/restore and e2e validates round trip.                   |

## UI Stack Status

The design behavior audit is preserved by the current React SPA. R-G1 is
closed by the React shell, React view components, and the browser bundle
covered by the real-browser e2e.

## Mobile-first overhaul (issue #25)

Issue [#25](https://github.com/link-foundation/meta-sovereign/issues/25)
revisits the global shell with a phone-first lens. The mapping below
links each row in this audit's "Global Shell" table to the new
mobile-first work tracked under `R-N1..R-N12` in
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U.

| Audit row                                | Issue #25 evidence                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semantic landmarks for fast orientation. | `js/src/web/shell/app-shell.js` keeps `<header>` / `<nav>` / `<main>` while swapping the navigation between bottom-nav, side-rail, and drawer at ≤640 / 641-1023 / ≥1024 px.                                                     |
| Visible focus for every control.         | `js/src/web/app.css` carries `:focus-visible` rules onto every shell control, including the new bottom-nav buttons.                                                                                                              |
| Tap targets are accessible.              | All shell controls are 44 × 44 px or larger; bottom-nav respects `safe-area-inset-bottom`.                                                                                                                                       |
| Glass surfaces with reduced-motion path. | `--surface-glass` (backdrop-filter blur 28px, saturate 180%) is applied to top-bar, bottom-nav, drawer, modal cards, and the tutorial card; falls back to a solid surface under `@media (prefers-reduced-transparency: reduce)`. |
| Tutorial guidance is anchored to UI.     | `js/src/web/tutorial.js` exports `<TutorialSpotlight>`; the default tutorial sequence starts by anchoring on the Connections nav entry (R-N9, R-N10).                                                                            |

The full atomic table, component survey, and screenshots are in
[`docs/case-studies/issue-25/`](./case-studies/issue-25/README.md).
