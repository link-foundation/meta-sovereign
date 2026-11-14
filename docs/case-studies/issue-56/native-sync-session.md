# Native schema-gated replica admission

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Issue 56 requires bidirectional durable replication; native persisted HTTP
writes alone did not implement it. The published `9db8d8d9` CLI upgraded `/ws`
and queued decoded values for the low-level fixture API, but never ran schema
negotiation, applied those values to state or acknowledged reconciliation.

The CLI now enables a native application session. Existing programmatic
transport fixtures retain their explicitly drained/broadcast API; applications
opt in with `ServerOptions.apply_sync`. `/rtc` remains a separate signaling
transport. The new session uses the existing JavaScript schema-13 protocol,
fresh opaque connection IDs, directed requests and one outgoing record awaiting
its exact acknowledgement. Incoming records use the same checked rich merge
and checkpoint barrier as HTTP admission; failure returns no ACK. Public scans
include payload-free causal deletion records and exclude private/schema IDs.
One connection cannot change its negotiated remote or start parallel scans.
Incomplete negotiation/reconciliation has a 30-second idle deadline; completed
live sessions stay open. Ping frames do not extend an incomplete session.

One finite scan test exposed a draft error: after scanning `a`, inserting `aa`
could consume the opening record count and displace existing `b`. The failing
6-pass/1-fail log is retained. A shared stable public insertion ordinal now
defines the opening boundary. It is rebuilt on reopening, adds no replicated
metadata and requires no per-session record inventory. Each step clones one
eligible record; new keys are covered by the live feed. The scan test now
requires the original deletion `b` before the finish packet despite that
middle-key insertion.

Admitted owner and changed remote records enter bounded live subscriptions in
state admission order, after persistence. Unchanged echoes do not fan out
again. Each of at most 16 live feeds retains at most 64 events and 4 MiB of
encoded content; overflow or failed writing closes that socket and preserves
persisted data for reconnect. Closed feeds release their slots. The framing
loop stops on an application refusal, including any subsequent buffered frames.
`MS_SYNC_DEBUG=1` reports only refusal kinds and overflow status by default-off
diagnostics. Live packets retain the existing protocol's lack of individual
durability ACKs; only reconciliation claims acknowledged durable admission.

Seven std-only checks use actual state, rich admission, session and feed
modules. They cover schema/hello/private/deletion guards, failed checkpoint
ACK refusal, retries and duplicates, out-of-order controls, one-record scan
backpressure, changing sessions, the insertion race, live owner/delete/remote
ordering, failed-write silence, finite queue/subscriber limits and reuse.
Scoped Clippy rejects warnings. Existing storage, owner-route and rich-record
checks cover compatibility. No official codec is replaced by a mock.
The final focused compiler peaks at 215,024 KiB child RSS and scoped Clippy at
246,008 KiB. The unchanged 6.5% duplication gate passes at 6.47% (42,285 of
653,664 lines), without new exclusions or threshold changes.

Hosted verification uses the real CLI and production JavaScript stores, peers,
WebSocket framing and text/binary codecs. Run `native-sync-interop.mjs` with the
built executable: preconnection records exchange in both directions, two
simultaneous peers receive owner/remote edits and deletions, and offline edits
and deletion clocks survive reconnection and another native process restart.
`native-sync-refusal.mjs` verifies schema/private refusals and physically blocks
the next checkpoint filename before a reconciliation record: no ACK, no memory
admission, no pointer change and no record after reopening. The original CLI
runs the unchanged positive probe via `native-durable-before.py --sync`; its
missing reconciliation must fail within the finite handshake deadline.

The [archive](data/native-sync-session.tar.gz) and
[manifest](data/native-sync-session.tar.sha256.json) preserve the draft scan
failure, focused logs and source snapshots. Full native codec/network builds
remain hosted because a prior local codec build exceeded this container's
memory limit.

Hosted Rust job [132158855257](https://github.com/link-foundation/meta-sovereign/actions/runs/43503860150/job/132158855257)
passes on exact commit `1e90229508cfe71ca8c47a5e15924acf2681b5dd`.
The complete retained job log records the unchanged parent handshake failure
at lines 971–992, real HTTP/signaling compatibility at 993, acknowledged
checkpoint restart at 1001, actual native/JavaScript reconciliation and live
text/binary fanout at 1009, and failed-checkpoint/no-ACK refusal at 1017.
Workspace tests, strict Clippy and the isolated Cargo artifact regression also
pass. Warnings-denied API documentation job
[132158855409](https://github.com/link-foundation/meta-sovereign/actions/runs/43503860150/job/132158855409)
passes for the same commit. The separate [hosted archive](data/native-sync-hosted.tar.gz)
and [manifest](data/native-sync-hosted.tar.sha256.json) retain both complete
logs and run metadata; the earlier draft archive deliberately retains its
then-pending verification flags. Other workflow jobs and the broader issue
criteria require their own evidence.
This unit does not establish automatic merging between editable browser tabs,
every native provider route or completion of the remaining issue inventory.
