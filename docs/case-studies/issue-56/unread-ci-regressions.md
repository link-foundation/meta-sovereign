# Unread review CI regressions

Checks run 43819156751 tests published commit `5427c11e`, created at
2026-11-16 06:47:05 UTC. Its ten failed jobs expose three causes. Downloaded
job logs, exact-parent reproduction, corrected checks and source are retained
in the [evidence archive](data/unread-ci.tar.gz) with a
[hash manifest](data/unread-ci.tar.sha256.json).

- Node Ubuntu job 133139631060, lines 7915–7933, and the equivalent nine-runtime
  matrix failures include `question-unread-answers-unavailable`. The new
  admission guard rejected `modelDraft: true` on an existing inspection-only
  request. Inspection now retains its previous behavior: accept the request
  while forcing model planning off. Only explicit answer mode can use the
  separate model opt-in. Finite and polling checks verify zero model calls.
- Bun macOS job 133139630989, lines 3840–3873, observes `review` before
  `prefilled`. The HTTP fixture owns a separate service from `env.browser`.
  Waiting on that foreign service reports recovery as paused before the owning
  HTTP service finishes. The test now polls status through the same negotiated
  text/binary HTTP transport that started the pass.
- Chromium shard 3, job 133139630265, lines 1213–1234, loses the expected entry
  after the synthetic owner reply. The reproduced underlying error is
  `Pending messages must be a complete bounded turn.` Model baseline planning
  was added before checking whether the latest message is outgoing. An outgoing
  boundary correctly has zero pending incoming messages. Skip answer planning
  for that boundary and record `no-reply`; retain existing traversal and
  restoration rules. The regression now supplies the actual empty incoming
  turn. Optional `MS_QUESTION_UNREAD_DEBUG=1` tracing exposes the error and pass
  ID; tracing defaults off.

Run `python -B experiments/issue-56/unread-ci-before.py` to reproduce both
production regressions against exact parent source; it restores draft bytes
in `finally`. Both cases fail against the parent. The three relevant test files
pass 31 checks under each of Node, Bun and Deno. One isolated native Chromium
probe passes held draft preparation, held-chat-only rechecking and release after
an owner reply, without sending ordinary chat text. The existing mandatory
browser group retains all these assertions.

All five desktop build jobs in run 43819156744 passed on `5427c11e`, including
the dual-architecture macOS packaging job. That does not establish all issue
criteria. Exact-head hosted verification and every unchecked inventory row
remain required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
