---
'meta-sovereign': minor
---

Telegram now supports **user-account auth over MTProto**, the way konard/telegram-bot does it: on Telegram → Enter manually, "Log in with your Telegram account" takes your `api_id`/`api_hash`/phone, sends you a login code, accepts a 2FA password when you have one, and saves the resulting GramJS session string under `secret:telegram:*` — so both **bot tokens** and **user accounts** work. Discovered `.telegram_session` sessions are verified against the real account (`getMe`) when GramJS is installed. The sign-in runs on the local server (new `/api/auto-import/telegram/login/*` routes, same-app gated); GramJS (`telegram`) is an optional dependency, loaded lazily.

Email manual entry now also accepts **login and password** (IMAP/SMTP server, email address, password or app password), stored as `secret:email:host` / `secret:email:username` / `secret:email:password`, in addition to the OAuth token.
