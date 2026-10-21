---
'meta-sovereign': patch
---

R-Y75: no manual sync in the UI, as in Telegram's own apps. "Sync now" is gone from the chat list's footer and the empty Chat, and "Refresh" from Backups. The account syncs and retries by itself; the footer says "Connecting…" while the connection is down, "Updating…" during a sync, and why a sync failed. Requests made while Telegram reconnects wait for it instead of failing, and the Backups list reloads itself.
