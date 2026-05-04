# Case Study: Issue #20 - Fix CI/CD once and for all

**Issue:** [#20](https://github.com/link-foundation/meta-sovereign/issues/20)
**Pull Request:** [#21](https://github.com/link-foundation/meta-sovereign/pull/21)
**Branch:** `issue-20-2e1bcf090e36`
**Initial failed run studied:** [25310893905](https://github.com/link-foundation/meta-sovereign/actions/runs/25310893905)
**Initial failed job studied:** [74197364665](https://github.com/link-foundation/meta-sovereign/actions/runs/25310893905/job/74197364665)
**Post-push cancellation studied:** [25319077285](https://github.com/link-foundation/meta-sovereign/actions/runs/25319077285)

Issue #20 asks for a complete CI/CD investigation, not just a retry of
the failed workflow. This folder preserves the raw issue, PR, workflow,
template, and test evidence used to identify the failure and documents
the fix.

## Artifacts

| Path                                      | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `data/`                                   | Raw GitHub issue, PR, comments, workflow metadata, and CI logs.   |
| `templates/`                              | Downloaded workflow snapshots and diffs for the linked templates. |
| `requirements.md`                         | Atomic requirements extracted from issue #20.                     |
| `components.md`                           | In-tree components involved in the failure and fix.               |
| `ci-cd-template-comparison.md`            | Comparison with JS, Rust, Python, and C# pipeline templates.      |
| `external-research.md`                    | External references used during analysis.                         |
| `solution-plan.md`                        | Options considered and chosen implementation plan.                |
| `data/local-deno-browser-store-*.log`     | Focused reproduction and verification logs for Deno.              |
| `data/local-node-browser-store-after.log` | Focused Node verification log.                                    |

## Timeline

- 2026-05-04 09:14:12 UTC: Workflow run `25310893905` started on `main`
  at `b4cef0464704b89a87644d96a79dabe1c74abb6b`.
- 2026-05-04 09:15:41 UTC: Windows Deno step started in job
  `74197364665`.
- 2026-05-04 09:18:52 UTC: `browser-store.test.js` reached the IndexedDB
  shim test.
- 2026-05-04 09:18:52 UTC: The next file, `build-pages.test.js`,
  started before the IndexedDB test printed `ok`.
- 2026-05-04 09:22:01 UTC: Deno reported `227 passed | 0 failed`, then
  exited with the pending-promise event-loop error.
- 2026-05-04 09:22:05 UTC: The Windows Deno job completed as failed; all
  other non-release jobs passed or skipped.
- 2026-05-04 12:07:35 UTC: Issue #20 was opened.
- 2026-05-04 12:08:20 UTC: Draft PR #21 existed on branch
  `issue-20-2e1bcf090e36`.
- 2026-05-04 12:30:32 UTC: Post-push workflow run `25319077285`
  started on PR head `2db38d9ab2081f02702df627ed0273ece5a0e993`.
- 2026-05-04 12:31:19 UTC: Windows Deno passed the IndexedDB regression
  test on the pushed fix.
- 2026-05-04 12:41:03 UTC: The aggregate `Checks and release` run was
  cancelled while macOS Deno was still waiting on tests that had already
  completed their assertions but were blocked by idle HTTP keep-alive
  shutdown.

## Evidence

The failure was specific to `Test (deno on windows-latest)`. The saved
run metadata in `data/ci-run-25310893905.json` shows that the only
failed job was `74197364665`. The saved log pinpoints the symptom:

- `data/ci-run-25310893905.log:8938` starts `browser-store.test.js`.
- `data/ci-run-25310893905.log:8943` prints the IndexedDB shim test
  name and immediately starts `build-pages.test.js`, without an `ok`
  marker for the IndexedDB test.
- `data/ci-run-25310893905.log:9189` reports `227 passed | 0 failed`.
- `data/ci-run-25310893905.log:9191` reports Deno's pending-promise
  event-loop error.

The focused local Deno run on Linux did not fail before the fix, which
is consistent with a timing-sensitive test/implementation race rather
than a deterministic assertion failure. A new regression test now
checks the actual ordering requirement that was previously implicit.

Post-push run `25319077285` proved the IndexedDB fix worked on the
originally failing cell, then exposed a separate Deno shutdown delay:

- `data/ci-run-25319077285.log:2957` shows Windows Deno passing
  `browser store: indexedDB driver attaches transaction completion before
writes`.
- `data/ci-run-25319077285.log:4355` starts `browser-commander.test.js`
  on macOS Deno, and `data/ci-run-25319077285.log:4358` reports it
  passing only after `3m0s`.
- `data/ci-run-25319077285.log:4505` starts `server-iter3.test.js`, and
  `data/ci-run-25319077285.log:4508` reports it passing after `3m0s`.
- `data/ci-run-25319077285.log:4524` starts
  `settings-credentials-roundtrip.test.js`, and
  `data/ci-run-25319077285.log:4528` reports the second test passing
  after `3m0s`.
- `data/ci-run-25319077285.log:4536` is the job cancellation.

## Root Cause

`createIndexedDbDriver.save()` started a write transaction and awaited
the `put()` request before attaching `tx.oncomplete`, `tx.onabort`, and
`tx.onerror`. The minimal IndexedDB shim used by the tests can complete
the transaction independently of the write request. On the Windows Deno
runner, the transaction completion could happen before the handler was
installed, leaving the transaction-completion promise unresolved.

Deno then finished the rest of the test files, reported all assertions
as passing, and finally failed the process because an awaited promise
was still pending after the event loop emptied.

The post-push cancellation had a different root cause. Several tests
start the local `node:http` server and use `fetch()` against it. The
server handle's `close()` method called `server.close()` but did not
actively close idle keep-alive sockets. On macOS Deno, those idle
connections delayed test completion until the runtime's three-minute
idle expiry, which consumed the 10-minute matrix job budget.

## Fix

The fix attaches transaction completion and failure handlers immediately
after opening the transaction and before starting `objectStore.put()`.
The new regression test, `browser store: indexedDB driver attaches
transaction completion before writes`, fails on the old ordering and
passes with the fixed ordering.

The server shutdown fix tracks accepted HTTP sockets and destroys any
remaining sockets after shutdown begins. The new server lifecycle test
opens a raw `Connection: keep-alive` socket and verifies `handle.close()`
does not wait for idle expiry.

This is intentionally an application-level fix, not a workflow
workaround. The workflow already has the relevant template hardening:
timeouts, a cross-OS runtime matrix, fresh-merge simulation for PRs,
changeset validation, formatting/lint/duplication/secret checks, and
`fail-fast: false` so every matrix cell can report its result.

## Outcome

The branch changes:

- Fix `js/src/storage/browser-store.js` so IndexedDB transaction
  handlers are attached before writes begin.
- Add a regression test in `js/tests/browser-store.test.js`.
- Fix `js/src/server/index.js` so local server shutdown tears down idle
  HTTP keep-alive sockets.
- Add a lifecycle regression test in `js/tests/server.test.js`.
- Add a patch changeset.
- Preserve the CI failure evidence and template comparison under this
  folder.

The linked templates do not contain `browser-store.js`, the IndexedDB
driver, or the browser-store tests, so the same bug is not present in
the templates.
