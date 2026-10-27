---
'meta-sovereign': patch
---

Keep Chat and Operator stable during slow or failed local-server requests. Share the conversation directory and event stream, retain known account/data state, ignore stale availability failures, and validate Telegram unread counters before opening an Operator card. Exclude zero-unread manual marks, correct phantom forum unread counts using complete topic lists, and align notification count rules and labels.

Support message selection and context menus across the full row, including outside the centered column, with monochrome selected rows and checkmarks in the default dark theme. Automatically load earlier history on scroll without an idle saved-message notice or manual button. Deduplicate composer suggestions and discard stale results. Distinguish real Telegram Business bots from visibly active, paused or off app autopilots. Avoid full archive copies during routine health and typing polls; report Telegram backfill waits as waits. Cover the shared behaviors in Chromium, WebKit and focused regressions.

Retry temporary Windows sharing errors when moving an older store into the user application folder, preserving the writer lock and rollback behavior.
