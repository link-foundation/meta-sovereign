# VK24 history export and cache work plan

All original unchecked requirements remain active in PR57.

- [x] Read all seven pinned history/conversation/friend cache scripts, including
      message loading and Markdown conversion. Preserve the complete Git blobs.
- [x] Add explicit account-scoped read/refresh controls for history, conversation,
      friends, individual profiles and friend counts. Retain successful empty/zero
      results, timestamps, truthful expiry and bounded resumable coverage; refuse
      malformed pages, changed accounts/history and failed durable writes.
- [x] Export cached history oldest first through the existing bounded linked
      Markdown/structured JSON writer, retaining original messages and reply evidence.
      Use a newly created folder outside the store and refuse owner-file overwrite.
- [x] Share foreground CLI, text/binary Lino, offline cache inspection and localized
      Connections controls. Only explicit refresh reads the provider; no send/delete
      operation belongs to this feature. Keep owned requests drained at shutdown.
- [x] Reproduce actual-parent absence, add focused regressions and mandatory native
      browser coverage, inspect independently with Playwright MCP and save before/after
      screenshots. Run scoped quality checks with unchanged gates.
- [ ] Preserve checked evidence, publish atomically and inspect exact-head hosted
      workflows before accepting VK24. Keep PR57 draft and unmerged until every
      original issue criterion is implemented and verified.
