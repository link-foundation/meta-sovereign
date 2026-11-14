# Concurrent browser snapshot protection

Draft: <https://github.com/link-foundation/meta-sovereign/pull/57>.

On published `eefc6f7d531931ef6cea782824c3feb46e549613`, two writable browser openings can acknowledge incompatible whole snapshots. Both load the same root; the first saves a record; the second saves its older map and silently removes that committed record. The earlier ordered-save queue protects one store instance, but cannot order independent tabs or database connections. Fresh causal writer identities cannot recover records removed by whole-root replacement.

## Reproduction and correction

`python3 -B experiments/issue-56/browser-ownership-before.py` temporarily restores the exact published browser adapter, runs seven finite regression cases with concurrency one and restores the working file in `finally`. Stale insert, edit, delete, bulk, flush, a reused driver and a legacy root all fail because an expected rejection is missing.

The independent Playwright MCP fixture uses actual IndexedDB connections and then two same-origin tabs. It serves the exact published production adapter and the working adapter separately. Both the published IndexedDB and localStorage cases acknowledge the stale save and flush; a fresh opening contains only the stale tab's draft. With the correction, the original record survives, save and flush reject with `STORE_SNAPSHOT_CHANGED`, and the unsaved draft stays in the losing tab's memory. No owner application server or external provider is used.

Each open store now retains its own expected persistence revision. Built-in persistent drivers mint an opaque root revision only for the snapshot being committed. The revision is outside the Link records, so it does not alter link schema, owner fields, exported records or synchronization packets. Legacy roots are compared by their full serialized value until their next successful save. A legacy-shaped external replacement is also detected. A driver's later load by another caller cannot reset an existing store's expected revision.

IndexedDB reads the saved revision and conditionally replaces the snapshot inside one native readwrite transaction. The put is issued in the get-success callback and acknowledgement waits for transaction completion. A failed comparison aborts without issuing a put. Original request, synchronous-object-store, synchronous-put and commit failures remain observable without unhandled abort rejections. The [IndexedDB transaction scheduling specification](https://w3c.github.io/IndexedDB/#transaction-scheduling) supplies isolation for overlapping readwrite scopes; a separate read followed by an unconditional write would leave the race intact.

The localStorage fallback performs its comparison and synchronous replacement within one origin-scoped exclusive Web Lock, using a lock name specific to the snapshot key. `ifAvailable` avoids waiting indefinitely behind another tab. Busy coordination rejects with `STORE_SNAPSHOT_BUSY`; unavailable coordination rejects with `STORE_COORDINATION_UNAVAILABLE` before writing. Existing snapshots remain readable. IndexedDB or a secure address with Web Locks is required for safe persistent writes. The [Web Locks request specification](https://www.w3.org/TR/web-locks/#api-lock-manager-request) defines exclusive coordination and the null callback for an unavailable nonwaiting request.

Rejected writes preserve the existing immediate in-memory mutation contract. Their promises reject; they do not acknowledge durability. A subsequent flush still compares the original revision and cannot force a stale overwrite. Copy unsaved owner changes before reloading, then explicitly reapply them to the fresh store. Transient quota or busy failures can be retried explicitly if the underlying revision has not changed. The doublets-web decorator forwards comparison options and stored-root metadata while keeping its graph derived from Link records.

An additional review experiment caught a draft error in direct driver use: after a failed first save without a preceding load, retry originally reloaded a newer baseline and could erase an intervening writer. The final implementation retains its initial read before attempting that first commit. The failing draft log and final regression are preserved.

## Focused verification

- Seven exact-parent regressions fail; the final storage/conflict/error group passes 29 tests.
- The existing causal-write, offline-client and browser-registry group passes 32 tests. A new causal offline-client check also verifies that a persistence conflict rejects through the client instead of returning a saved receipt.
- The new native WebKit entry passes two real same-origin tabs against IndexedDB and localStorage. Concurrent writes have exactly one durable winner; stale flush and delete refuse, unsaved text remains available, and reload restores committed data before accepting a new explicit write. Page errors remain empty.
- Independent MCP before/after probes demonstrate both actual separate IndexedDB connections and two browser tabs against both persistence backends.
- The native entry is registered in the existing mandatory Chromium/WebKit CI registry. Full local runtime/browser matrices are not run. Scoped ESLint/formatting, Secretlint, release changeset validation and the web bundle are checked before publication.

The source, exact-parent failures, failed draft, final focused/native logs, independent MCP results and hosted metadata are preserved in [data/browser-snapshot-ownership.tar.gz](data/browser-snapshot-ownership.tar.gz), with its [hash manifest](data/browser-snapshot-ownership.tar.sha256.json). The collector validates expected results before writing the archive.

## Hosted context and remaining work

The prior `2fbdc4b2` Checks run `43475397278`, created at 2026-11-13 17:42:13 UTC, repeats the eight already reproduced causal-storage compatibility failures. All ten completed failing runtime job logs are preserved. Its Windows Bun job `132059714945` successfully reaches control readiness in 4,684 ms (raw lines 7064–7083), below the unchanged ten-second deadline; the earlier `4bfeaf2c` startup failure is not reproduced by that rerun. On `eefc6f7d`, the completed Linux runtime jobs, Windows Bun and all three Windows Deno shards pass; the full Checks workflow remains unfinished at evidence collection. Neither fact establishes the root cause of the intermittent older startup failure.

This safeguard deliberately refuses stale whole-root replacement. It does not provide automatic per-record tab merging, shared live cache ownership, conflict recovery controls, protection against an older build that still writes unconditionally, or native Rust synchronization parity. Those and every unchecked original feature requirement remain unfinished in this draft PR. Exact new-head CI must be inspected after publication. This storage change makes no visual UI change or external provider write.
