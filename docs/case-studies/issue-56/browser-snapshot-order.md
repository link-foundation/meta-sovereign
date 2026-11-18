# Browser snapshots acknowledge durable, ordered saves

Issue 56 requires local data to survive offline use and later synchronization.
Published `ff43da4f` schedules browser snapshot saves in detached microtasks.
Each task clears its queued flag before awaiting the driver. A second mutation
can therefore start another save while the first is pending, and `flush` starts
a third independent save. If the first save finishes last, it replaces the
newer persisted state even though both the newer write and flush have returned.
Mutation promises also resolve before any driver commit, and failed saves
escape as unobserved background rejections. The old bulk loop admits one record
at a time, allowing subscriber edits to be overwritten by later bulk admission.

Three finite delayed-driver regressions fail against the exact published parent:
early acknowledgement, older state restored after flush, and partial bulk
admission during a subscriber edit. An independent Playwright MCP probe runs
the actual parent and final source modules with real IndexedDB transactions.
It gates only the first save. The parent admits three overlapping saves,
acknowledges before release and reopens `before`; the final store admits one
save while held, acknowledges only after completion, then reopens `after`.
The probe uses tiny private fixture records and an isolated loopback origin.
Its browser and fixture server close after verification.

The store now admits memory and subscription events immediately while returning
the ordered save promise to the caller. At most one driver save and one pending
coalesced batch exist. A later batch captures detached records when its turn
begins; a driver cannot change the retained owner records through its snapshot.
`flush` joins a pending batch or schedules the current state after issued saves.
Failure rejects the affected callers without rolling back visible memory, and
an explicit later flush or mutation can recover. No uncontrolled retry loop is
introduced. A bulk validates and captures all records before changing memory
or exposing any events, and shares one save. Empty bulks remain no-ops.

IndexedDB saves observe both request completion and transaction completion
together. A request error, commit abort, synchronous `put` error or object-store
error retains its cause without leaving an unobserved abort promise. A successful
request is not treated as a successful transaction.

Reproduction and focused verification:

```sh
python3 -B experiments/issue-56/browser-save-before.py
node --test --test-concurrency=1 js/tests/browser-store-save.test.js js/tests/browser-store.test.js js/tests/sync-receive-storage.test.js js/tests/sync-receive-isolation.test.js js/tests/sync-hub-relay.test.js js/tests/offline-client.test.js js/tests/e2e-offline-first.test.js
node js/scripts/build-web.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node js/tests/e2e-lino-sync.mjs
```

All 64 focused checks pass, including eleven new durability/failure cases,
actual existing localStorage/IndexedDB adapter contracts, offline handlers,
atomic receives, storage wrappers and hub ordering. The rebuilt app's existing
native WebKit scenario passes actual offline rediscovery, concurrent owner edits,
three peers, connected reload, fresh bidirectional writes, deletion and remaining
pair cleanup with zero page errors. An earlier native run used the parent bundle
because lint stopped its preceding rebuild; that baseline is preserved separately
and is not the final-bundle result. Scoped lint, formatting, secret scanning and
the existing minor release changeset are verified. Broad runtime/browser coverage
remains hosted CI; no full local suite or stress test runs.

For the independent IndexedDB reproduction, start
`node experiments/issue-56/browser-save-fixture.mjs`, open its printed isolated
URL with Playwright MCP, then evaluate the exported `probeSnapshot('before')`
and `probeSnapshot('after')` from `/probe.mjs`. The
[checksummed evidence](data/browser-snapshot-order.tar.gz) retains both results,
the exact source parent, final sources, focused output and bundle digest.

This orders saves made through one browser store instance. Separate live tabs
still need a shared writer/transactional conflict protocol; this change does not
provide one. Cross-device initial reconciliation, disconnected deletion history,
ordinary unversioned-edit convergence and all other unchecked original criteria
remain unfinished. Peer send notifications remain immediate local mutation
events; they do not acknowledge remote durable delivery.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged until every requested criterion is implemented and verified.
