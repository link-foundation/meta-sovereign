# UI Design Audit (languages: [en](UI-DESIGN-AUDIT.md) • [zh](UI-DESIGN-AUDIT.zh.md) • [hi](UI-DESIGN-AUDIT.hi.md) • ru)

Этот audit сопоставляет текущие SPA surfaces с Apple Human Interface
Guidelines, Google Material Design и Microsoft Fluent guidance. Он
практичный: каждая surface проверяется по behavior, который current app
может сохранять в tests и code review.

References:

- Apple Human Interface Guidelines: <https://developer.apple.com/design/human-interface-guidelines/>
- Google Material Design accessibility: <https://m1.material.io/usability/accessibility.html>
- Microsoft Fluent 2 accessibility: <https://fluent2.microsoft.design/accessibility>

## Global Shell

| Check                            | Status | Evidence                                                            |
| -------------------------------- | ------ | ------------------------------------------------------------------- |
| Semantic landmarks               | Done   | `src/web/index.html` и `src/web/dom.js` используют header/nav/main. |
| Keyboard-first main access       | Done   | Skip link - первый focusable element, covered by `stepSkipLink`.    |
| Visible focus                    | Done   | `src/web/app.css` задает focus-visible outlines.                    |
| Light/dark/system appearance     | Done   | Theme toggle persists и covered by `stepThemeToggle`.               |
| Serious a11y violations fail e2e | Done   | `stepAxeAudit` запускает axe-core WCAG 2.0 A/AA checks.             |

## Chat

| Check                        | Status | Evidence                                                    |
| ---------------------------- | ------ | ----------------------------------------------------------- |
| Messages grouped by source   | Done   | Chat view renders normalized `msg:*` links.                 |
| Repeated replies efficient   | Done   | Autocomplete uses previous outgoing messages and fallbacks. |
| Empty/offline states unblock | Done   | Offline client writes locally before server round trip.     |

## Operator

| Check                              | Status | Evidence                                                  |
| ---------------------------------- | ------ | --------------------------------------------------------- |
| Primary actions keyboard reachable | Done   | DONE/NEXT и submit shortcuts implemented.                 |
| Work queue focused                 | Done   | Operator card stream показывает один actionable context.  |
| Semi-auto suggestions reviewable   | Done   | `automationHandler` пишет `plan:*` вместо immediate send. |

## Contacts, CRM, Automation, Settings

Contact detail aggregates messages, networks, chats и facts.
Audience/outreach UI preview envelopes перед queueing. Graph steps
persist as stable nodes/edges. Backup, sync и server discovery covered
by real e2e. `secret:*` links encrypted at rest и filtered from peer
sync.

## UI Stack Status

Current React SPA preserves design behavior audit. R-G1 closed by React
shell, React view components и real-browser e2e.
