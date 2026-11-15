# Acknowledged VK acceptance statistics

VD11 remains required in PR57 alongside all other unchecked inventory rows.

- [x] Read the complete pinned desktop stats implementation and prose requirements.
      Preserve initial count, total/month/week counts, scoped Lino files and a
      top-of-window summary after the first acknowledged acceptance.
- [x] Retain immutable account-scoped acceptance receipts before later relationship
      actions replace a per-person ledger. Count only positive native acceptance
      receipts; keep unknown/refused/sent requests distinct and avoid replay.
- [x] Save the initial observed friend count once per account; expose shared
      canonical statistics through CLI, default Lino API and offline/browser reads.
- [x] Project acknowledged totals into private durable total/current-month/current-
      week Lino files without rewriting historical periods. Use UTC calendar months
      and Monday-start UTC weeks, including year boundaries; explain undated legacy
      receipts rather than inventing their acceptance dates.
- [x] Add a compact translated summary near the top of all app surfaces; retain
      the last acknowledged snapshot through read failures and cancel owned reads.
- [x] Verify finite parent/current regressions, focused tests, scoped file writes,
      both Lino transports, restart, failure and account isolation. Keep fixtures
      separate from the user's server and authenticated provider sessions.
- [x] Capture before/after screenshots with native WebKit and independent MCP;
      archive sources/logs/hashes and publish an atomic implementation commit.
- [ ] Review all exact-head hosted checks before accepting VD11; keep every other
      unmet issue criterion active and leave PR57 draft and unmerged.
