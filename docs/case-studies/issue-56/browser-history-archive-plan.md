# Browser history archive checkpoints

HH11 remains unchecked. Complete rapid DOM mutation capture, native delivery
states and authenticated provider parity remain required in PR57.

- [x] Trace native unread traversal and the review service to the normal archive.
      The browser retains full bounded windows in RAM; the service previously
      saved only reviews. Read the pinned HH chat/history requirements.
- [x] Await an acknowledged message archive checkpoint for every verified window
      before scrolling or returning. Reuse canonical message IDs, causal writes
      and message versions; preserve unknown chronology and bounded coverage.
- [x] Stop the unread pass on refused storage, attempt owned restoration, drain
      admitted saves on Stop and expose durable aggregate counts through the
      existing CLI/API service without replay on status recovery.
- [x] Preserve hidden link destinations through archive learning projection;
      exclude private or malformed destinations, summaries and whole answer
      continuations without approving proposals or changing transcripts.
- [x] Reproduce six failures against exact parent sources; run focused Node
      checks, one native Chromium fixture with physical store reopen and an
      independent Playwright MCP checkpoint/refusal inspection. Close fixtures.
- [ ] Preserve checked evidence, commit/push to the prepared branch and inspect
      every exact-head hosted workflow. Complete all remaining issue criteria.

[Root cause and verification](browser-history-archive.md) describe this unit's
limits. Existing shared controls start the pass with explicit consent; the
change adds no independent watcher, background archive scan or provider action.
