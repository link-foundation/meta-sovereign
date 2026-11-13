# Browser tab persistence

The app opens its account's local store through `openCausalBrowserStore`.
It migrates the stored data before enabling tab coordination. Public records
use the same causal merge as device synchronization, including deletion clocks
that prevent an old tab from restoring deleted payloads. Each opening has its
own writer identity. Concurrent public edits converge by the existing register
ordering; child memberships are combined.

IndexedDB compares and replaces each root in one native transaction.
The localStorage fallback requires Web Locks. A stale root is re-read and
merged before another atomic comparison, with at most eight save attempts.
Unavailable coordination, incompatible schemas, conflicting private edits and
noncausal physical public removals refuse the write. A failed save retains
the owner's visible memory state and rejects its promise. It does not produce
a successful save receipt. `flush()` explicitly retries that state.

Private records remain inside the same account's persistence root. Independent
private additions and deletions refresh other tabs of that account. Concurrent
different edits of the same private value refuse rather than selecting a
credential by an invented timestamp. Other account roots remain separate.

BroadcastChannel messages contain only `{ changed: true }`, without records,
credentials or message bodies. Receivers re-read their own root. localStorage
also observes native storage events. Pages re-read on focus, pageshow and
visibility changes to recover missed notifications after suspension. If
BroadcastChannel is unavailable, IndexedDB tabs catch up on those page events
or an explicit `refresh()`; automatic save-time merging still uses the same
atomic revision checks. There is no full-snapshot polling loop.

`close()` detaches notifications and drains already issued saves/refreshes,
including writes admitted by their subscribers. The app also detaches on
its page lifetime signal. Optional `onError` callbacks report background
refresh refusals; production browser debug logging records only error codes.
Plain `createBrowserStore` remains available for primitive stores, migration
and fixtures, with its original stale-root refusal. It does not implicitly
enable causal merging before a caller has completed migration.

The [case study](case-studies/issue-56/browser-tab-merge.md) records exact-parent,
focused and native-browser verification. This local tab coordination does not
establish delivery to an external provider or synchronization with a device
that has no reachable transport.
