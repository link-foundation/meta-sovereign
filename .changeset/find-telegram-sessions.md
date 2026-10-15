---
'meta-sovereign': minor
---

Connections → Telegram → Enter manually: **Find my Telegram sessions** discovers the Telegram sign-ins you already have scattered across your repositories — both **bot tokens** (`123456:ABC…`) and **user sessions** (GramJS `StringSession`, e.g. `konard/telegram-bot`'s `.telegram_session`) — and lists them grouped by the account each belongs to, so the same account found in several projects shows as one. The local server walks folders you choose (read-only; `.env`/`.lenv` and session files, skipping `node_modules` and `.env.example`/template placeholders), confirms bot tokens with Telegram's `getMe`, groups user sessions by phone (and verifies them when a GramJS client is injected), and stores the chosen one under `secret:telegram:*`. Values stay on the computer: the browser only ever receives the kind, the path and a masked hint, never the token or session.
