---
'meta-sovereign': minor
---

R-Y76: GramJS now speaks Telegram's current API layer (225) instead of the 198 it ships, so polls (new constructor), checklists and newer media arrive as they are instead of "unsupported". The schema Telegram publishes is converted by `js/scripts/telegram-schema.mjs` and given to GramJS before it loads. Messages stored as unsupported are read again once in the background. Editing a message in a channel works (it used a method Telegram does not have). The pinned bar names unsupported messages, games and invoices instead of staying empty.
