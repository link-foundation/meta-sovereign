# Automatic convergence between editable browser tabs

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged. The earlier snapshot-ownership fix prevented silent data loss,
but the production browser opening still rejected a second tab's ordinary
write and left already open tabs stale. Exact published parent `1e902295`
reproduces `indexedDB: both editable tabs must save`: one tab succeeds while
the other returns `STORE_SNAPSHOT_CHANGED`. Its unsaved owner copy survives.
Run the unchanged positive browser probe with
`RUN_BROWSER_E2E=1 E2E_BROWSER=webkit SNAPSHOT_BEFORE=1e902295 node js/tests/e2e-browser-merge.mjs`.

Production browser boot now uses a shared opening helper: migrate first, then
enable coordinated causal snapshots and the existing fresh-actor wrapper.
The primitive store still refuses stale roots. IndexedDB transactions and
localStorage Web Locks retain their atomic compare-and-replace checks. A
conflict loads the committed root and merges public records with the existing
register, including payload-free deletion clocks. Saves retry at most eight
times. A competing migration boot may reopen its completed root at most three
times before refusing; no owner edits exist during that retry.

Private records use baseline comparisons within their account's root.
Independent changes survive; conflicting credentials refuse without changing
the saved root. Schema mismatches, malformed roots and noncausal physical
public removals also refuse. Quota errors retain owner memory without a false
save acknowledgement. Public edits admitted during an asynchronous refresh
or by a subscriber during merged admission retain their new payloads/clocks.
No incoming snapshot invents an owner assignment.

Root-scoped BroadcastChannel invalidations contain only `changed: true`.
Storage events and returning-page events recover missed invalidations without
snapshot polling. Disabled messaging cannot turn a successful durable write
into a rejected receipt. Extra account roots remain isolated. Abort/close
detaches watchers; close also drains issued work. One draft regression caught
close resolving while a running refresh's subscriber write remained pending.
The retained failing log reports `true !== false`; close now waits for the
queue to remain unchanged after its awaited tail.

Verification uses twelve finite merge tests, 23 existing snapshot conflict/save
checks and four browser registry checks (39 total), with concurrency one and
small local inputs. Native WebKit exercises two real tabs over both IndexedDB
and localStorage: both writes save, open peers refresh, concurrent edits and
children converge, deletion propagates, private local values refresh and a
reload retains the committed result. An independent Playwright MCP probe
reproduces the parent refusal for both drivers, then verifies two actual tabs,
live remote visibility, deletion and separate account roots. Its browser and
owned fixture are closed afterward. These are storage changes without a
visual product layout change.

The unchanged 6.5% duplication gate passes without new exclusions. The
[archive](data/browser-tab-merge.tar.gz) and
[manifest](data/browser-tab-merge.tar.sha256.json) retain source snapshots,
the parent failure, draft drain failure, final focused/native/MCP checks and
validation logs. Full runtime/browser matrices and exact published-head CI
remain required. This unit does not complete provider parity, full reply-cache
ownership, remaining data-placement behavior or any other unchecked original
issue requirement. See [browser storage](../../BROWSER-STORAGE.md) for limits
and lifecycle behavior.
