---
'meta-sovereign': minor
---

Telegram session finder: list only live sign-ins, deduplicated by account. The same bot token or user session found across many repositories now collapses to one connectable entry (every location is still shown), each credential is checked against Telegram so revoked ones are dropped, user sessions resolve to their phone number so they group by account, and entries are typed — bot token, login by session, or login by phone & password (which starts the sign-in inline).
