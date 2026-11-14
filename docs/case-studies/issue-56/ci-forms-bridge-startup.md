# Form bridge startup CI regression

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) commit `cea1af881de48120c78528be6faeeb713e63a788` started five workflows at 2026-11-10 19:33:00–01 UTC. Four auxiliary workflows passed. Checks run `42886382414` exposed two review-lifecycle failures across Node, Bun and Deno on Linux, Windows and macOS. These results belong to that exact pushed commit, not the uncommitted detached-watcher draft.

The complete Linux Node job log, `ci-logs/forms-watchers-parent-node-ubuntu.log`, reports `Cannot read properties of undefined (reading 'id')` at line 5,625 and `expire is not a function` at line 5,636. Both refer to the existing immediate Close and opening-deadline regressions in `forms-review-sessions.test.js`. The corresponding Windows Node errors appear at lines 6,944 and 6,955; macOS Node at 3,455 and 3,466. Downloaded Bun and Deno logs report the same lifecycle failures. macOS Deno also reports an undefined channel receiver at line 9,320 of job `130077396369`.

The writer-bridge prerequisite awaited startup before calling the review-session owner. That extra asynchronous boundary meant an immediately queried opening session did not exist yet, and its deadline had not been installed. Running only the two existing lifecycle regressions locally reproduces both errors; the failing log is preserved as `forms-watchers-ci-lifecycle-before.log`.

The corrected owner registers the session and installs its deadline synchronously, then awaits the optional bridge inside the owned launch. Close during bridge startup cancels that owned operation before browser launch. Memory-only reviews retain their original immediate launch behavior. The two existing regressions now pass, and an additional held-bridge case verifies immediate session visibility, cancelled launch and completed cleanup.

The channel failure is a fixture ordering race: a client's Connect event does not guarantee that the server's connection callback has initialized its receiver in every runtime. The test now awaits explicit server acceptance before accessing that receiver. It retains fragmented/coalesced frame and oversized-allocation assertions without extending any timeout.

Focused Node/Deno results, all nine failed runtime job logs, exact run metadata and source snapshots are preserved in the [detached-watcher archive](data/forms-detached-watchers.tar.gz). The next commit still requires its own complete hosted matrix; local focused checks do not establish that matrix passed.
