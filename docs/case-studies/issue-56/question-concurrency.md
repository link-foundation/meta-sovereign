# Preserve answer edits during archive learning

Work for [issue 56](https://github.com/link-foundation/meta-sovereign/issues/56)
in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57), covering
the shared concurrent-edit mechanism in QA11/QA26 and R-AA1.

## Reproduction and cause

Seven deterministic regressions fail against `4e6954ff`: change the reuse
policy, delete a learned rule or add a canonical correction while an archive
read is held; then release the read. Learning previously returned or applied
stale proposals. Holding the actual learned write while an owner saved or
deleted the same rule also lets that older write overwrite the owner's change.
A canonical save can similarly validate against an older policy while an
earlier policy write remains pending. Query-only stores expose the same stale
knowledge problem without subscription events.

The archive guard watched only message records. Rule/policy reads were not a
consistent snapshot, merges reread individual records later, and independent
writers could interleave between validation and storage. A separate failing
CLI regression demonstrates that two concurrent `--reject` additions each read
the old phrase list and lose one addition.

## Correction

Learning now captures one normalized policy/rule snapshot, merges only that
snapshot and checks it again before returning a preview or applying proposals.
Subscriptions detect rule/policy edits and deletions as well as changed
messages; a value comparison also protects stores without subscription events.
An observed change returns a clear retry error before any learned write.

The shared save/delete/policy paths and the final learning apply phase use one
writer queue per store instance. Archive reading stays outside that queue, so
an owner can edit during the scan and invalidate it. Once the apply phase owns
the queue, a subsequent owner edit waits and then wins; an earlier pending
policy write completes before a canonical save validates. CLI policy additions
read and update the current phrase list within that same queue. A failed write
releases its queue entry, and failed learning removes its subscription.

Knowledge snapshots have an explicit 8 MiB serialized UTF-16 rule estimate,
alongside the existing rule, variant, proposal and archive-index limits.
Exceeding it fails before applying instead of building an unbounded combined
snapshot. This is a logical writer boundary for one shared store, not a new
transaction or distributed compare-and-swap API: raw storage writes during
the final asynchronous write loop and partial storage I/O failure retain the
underlying store's guarantees. Device-level replication remains a separate
unfinished requirement.

Default-off `META_SOVEREIGN_QUESTION_DEBUG=1` diagnostics distinguish archive,
knowledge-event and knowledge-snapshot invalidation without logging answer
text, policy phrases or message bodies.

## Verification

Eight failing-before cases are preserved: seven core races and the simultaneous
CLI additions. Thirty-eight selected Node checks pass serially with a 384 MiB
heap. They include actual text/binary Lino requests against an isolated server,
an offline-control scan invalidated by a concurrent CLI policy edit, query-only
fallback, failed-write recovery, subscription cleanup, the finite knowledge
capacity case and existing archive/count/approval/correction behavior.
All nine core cases also pass in Deno with the same 384 MiB heap bound.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/question-concurrency.test.js js/tests/question-concurrency-controls.test.js js/tests/question-archive.test.js js/tests/question-controls.test.js js/tests/question-policy.test.js js/tests/question-corrections.test.js
deno test --allow-all --v8-flags=--max-old-space-size=384 js/tests/question-concurrency.test.js
npm run build:web
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/usr/bin/google-chrome E2E_ARTIFACT_DIR=ci-logs node js/tests/e2e-questions-browser.mjs
```

The production Chromium flow pauses an actual server archive read, changes the
policy, verifies the visible retry error and unchanged saved rules, then applies
a fresh scan successfully. Its read hook is installed before server startup so
the server's wrapped store uses it. Existing question, correction, learning,
salary, mobile layout and error-recovery checks also pass in that focused flow.
No UI presentation is changed. Browser and fixture server close on completion.

Focused strict lint, formatting, secret scanning and whitespace checks pass.
[Archived logs](data/question-concurrency.tar.gz) and the
[verified manifest](data/question-concurrency.tar.sha256.json) retain before/
after evidence, exact-head CI snapshots and source hashes. Full runtime and
browser matrices remain in CI. Live provider imports, general fact extraction,
all other unchecked PLAN.md requirements and exact new-head CI remain required;
PR 57 stays draft and unmerged.

The preceding head's link check (`42797776575`, created 2026-11-10 at
10:16:45 UTC for `4e6954ff`) reports 58 GitHub HTTP 504 entries, including
pinned reference files, at log lines 482–550. Its full log is preserved and
the failed job was retried; this is not recorded as a passing check.
