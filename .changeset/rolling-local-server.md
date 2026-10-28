---
'meta-sovereign': minor
---

Keep the local listener and certificate active while a replacement server worker warms up. Repeated serve commands reuse or upgrade the running host, with exclusive writer handoff, rollback, crash recovery and automatic safe-read retries.
