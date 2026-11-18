# Execute the detached Forms learning regression

The successful [Chromium reader job](https://github.com/link-foundation/meta-sovereign/actions/runs/44206092198/job/134474349802)
at published source `5283e26a` contains the normal reader scenarios at log
lines 1305–1458, but no detached CLI receipt. The QA23 evidence collector
correctly refuses to accept this as full-minute learning verification.

The reader called `await app.finish(...)` before importing the watcher example.
`finish` closes its fixture and calls `process.exit` at line 158. The later import
was unreachable. The existing CI contract checked that the import text existed;
it did not establish execution. The detached example was separately runnable,
but its script was absent from the mandatory browser registry.

Append `forms-watchers` as a separate mandatory entry, preserving every existing
partition. It gets the same three-minute command deadline as other groups;
the 35-minute job deadline remains unchanged. Chromium CDP runs the detached
example in either hosted browser lane, whose setup already installs Chromium.
The ordinary reader still executes in its lane's selected engine. The detached
fixture owns a separate store, browser profile, watcher and provider simulation.
Its screenshots now honor the browser artifact directory and remain available
after hosted failure. Default example screenshot paths are preserved.

The new registration regression fails against the actual preceding registry.
Twenty-seven focused workflow/partition/runner checks pass after correction.
The runner test explicitly exits its reader child before its final marker and
requires the later watcher child's marker, proving independent execution.
Skip/failure propagation and all existing browser groups remain covered.

One focused native run uses the actual CLI, separate watcher process and full
production minute. It requires zero submissions after CLI exit, stable-edit
learning, the same watcher on reattachment, retained values, exactly two
unapproved proposals after one owner Send and acknowledged Stop. Cleanup drains
owned children, watcher and browser. The hosted learning collector now requires
this actual structured receipt from the independent group in both lanes.

The [source-bound archive](data/ci-forms-watchers.tar.gz) retains the hosted log,
exact preceding sources, failed regression, focused checks and native receipt.
This fixes a verification gap. QA23 and all other unfinished criteria in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remain open
until their complete exact-source hosted gates and assertion review succeed.
