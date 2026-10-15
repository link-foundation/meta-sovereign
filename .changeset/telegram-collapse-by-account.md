---
'meta-sovereign': patch
---

Telegram finder: collapse each account to one entry per type. Several different sessions for the same account (verified by connecting over MTProto, or grouped by phone) now show as a single "Login by session" with every location listed, instead of one row per file. A credential is only dropped when Telegram actually rejects it; a network or timeout error keeps it, so a working session is never hidden by a transient failure.
