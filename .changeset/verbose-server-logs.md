---
'meta-sovereign': minor
---

`meta-sovereign serve` now writes verbose logs to `<store>/logs/meta-sovereign.log` by default — every request, event and error (with full stack traces), plus any uncaught exception or unhandled rejection — so the root cause of an issue is always on disk. Pass `--quiet-logs` to opt out. Route handlers that previously swallowed their errors now log them with a stack first.
