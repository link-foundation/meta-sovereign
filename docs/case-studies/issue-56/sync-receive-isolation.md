# Preserve owner edits during live sync

Published `ea957225` mutes all local events while awaiting a received mutation.
An unrelated owner edit made in that interval is saved locally but never sent.
Concurrent receives can also read the same stale value and apply an older value
last, and an owner edit of the same ID can be overwritten by a stale merge.
Three finite regressions fail against that implementation. Replaying its exact
browser bundle with a controlled owner edit also fails at `owner edit survives a
remote receive`; real signaling, native RTC, browser persistence and API writes
remain in use. The hook controls one serialization interleaving, not human typing.

Incoming work now runs in arrival order. Built-in writable stores expose
`update(id, synchronousTransform, options)` so the merge reads at write admission.
The memory/browser/text/binary/dual stores, handoff, encryption and message-history
wrappers forward this operation. Invalid IDs, asynchronous transforms and
read-only writes are refused. Dual write-through operations, verification and
flush are ordered so subscriber-triggered writes cannot reverse the two copies.

Only the applied mutation's subscription event carries `replicatedMutation`, a
transient symbol. Derived message versions forward it; owner writes remain
observable. Stored links, snapshots and text/binary Lino frames never contain it.
Custom adapters can import the symbol and `mutationEvent` from the storage
namespace. Third-party adapters without `update` retain ordered legacy receive
behavior and its broad suppression; they must implement atomic update and event
metadata to gain isolation. Their concurrency guarantee is not upgraded silently.

A closed RTC channel exposed a second failure during validation: its synchronous
send exception rejected an otherwise persisted local write and interrupted
fan-out. Connected transports now report synchronous/asynchronous send and receive
failures through `onError`, including when a diagnostic consumer throws. Direct
`peer.receive` still rejects to its caller, and a failed receive cannot block later
work. Failed delivery is not recorded as success. Browser receive phase/type
traces use the existing default-off debug switch without record IDs or contents.

Run the bounded checks with:

```sh
python3 -B experiments/issue-56/sync-receive-before.py
node --test --test-concurrency=1 js/tests/sync-receive-isolation.test.js js/tests/sync-receive-storage.test.js js/tests/sync.test.js js/tests/storage.test.js js/tests/message-versions.test.js js/tests/store-handoff.test.js js/tests/sync-wire.test.js
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node js/tests/e2e-lino-sync.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node experiments/issue-56/lino-sync-existing-document.mjs
```

All 46 focused Node checks pass. They cover both owner-write races, overlapping
receives, rejected-write recovery, history creation/deletion, legacy adapters,
transient metadata in both Lino encodings, encrypted storage, read-only guards,
durable reopen and reentrant dual copies. Native WebKit verifies the edit race,
real offline rediscovery, three connected peers, connected reload, fresh writes,
deletion, surviving-peer writes and no page errors. An independent Playwright MCP
session also verifies the receive race through two native peers with no page
errors; its context and isolated server are closed. Disabled-provider Settings
requests produce unrelated HTTP 404s in that fixture.

Exact-head Checks `43273952312` at `789f317d` fails the general SPA scenario in
Chromium job `131379166066` (raw lines 898–904) and WebKit job `131379166190`
(lines 717–723). Both time out in `prepareSyncPeer`; the dedicated sync scenarios
pass. The preceding SPA step leaves the page at `#chat`, and navigating to
`#settings` changes only the fragment. Init scripts never run, so existing sockets
are not instrumented. The focused existing-document experiment reproduces that
20-second timeout. Preparing a fresh `about:blank` document before instrumentation
passes with the same deadline and persistent browser context. No production
navigation or capability is changed. The earlier exact-parent lint failure is a
Prettier inventory warning (job `131368719426`, raw lines 493–495), corrected in
`ed042879`; the raw log is preserved.

The [checksummed evidence archive](data/sync-receive-isolation.tar.gz) preserves
parent/final failures, native and MCP results, source snapshots and hosted logs.
No full local suite or runtime/browser matrix was run. Exact new-head hosted
completion remains required. This work does not provide initial snapshot
exchange, missed-delete catch-up, offline journal reconciliation, TURN, automatic
signaling reconnect or complete cross-device placement/migration. Every unchecked
original criterion remains open in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which stays draft and unmerged.
