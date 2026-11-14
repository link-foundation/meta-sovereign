# Preserve later observed browser-tab child replacements

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged. Checks run `43530994430`, head `8d16669e`, fails in WebKit shard 3
job `132250412027`. Its complete 2,049-line job log reports different child
sets for the same later owner value and vector clock at lines 1941–1985.
The complete workflow log, artifact metadata and 38-entry browser artifact
were downloaded; the retained browser-specific log contains the same error.

An unchanged opening contributed its old child set through the concurrent
register join after another tab had observed and deliberately replaced that
record. Its owner and durable root contained only the replacement; refreshing
the stale tab revived removed children. A three-way baseline comparison now
follows the changed record when the other side is unchanged. Independently
changed public records still use the causal register. Private conflicts,
physical-removal refusal, causal deletion and eight-attempt save limits remain.

The former native test launched simultaneous Playwright calls, which do not
prove simultaneous owner admission: a peer can refresh before its later put.
The probe now holds both saves until both owner assignments exist, then
commits them in order to verify stale-root merging. A separate observed edit
replaces the merged child set and must converge without resurrecting children.
The initial independent-tab writes still run concurrently. No deadline or
retry budget increased. A draft that released both held commits together
exhausted the existing localStorage conflict budget; its failure and an opt-in
fixture trace are retained. This does not establish the precise original
hosted scheduling interleaving or remove the documented finite-contention
refusal. Fixture tracing is off unless `BROWSER_MERGE_TRACE=1`; ordinary trace
messages contain only the driver kind and error code.

Run the exact-parent comparison with
`python -B experiments/issue-56/tab-merge-before.py`. It temporarily installs
only `5a687049`'s coordination module, runs one bounded regression and the
native WebKit probe, then restores every working byte. Both fail with revived
children. The corrected source passes 36 focused merge/conflict/durability
checks with concurrency one and the native WebKit probe over IndexedDB and
localStorage. Independent Playwright MCP checks reproduce the parent mismatch
and verify replacement plus durable reopen through two actual tabs for each
driver. No page errors occur; the browser and owned fixture close afterward.
These storage changes do not change visual layout.

[Checksummed evidence](data/ci-browser-observed-replacement.tar.gz) and its
[manifest](data/ci-browser-observed-replacement.tar.sha256.json) retain the
source, exact parent, failures and final checks. Full runtime/browser matrices
remain hosted and exact published-head checks remain required. The native
application UI, deferred retry policies and every other unchecked original
criterion remain unfinished.
