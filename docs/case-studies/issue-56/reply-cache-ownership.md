# Own the complete browser reply model across tabs

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains
draft and unmerged. The editable-store convergence work did not coordinate
the separate derived reply-model root. Exact published parent `80e93aa5`
reproduces two failures. A held driver save overlaps an explicit second
flush (`maximum: 2`), and two native WebKit tabs remain at `alpha.0` and
`alpha.2` after the latter commits. Independent Playwright MCP reproduces
that stale memory against both IndexedDB and localStorage while the durable
root already contains `alpha.2`.

The old saver scheduled complete models independently, swallowed failures
and did not own its idle callbacks. Cache openings lacked root invalidations
and a close lifetime. These derived counts must not use editable-record
merging: replaying counts or messages could inflate learned replies. The
replacement serializes model admission and persistence, uses the built-in
driver's atomic expected revision, and retries busy/changed ownership at
most eight times. Same-build offsets can advance or adopt a newer committed
whole model. Build IDs remain opaque; a competing different build requires
a new authoritative fetch which observed the committed root first.

Background and explicit failures expose sanitized codes without message
content. Quota, malformed-root and conflicting-build failures retain the
usable unsaved memory model and reject explicit flush. Root notifications
carry no model, message or account payload. Returning-page events recover
missed invalidations without polling. Different account roots stay separate.
Offline reload reconstructs the saved model. Legacy custom unversioned
drivers receive serial saves; they cannot supply atomic cross-tab guarantees.

Fetching runs outside the save lane so offline requests cannot block peer
refresh. A response based on an older in-memory version is discarded and
coalesces a new request. Deltas must continue the same build by exactly their
message count. Whole models validate their headers and unique link IDs before
admission. Chunked-build exceptions reject without replacing the prior model,
including its owner IDs. Close/abort detaches listeners, cancels timers and
idle callbacks, prevents late fetch admission and drains issued saves. Even
a custom fetch that ignores abort cannot hold close indefinitely.

Reproduce the parent with these finite probes:

```sh
REPLY_BEFORE=80e93aa5 node experiments/issue-56/reply-cache-slow.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit SNAPSHOT_BEFORE=80e93aa5 node js/tests/e2e-reply-cache-ownership.mjs
```

Thirteen focused ownership/lifecycle regressions, nine existing reply-cache
checks and fourteen offline-client checks pass (36 total, concurrency one).
Four actual browser-registry/sharding checks pass separately. The held-save
probe reports maximum concurrency one afterward. One native WebKit group
verifies both drivers, live refresh, stale-source refusal, offline reload and
account isolation. Independent MCP checks exercise those same real roots
across two tabs and a document reload; every result reports no cache error.
The owned browser and fixture are closed afterward. These are persistence
changes without a product layout change.

The mandatory browser registry includes the new group for hosted Chromium
and WebKit shards. Scoped lint/format, secrets and source limits pass; the
unchanged 6.5% duplication gate passes at 6.48%. Full runtime/browser matrices
and exact new-head hosted checks remain required. The
[archive](data/reply-cache-ownership.tar.gz) and
[manifest](data/reply-cache-ownership.tar.sha256.json) retain parent failures,
focused/native/MCP results and source snapshots. This advances R-Y70 and the
storage foundations of R-AA21; device data placement, native provider parity
and all other unchecked original issue requirements remain unfinished.
