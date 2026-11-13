# Ordinary writes and causal admission

Issue 56 requires synchronization in every direction, including ordinary edits
made before any connection exists. Published `96a54d99` has convergent merge
primitives, but production writes do not advance their clocks. A first body
`z` followed by an ordinary edit `a` can therefore roll back to `z` when the
older packet arrives. Reopening a store also supplies no causal writer identity.
Two finite production regressions reproduce this on that exact parent, through
the actual durable root and the actual server with an injected memory store.

`withCausalWrites` now assigns each ordinary put/update an increment of the
clock observed at storage admission. It joins the admitted previous record and
the provided input, then advances this opening's actor. Each writable opening
has a fresh random actor, so reopening, copying a backup or opening another tab
does not reuse an actor counter. This preserves causality across reopen; vector
dimensions are retained rather than unsafely pruned. Concurrent browser tabs
still need coordinated snapshot ownership and reconciliation.

The policy is installed below message history in production durable roots and
server storage, and after migrations in browser storage. Library primitive
stores remain explicit opt-in. Replicated mutations preserve received clocks;
secret records and the private schema marker do not receive sync clocks. A
local assignment drops a valid older winner stamp, while invalid reserved owner
fields are refused. Public offline and history writes return the actual admitted
records, including their clocks. Immutable version content remains protected;
its synchronization metadata and existing asset progress may evolve.

Bulk clock preparation uses an internal atomic-admission capability on memory,
browser, text, binary, dual and managed stores. Every transform finishes before
the first event or append. Duplicate IDs observe the preceding entry in the
same batch. Reentrant subscriber edits therefore advance beyond all admitted
batch entries. A rejected later clock leaves no partial memory/event/file write.
Unsupported third-party stores explicitly refuse this capability instead of
emulating an interleavable batch. Install the policy below other write decorators.
Existing text append ordering, browser save acknowledgements and writer handoff
remain intact.

Schema 12 requires compatible production peers: an older writer could otherwise
make unclocked edits that lose against clocked records. The migration leaves
historical records and retained assignment stamps unchanged. Newer schema
refusal and read-only/warm writer guards remain in place.

Focused verification uses heap limits and one local test worker:

```sh
python3 -B experiments/issue-56/causal-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/causal-writes.test.js js/tests/causal-production.test.js js/tests/causal-storage.test.js js/tests/sync-receive-storage.test.js js/tests/message-versions.test.js js/tests/message-versions-api.test.js js/tests/browser-store-save.test.js js/tests/lino-mutation-order.test.js
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/causal-writes.test.js js/tests/migrations-causal-writes.test.js js/tests/migrations-registry.test.js js/tests/migrations-core.test.js js/tests/migrations-store.test.js js/tests/migrations-surface.test.js js/tests/store-handoff.test.js js/tests/lino-http.test.js js/tests/offline-client.test.js
node js/scripts/build-web.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit NODE_OPTIONS=--max-old-space-size=384 node js/tests/e2e-lino-sync.mjs
```

The two initial focused groups pass 63 and 75 checks (with overlapping causal
cases); seven final durable/history checks also pass after adding rejected-batch
reopen coverage. The first draft's loopback test used the wrong fixture shape;
its failed log is retained, and the corrected case explicitly exchanges the
offline assignment before checking a fresh three-peer live edit. It makes no
automatic catch-up claim. Three test-only curly-brace lint errors were corrected;
their initial output is preserved too.

The rebuilt native WebKit scenario verifies a lower-ranked ordinary body edit
reaches the other browser over the actual WebRTC channel. Existing offline
rediscovery, receive isolation, three-peer connected reload, deletion, remaining
pair and zero-page-error checks pass. Independent Playwright MCP uses actual
IndexedDB with unique fixture databases: the parent selects delayed `z` and
post-reopen `a`, while the draft keeps `a` and then `0`. Reopen preserves the old
actor's counter and adds a distinct new actor. Start
`node experiments/issue-56/causal-fixture.mjs`, open its isolated URL and evaluate
the `/probe.mjs` export `run('before')` and `run('after')`. Both owned fixtures and
the MCP browser are closed afterward. This is a storage/protocol change with no
visual UI change; no screenshot is required to observe the returned records.

The [checksummed archive](data/causal-writes.tar.gz) preserves parent/final source,
finite scripts, raw failures and passing checks, MCP outputs and the rebuilt
bundle digest. The minor release changeset is retained. Complete hosted checks
pass on prior `fc7c095c`; exact new-head CI must still pass after publication.

Initial/disconnected reconciliation, durable hard-delete history, multitab writer
coordination, native parity and all other unchecked original criteria remain
unfinished. This unit does not complete cross-device synchronization.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged until the complete requested scope is implemented and verified.
