# UI Design Audit (languages: [en](UI-DESIGN-AUDIT.md) • [zh](UI-DESIGN-AUDIT.zh.md) • hi • [ru](UI-DESIGN-AUDIT.ru.md))

यह audit current SPA surfaces को Apple Human Interface Guidelines,
Google Material Design और Microsoft Fluent guidance से map करता है। यह
practical है: हर surface उस behavior से check होता है जिसे current app
tests और code review में preserve कर सकता है।

References:

- Apple Human Interface Guidelines: <https://developer.apple.com/design/human-interface-guidelines/>
- Google Material Design accessibility: <https://m1.material.io/usability/accessibility.html>
- Microsoft Fluent 2 accessibility: <https://fluent2.microsoft.design/accessibility>

## Global Shell

| Check                            | Status | Evidence                                                           |
| -------------------------------- | ------ | ------------------------------------------------------------------ |
| Semantic landmarks               | Done   | `src/web/index.html` और `src/web/dom.js` header/nav/main use करते। |
| Keyboard-first main access       | Done   | Skip link पहला focusable element है और `stepSkipLink` cover करता।  |
| Visible focus                    | Done   | `src/web/app.css` focus-visible outlines define करता है।           |
| Light/dark/system appearance     | Done   | Theme toggle persist होता है और `stepThemeToggle` cover करता है।   |
| Serious a11y violations fail e2e | Done   | `stepAxeAudit` axe-core WCAG 2.0 A/AA checks चलाता है।             |

## Chat

| Check                        | Status | Evidence                                                          |
| ---------------------------- | ------ | ----------------------------------------------------------------- |
| Messages source से grouped   | Done   | Chat view normalized `msg:*` links render करता है।                |
| Repeated replies efficient   | Done   | Autocomplete previous outgoing messages और fallbacks use करता है। |
| Empty/offline states unblock | Done   | Offline client server round trip से पहले local write करता है।     |

## Operator

| Check                              | Status | Evidence                                                           |
| ---------------------------------- | ------ | ------------------------------------------------------------------ |
| Primary actions keyboard reachable | Done   | DONE/NEXT और submit shortcuts implemented हैं।                     |
| Work queue focused                 | Done   | Operator card stream एक actionable context दिखाता है।              |
| Semi-auto reviewable               | Done   | `automationHandler` immediately send नहीं करता; `plan:*` लिखता है। |

## Contacts, CRM, Automation, Settings

Contact detail messages, networks, chats और facts aggregate करता है।
Audience/outreach UI queueing से पहले envelopes preview करता है। Graph
steps stable nodes/edges के रूप में persist होते हैं। Backup, sync और
server discovery real e2e में covered हैं। `secret:*` links encrypted
रहते हैं और peer sync से filtered हैं।

## UI Stack Status

Current React SPA design behavior audit preserve करता है। R-G1 React
shell, React view components और real-browser e2e से closed है।
