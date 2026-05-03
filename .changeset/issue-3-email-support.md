---
'meta-sovereign': minor
---

R-N1..R-N10: Add email as a first-class source with `.eml`/mbox import,
browser-direct Gmail, Microsoft Graph, and JMAP receive/send support,
Node local-server IMAP/POP3/SMTP transport, local server email routes, CLI
commands, connection-guide copy, and the issue-#3 case study. The pure-Rust
server now mirrors the wire surface: `email` appears in `/sources` and
`/api/email/pull` + `/api/email/send` accept the same JSON envelopes for
archive ingest and send queueing (live HTTP fetches and raw IMAP/POP3/SMTP
remain JS-server features; the Rust send route returns
`needs-local-server` for raw protocols).
