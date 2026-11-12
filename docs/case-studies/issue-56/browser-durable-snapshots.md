# Acknowledged browser mutations are durable

The browser store scheduled a save in a detached microtask, resolved `put` and
`delete` immediately, and emitted sync events before the driver finished. A later
mutation or explicit flush could start another save while the first was pending.
An earlier snapshot could therefore complete last; a failed save could leave
memory and subscribers claiming an unsaved mutation succeeded. This undermines
the durable local state needed for offline reconciliation.

Two finite controlled-driver regressions fail against actual parent `789f317d`:
the first observes premature acknowledgement; the second observes overlapping
saves. The new shared snapshot queue groups same-turn mutations into one save
and serializes later groups and flushes. Reads, counts and scans retain the last
committed map until persistence succeeds. A failed group rejects its callers,
emits no events, preserves committed state and allows the next explicit operation
to proceed. Batch inputs are validated and detached before admission. The
optional doublets-web driver also publishes its graph and statistics only after
its underlying snapshot save succeeds.

Ten focused Node checks pass, including delayed saves, event timing, reload
without an extra flush, batching, serialization, quota/disk failures, successful
recovery, invalid batch inputs, detached caller data, IndexedDB transaction
completion and unchanged doublets graph state on failure. Four focused Deno
durability checks pass. The mandatory native WebKit sync scenario passes with
real three-peer connections, connected reload, fresh writes, deletion, secret
isolation, no server application data and surviving-pair operation. Full local
suites and runtime/browser matrices were not run.

Replay the parent with
`python3 -B experiments/issue-56/browser-durability-before.py`. The small fixtures
use controlled promises, finite inputs and test-level deadlines, with no live
accounts or user server. The [checksummed archive](data/browser-durable-snapshots.tar.gz)
retains parent sources, final queue/store/test sources, complete reproductions
and verification logs. It also preserves the preceding hosted formatting failure
on `ea957225`; the independent `ed042879` formatting correction was integrated
before this unit.

This establishes a persistence prerequisite. Durable sync revisions, missed
record/deletion reconciliation, placement and every other unchecked original
criterion still require implementation and verification in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which remains
draft and unmerged.
