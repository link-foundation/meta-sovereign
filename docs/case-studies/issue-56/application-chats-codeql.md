# Application chat inspection fixture escaping

Security run 43825987290 on `8250c313`, created at 2026-11-16 07:45:03 UTC,
failed its JavaScript CodeQL gate. Downloaded log lines 17908–17910 identify
`js/bad-code-sanitization` at
`experiments/issue-56/application-chats-mcp.mjs:127`. JSON fixture values were
interpolated directly into generated inspection code. The fixture now uses
the existing `mcpInspectionCode` helper to escape script terminators and Unicode
line separators while preserving the original data passed to navigation.
No finding is suppressed and the gate is unchanged.

`python -B experiments/issue-56/application-chats-codeql-before.py` reproduces
the new finite regression against exact parent source and restores the current
bytes in `finally`. All three helper/actual-generator tests then pass under
Node, including a bounded navigation stub that receives the hostile fixture
string unchanged and does not execute it. Formatting and configured ESLint
checks pass. The full CodeQL analysis remains assigned to hosted CI.

The [evidence archive](data/application-chats-codeql.tar.gz) and
[hash manifest](data/application-chats-codeql.tar.sha256.json) preserve the
failed run log, downloaded SARIF, source and focused before/after checks.
This addresses one CI cause; exact-head hosted verification and all 60
unchecked inventory rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
