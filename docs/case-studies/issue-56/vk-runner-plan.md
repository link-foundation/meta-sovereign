# VK26 shared runner audit and completion

Every unchecked original criterion remains required in PR57.

[Durable trigger admission](vk-trigger-state.md) covers duplicate updates,
per-peer receipts, failed-run due times and drained server shutdown. The broader
queue and public controls below remain required.

- [x] Read the pinned runner, trigger execution/state, outgoing queue and native
      read/typing/send schemas in full. Map persistent per-peer trigger state and
      live incoming history to existing causal records and owned long polling.
- [x] Fill actual queue gaps: ordered admission, message-specific completion,
      delayed read acknowledgement, repeated typing, text/sticker pacing and
      deterministic native send IDs. Preserve provider refusals, unknown outcomes,
      cancellation and shutdown ownership without automatic unknown replay.
- [x] Expose saved configuration and truthful queue/state inspection through
      foreground CLI, both default Lino forms and four-language browser controls.
      Reuse existing runner and collection controls rather than parallel policies.
- [x] Reproduce the actual parent with finite failing regressions. Verify focused
      Node/Deno tests, durable reopen, concurrent peers, source updates and owned
      shutdown; run one native browser and independent MCP scenario with retained
      before/after screenshots. Keep all fixture effects synthetic and bounded.
- [ ] Preserve pinned source/log/screenshot evidence, review unchanged gates and
      the production diff, commit/push only the prepared branch and inspect all
      exact-head hosted workflows. Audit VK23 outgoing-message mapping before
      accepting either row. PR57 stays draft/unmerged until the full issue passes.
- [ ] Load the newest native peer history before its first live trigger, including
      a peer absent from the separate periodic backfill. Preserve cursor/write
      ownership, historical-trigger suppression and native update/edit handling.

[Queue implementation and local evidence](vk-message-queue.md): shared FIFO,
opt-in read/typing/text/sticker delays, foreground CLI, both Lino forms and four
languages. Forty-eight Node/Deno checks, actual parent failure, one native
browser and independent MCP pass. Exact-head hosted verification and first-live
peer history remain required; no persisted work resumes itself.
