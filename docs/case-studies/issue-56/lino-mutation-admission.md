# Preserve text log mutation order

Published `e8ff3c84` changes memory and emits subscriptions before staging the
corresponding append. If a subscriber calls `put`, `putMany` or `delete`, its
append can precede the original `put`, `putMany` or `update`. Memory contains the newer
value, but reopening restores the older value or resurrects a deleted record.
Nine tiny regressions reproduce these orderings. A two-record bulk case also
shows a subscriber interrupting the batch's memory admission; admitting the whole
batch before emitting its events keeps memory and append order consistent.
An immediate `flush` also returns
before already called writes are staged. Three more cases show mutable event
records changing the encoded ID/body, and one verifies caller input capture
after a rejected admission. All fifteen fail on the exact published sources.

Text mutations now reserve their append position before calling the in-memory
store, so synchronous subscriptions cannot overtake them. The memory mutation
remains immediate. Encoding captures the record before subscribers or callers
can change it; an atomic update captures its validated result inside the
synchronous transform. Each ordered stage returns a boxed disk promise, allowing
later stages to join group commit before that disk write completes. Failed
admissions reject their own caller and do not block later work. `flush` and manual
compaction wait for all already reserved stages before entering the file queue.
Transient replication options still reach the original memory event only.

Reproduce and verify with bounded commands:

```sh
python3 -B experiments/issue-56/lino-admission-before.py
node --test --test-concurrency=1 js/tests/lino-mutation-order.test.js js/tests/store-durability.test.js js/tests/store-handoff.test.js js/tests/sync-receive-storage.test.js js/tests/storage.test.js js/tests/sync.test.js
node --test --test-concurrency=1 --test-name-pattern '^(a full disk|a write cut|the queue is bounded|a compaction without|the dual store exposes|a put appends|a later record|superseded lines|a mostly superseded|one large record|a line torn|a legacy indented)' js/tests/disk-full.test.js js/tests/store-append.test.js
```

The first focused group passes 52 checks, including the fifteen new regressions,
disk group commit, private durable files, handoff/read-only guards, atomic peer
receives, transient provenance, immutable history and durable reopen. The second
passes thirteen selected append/compaction/failure checks using small temporary
records and injected full/partial disk failures; no real disk is filled. It also
checks bounded refusal, queued recovery and degraded dual-store health.
The rebuilt browser bundle is unchanged. One native WebKit sync scenario also passes:
owner receive isolation, offline rediscovery, three-peer convergence, connected
reload, fresh bidirectional writes, deletion and surviving-peer writes all pass
with no page errors. This confirms continued peer behavior without claiming that
the browser's separate snapshot store uses the changed text-store admission path.

The [checksummed archive](data/lino-mutation-admission.tar.gz) preserves parent
and final source snapshots, exact failures, verification and CI observations.
No full local suite, stress test or runtime/browser matrix was run. The parent
hosted run `43445572311`, created `2026-11-13T14:44:15Z` for `e8ff3c84`, is still
running at evidence capture; its successful jobs do not verify this new change.
Exact new-head CI remains required. This fixes text persistence and does not
provide missing offline record/deletion reconciliation or complete the other
unchecked requirements. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft and unmerged.
