# Live forwarding through synchronization hubs

Issue 56 requires multiserver synchronization in every direction. Published
`f4a8fac1` persists a received operation and suppresses its store event for every
connection. A hub therefore never sends that operation to its other clients.
The existing two-peer tests cannot expose the missing third leg. Three finite
network fixtures reproduce it with and without a schema gate and in a cycle
with a downstream leaf. Three actual TCP/WebSocket fixtures also fail on the
exact published sources. Their failure is a missing record at the other client.

The hub now reserves an outgoing operation when that operation reaches primitive
storage admission. It releases forwarding after the storage call succeeds and
aborts it on failure. Later owner events wait behind a reserved operation; a
slow remote put cannot overtake and resurrect a later owner deletion. A remote
delete of a locally absent record reserves admission too, preserving a later
owner recreation. The primitive callback travels only in transient mutation
options and filters the original type/ID, leaving derived history operations
private to the receiving mutation. Memory and browser primitives provide it;
text, binary, dual, managed, encrypted and history wrappers forward the options.
Legacy third-party stores remain compatible but require the admission hook and
atomic update contract for the same ordering guarantees.

Every outgoing operation gets an opaque random identity and a bounded route in
the outer envelope, leaving stored links and public `onLocal` events unchanged.
Routing uses instance identity even when all public node names are `local`.
A peer ignores its own echoes and cached duplicate operations. Failed receives
release their identity for an explicit retry. The completed replay cache and
in-flight count are bounded at 4,096 entries; routes admit fewer than 32 previous
hops. A path still protects against a returning loop after replay-cache eviction.
The hub outbox is bounded at 4 MiB and 4,096 entries. Overflow, malformed routes,
hop limits and transport errors are explicit errors; a local write is never a
claim that remote delivery succeeded. Send failures cannot stop healthy
connections. Schema and private-record filters still precede acceptance, and
disconnecting removes both local and relayed sends for that transport.

Reproduction and focused verification:

```sh
python3 -B experiments/issue-56/hub-relay-before.py
node --test --test-concurrency=1 js/tests/sync-hub-relay.test.js js/tests/sync-hub-network.test.js js/tests/sync-relay-bounds.test.js js/tests/sync-receive-isolation.test.js js/tests/sync-receive-storage.test.js js/tests/sync.test.js js/tests/lino-mutation-order.test.js js/tests/sync-wire.test.js js/tests/lino-sync-ws.test.js js/tests/lino-sync-tcp.test.js
node --test --test-concurrency=1 --test-name-pattern '^(peers of|a peer that)' js/tests/migrations-core.test.js
```

The two final groups pass 73 and three checks respectively. They include real
TCP text/binary and mixed WebSocket clients, bounded hub cycles, duplicate and
failed receive handling, paused owner-write ordering in memory/browser stores,
transient provenance, durable reopen, history, encryption, text-log admission and
schema isolation. Native WebKit also passes the rebuilt peer bundle's existing
receive-race, offline rediscovery, three-peer mesh, connected reload, deletion and
remaining-pair scenario with no page errors. The later idle-peer optimization
avoids generating routing identities without a connected transport and passes
the focused relay checks again. Full runtime/browser matrices remain hosted CI;
no full local suite or stress test was run.

This is live forwarding, with the original operation payload preserved across
relays. It supplies no durable delivery acknowledgement, initial snapshot,
disconnected deletion journal or ordinary unversioned-edit convergence. A replay
cache is not an offline journal. Those requirements, other unchecked architecture
criteria and the reference feature inventory remain unfinished.

The parent run `43448780532`, created `2026-11-13T15:03:51Z` for `f4a8fac1`, has a
separate Windows Deno failure in job `131967810018`. Preserved raw log lines
2244–2260 show initial host readiness exceeding its 10-second budget, including
8,535 ms to copy 1,620 release files; lines 5088–5109 retain the final missing
control-pipe cause and failed-test summary. This evidence identifies slow cold
snapshot preparation, without attributing it to the new relay code or claiming
that its precise per-file latency distribution is known. The copy path and
exact new-head CI remain required work.

The [checksummed evidence](data/sync-hub-relay.tar.gz) preserves exact parent
sources/failures, final sources, verification and the raw hosted failure. Existing
immutable evidence bundles are retained. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft and unmerged while unfinished criteria are implemented and verified.
