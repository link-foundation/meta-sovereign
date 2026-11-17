The Windows Node shard 3 run for `4fefd254` cancels the busy-port hardening test
at its existing 30-second deadline. The downloaded job log records zero failed
assertions and one cancelled test at lines 3918–3925. Its opt-in lifecycle trace
at lines 2977–2992 shows the CLI hashing and staging 2,091 runtime files for
21.6 seconds before attempting the occupied public listener. The CLI then has
little of its original test budget left for rejection and temporary-file cleanup.
The trace identifies avoidable startup work; it does not establish the precise
filesystem operation executing at the cancellation instant.

Initial CLI startup now asks the rolling host to claim its listener before
preparing the immutable package snapshot. An occupied port rejects without
creating a release snapshot or starting a worker. A preparation failure follows
the existing listener/proxy cleanup path. A successful preparation still starts
one worker, and the CLI waits for readiness before reporting success. Upgrades
of an existing host retain their existing staging and handoff behavior. The
content-free lifecycle checkpoints distinguish binding from staging and remain
off by default. No test deadline, retry count or CI coverage is relaxed.

Four focused checks cover HTTP/HTTPS busy-port rejection, the foreground CLI's
absence of a release directory on rejection, listener ownership during a
refused preparation, cleanup/rebinding and a healthy prepared worker. They pass
with one test process at a time and a 384 MiB Node heap limit. Against exact
parent `811b03a0`, one passes and three fail, including the real CLI assertion
that an occupied port must not create `runtime/releases`. Test temporary files
are removed even when an assertion fails. Broader runtime/OS behavior belongs
to fresh hosted CI; the Windows result is required before claiming that failure
resolved.

The new cases reuse the existing worker settings and an owned temporary-directory
helper. The original runner-log consumer also passes its focused cleanup check.
The repository's unchanged duplication threshold and static checks pass.

The preserved [evidence archive](data/ci-busy-port-startup.tar.gz) contains both
production source versions, the Windows raw job log, SHA-bound run metadata,
finite test output, static checks and a manifest. This repairs an observed CI
failure; it accepts none of the remaining 40 original criteria.

Workflow: https://github.com/link-foundation/meta-sovereign/actions/runs/44007537939.

Failed job: https://github.com/link-foundation/meta-sovereign/actions/runs/44007537939/job/133788790554.

PR: https://github.com/link-foundation/meta-sovereign/pull/57.
