# Locate recurring cold release-copy delays

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains
draft. The exact `80e93aa5` [Windows Deno job](https://github.com/link-foundation/meta-sovereign/actions/runs/43507470753/job/132170643919)
fails initial CLI readiness after 10,305 ms. Its preserved 5,199-line log,
lines 2215–2228, records command loading at 238 ms, release enumeration at
21 ms, hashing at 475 ms and directory preparation at 634 ms. No copy
completion is reported before the unchanged ten-second readiness budget.
The later tamper fixture copies the same 1,634 files in roughly 4,494 ms
(lines 2231–2240). That later pass does not resolve the cold-start failure.

The existing `MS_LIFECYCLE_DEBUG=1` trace now reports at most eight
monotonic completed-file checkpoints during each copy. It contains counts
and elapsed time, never paths or file contents. Default behavior stays
silent. Four-copy concurrency, immutable content verification, failure
draining, readiness semantics and deadlines are unchanged. The existing
Windows CI trace enables these observations on the actual startup path.

Five focused, finite release-copy tests pass, including default-off output,
bounded content-free diagnostics, slot refill, failure ownership and
tamper refusal. The diagnostic assertion fails against the exact parent;
it verifies observability rather than claiming a startup correction.
Scoped lint, formatting and diff checks pass.

The [archive](data/ci-release-progress.tar.gz) and
[manifest](data/ci-release-progress.tar.sha256.json) retain the full hosted
failure, exact run metadata, actual-parent source and regression output.
The next hosted checkpoints must guide the correction. Windows initial
startup and every unchecked original requirement remain unfinished.
