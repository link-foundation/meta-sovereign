# Browser startup behind an active snapshot save

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged. On published commit `060b1721`,
[Chromium shard 3/4](https://github.com/link-foundation/meta-sovereign/actions/runs/43778308862/job/133011169900)
failed while two tabs opened their localStorage root. The retained job log
records `STORE_SNAPSHOT_CHANGED` at lines 1501–1506, before owner writes.
The preceding IndexedDB scenario passed. Other workflows passing does not
override this actual failure.

The previous `ifAvailable` policy refused immediately whenever the browser
had not released a competing root lock. Four initialization attempts could
all finish before that release. A finite regression holds one lock, starts one
opening, observes its outcome and releases the holder during cleanup. The
unchanged implementation exhausts its retries and refuses; the updated opening
queues, then completes after release. The exact published parent reproduces
the same refusal with two native Chromium pages and no synthetic load.

Snapshot saves now queue with a two-second acquisition cancellation bound.
They still compare the durable revision and write synchronously while holding
the lock. A competing commit made during the wait therefore refuses a stale
replacement. A suspended holder produces `STORE_SNAPSHOT_BUSY` and no unlocked
write. Missing Web Locks, malformed roots, conflicting credentials and quota
errors retain their existing refusal behavior. Existing causal-save and boot
retry budgets are unchanged. Failed bootstrap stores drain before retrying.
Optional opening diagnostics contain only an attempt number and error code.

An initial native draft probe also exposed a verification error: an asynchronous
`Page.waitForFunction` predicate could finish on a Promise whose resolved value
was false. The installed Playwright 1.65.0 implementation tests the Promise
before awaiting its result; [upstream report #29132](https://github.com/microsoft/playwright/issues/29132)
describes the same behavior. The retained initial probe incorrectly reported a
queued old lock. It is rejected as evidence. Storage conditions in this scenario
now use an explicit bounded helper that awaits each actual browser result
before deciding whether to poll. Native lock-query evidence must show the
queued request before its holder is released. This also verifies peer records,
converged children and deletion before advancing the merge scenario.

```sh
node --test --test-concurrency=1 js/tests/browser-store-boot.test.js js/tests/browser-store-merge.test.js js/tests/browser-store-conflicts.test.js js/tests/browser-store-save.test.js
deno test --allow-all --no-check js/tests/browser-store-boot.test.js
RUN_BROWSER_E2E=1 E2E_BROWSER=chromium node experiments/issue-56/browser-boot-check.mjs --before
RUN_BROWSER_E2E=1 E2E_BROWSER=chromium node js/tests/e2e-browser-merge.mjs
```

Use the existing `E2E_EXECUTABLE_PATH` override if the installed Chromium lives
outside Playwright's cache. One initial launch failed because that cached
binary was absent; no browser was installed for this check. The final native
scenario passes startup, both storage drivers, live visibility, concurrent
edits, child replacement, deletion, private local records and durable reload.
It uses two owned pages, closes its stores/browser/server and accesses no live
provider. The native startup check is part of the existing mandatory browser
matrix entry. Three new regressions and 36 existing focused checks pass with
one local test process; the three new cases also pass on Deno.

The [archive](data/browser-boot-queue.tar.gz) and
[manifest](data/browser-boot-queue.tar.sha256.json) retain the original job log,
initial failed/invalid probes, exact-parent failure, passing focused/native
checks, changed sources and the parent snapshot implementation. Initial logs
are diagnostic history, not passing acceptance evidence. Full hosted checks
for the new published head remain required. All 60 unchecked reference rows
and wider desktop/provider work remain unfinished.
