# Keep independent WebRTC connections across browser reloads

The [rediscovery investigation](ci-lino-sync-rediscovery.md) uncovered a separate
product failure: reloading an already connected browser left the surviving peer
with its old data channel. Reading an old IndexedDB record could look like
convergence, but a subsequent deletion timed out. That evidence remains in its
original archive.

The actual published parent `3483c8b1` has one `RTCPeerConnection` per browser and
one broadcast signaling channel. A third peer's join cannot initiate another
connection while that channel is open. Reusing the connection after its remote
document closes also retains the old data channel. Replacing the single
connection on every join would disconnect an existing pair.

The regression restores the parent's bundle and both server adapters, runs the
new bounded mandatory scenario, and restores the working sources unconditionally.
It fails at `three peers retain distinct data channels`. The original two-peer
typed convergence, deletion and forced offline rediscovery assertions still pass
before this new failure.

```sh
python3 -B experiments/issue-56/lino-sync-mesh-before.py
node --test --test-concurrency=1 js/tests/webrtc-mesh.test.js js/tests/webrtc-signaling.test.js js/tests/webrtc-transport.test.js
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit CI_LINO_SYNC_DEBUG=1 node js/tests/e2e-lino-sync.mjs
```

The shared Node/Bun broker now assigns a fresh server-owned UUID to each socket.
It routes addressed offers, answers and ICE only to the named member of the same
room, overwrites client-supplied sender identities, and rejects client membership
announcements. Untargeted legacy signaling retains room broadcast with added
authoritative sender provenance. Departures announce that exact identity once.
Node also handles TCP end without a WebSocket close frame; the initial targeted
network test exposed that missing cleanup and its failed log is preserved.

Each browser owns a map of independent transports. Existing members initiate a
connection for a newcomer; its offer or early ICE creates the matching follower.
A departing identity disposes only its own transport and store subscriptions.
Reloaded sockets get new identities and fresh data channels. Candidates arriving
before a remote description wait in a finite 128-entry queue, cleared on close;
overflow reports an explicit error. Existing Lino protocols, schema gates,
secret filtering, origin checks and connection deadlines remain in force.
`metaSovereignDebug = true` enables content-free connection creation/removal and
peer-count traces; this diagnostic is off by default.

All 18 focused Node checks pass. The one native WebKit scenario verifies three
isolated stores, both original peers receiving a third peer's write, actual
connected-document replacement, fresh post-reload bidirectional writes, deletion,
secret exclusion and surviving-pair writes after departure. Fresh IDs prevent
cached records from falsely confirming recovery. The signaling server has none
of these application records. No full local suite or runtime/browser matrix was
run; other runtimes and engines remain hosted CI work.

An independent Playwright MCP session verifies three connected pairs through
native connections, typed Unicode/array values, reload, deletion, secret isolation
and departure with zero page errors. Its isolated server reports
`serverApplicationRecords: 0`; browser contexts and the server are closed. The
first MCP loader lacked VM dynamic-import support, and its initial same-fragment
navigation skipped document instrumentation. The corrected loader injects the
module's helper into its function body and navigates the owned page through
`about:blank`; these fixture attempts are retained. Disabled-provider Settings
requests produce unrelated HTTP 404s in this fixture, rather than page errors.

Hosted run `43266303454`, exact head `3483c8b1`, separately rejects the second
changeset at raw job-log lines 407–414. Translation notes are consolidated into
the existing minor-release changeset, and its validator passes with exactly one
file. The policy and release trigger are unchanged.

The [checksummed archive](data/webrtc-mesh.tar.gz) includes parent source,
reproduction/final logs, the preserved hosted changeset failure, independent MCP
results and source snapshots. Historical archives remain unchanged.

This fixes live connection membership and fresh-write recovery. It does not yet
reconcile records or deletions missed while a peer was offline, provide TURN or
automatic signaling reconnect, or complete cross-server migration and placement.
These and all unchecked issue criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.
