# Durable causal deletion safeguards

Issue 56 requires synchronization in every direction. On parent `a874e936`,
hard deletion forgets the record's clock. Reopen followed by a delayed old put
resurrects its payload; a delayed delete erases an explicitly recreated record.
Both finite production regressions fail against that exact parent.

Production causal stores now replace the live payload with minimal deletion
metadata: its ID, observed clock, reserved marker and any existing grow-only
child identities. A joined assignment may also retain its original winning
clock. The body, raw provider data and saved revision snapshots are removed from
the live record. Public get/query/scan hide these markers, including projected
reads and current-schema read-only openings. Storage size remains a physical
record count; it includes deletion metadata. Primitive library stores keep their
original behavior unless explicitly wrapped with the causal policy.

Deletion advances this opening's causal clock at atomic admission. A received
delete merges its validated original metadata at admission instead of deleting
blindly. Old packets lose to causally newer deletion or recreation. Concurrent
assignments use the existing deterministic register order; deletion is not an
unconditional winner. Secret and schema records remain private physical deletes.
No old deletion history is invented. A private bounded-scan capability exposes
the retained metadata for future reconciliation without exposing it in normal
application reads.

Message history retains the origin's separately replicated revision records
instead of generating new revisions from losing remote messages, including
bulk writes. A stale or malformed message deletion cannot purge the recreated
message's history. Accepted hard deletion erases known saved revision payloads
too. Chat indexes invalidate IDs without depending on erased chat fields;
feedback indexes recognize payload-free removals. Existing soft deletion,
recovery, immutable revisions and confirmed purge semantics remain covered.

Schema 13 reserves the marker, refuses a collision with pre-migration owner
data and requires compatible production peers. Read-only older stores preserve
owner fields untouched. Empty durable stores persist their current schema before
admitting new-format writes, matching empty browser store initialization; a
subsequent reopen therefore recognizes its own metadata. Read-only openings
never migrate or write. This corrects a real draft reopen failure caught by the
focused checks.

Reproduce and verify with one worker and a bounded Node heap:

```sh
python3 -B experiments/issue-56/deletions-before.py
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/causal-deletions.test.js js/tests/deletions-production.test.js js/tests/migrations-sync-deletions.test.js js/tests/migrations-store.test.js js/tests/store-durability.test.js js/tests/sync-receive-storage.test.js
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/causal-deletions.test.js js/tests/deletions-production.test.js js/tests/migrations-sync-deletions.test.js js/tests/message-versions.test.js js/tests/message-versions-api.test.js js/tests/feedback.test.js js/tests/chat-paging.test.js js/tests/causal-storage.test.js
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/deletions-index.test.js js/tests/migrations-sync-deletions.test.js js/tests/causal-deletions.test.js js/tests/deletions-production.test.js js/tests/causal-writes.test.js js/tests/store-handoff.test.js js/tests/migrations-registry.test.js js/tests/offline-client.test.js
```

The independent Playwright MCP probe uses actual IndexedDB through an isolated
allowlisted loopback fixture. Parent and final both reopen an erased record;
only the final keeps it absent after a delayed packet, retains payload-free
metadata and preserves explicit recreation after a delayed deletion. The
browser and fixture are closed after the probe. Native WebKit exercises actual
three-peer WebRTC forwarding, deletion, connected reload and owner-write
isolation with the rebuilt production bundle. Its first run completes all those
assertions, then reproduces the existing hosted uncaught RTC send failure during
cleanup. This is retained as a failure, not counted as a browser pass; the next
transport lifecycle correction must pass this scenario before publication is
considered verified.

The checksummed evidence archive retains failures found during development,
parent failures, focused verification and browser results. Local groups overlap;
no full local test suite or runtime matrix is claimed. Exact published-head
hosted checks remain required.

This unit does not provide initial/reconnect reconciliation, multi-tab snapshot
coordination or Rust parity. Deletion metadata is retained without unsafe
garbage collection; clocks grow as writers observe records. Append-only log
history, backups, separately cached files and unobserved remote revisions are
not securely erased by replacing a live record. Existing compaction handles
superseded text log records. Every unfinished original requirement remains in
the [work plan](PLAN.md); [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
