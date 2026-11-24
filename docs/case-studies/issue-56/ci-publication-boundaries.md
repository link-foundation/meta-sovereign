# Trace the unresolved Windows Bun publication deadline

Published `5f982b1721a8a409c9aeff060b42830889e7323b` runs the Windows Bun
job [134128955900](https://github.com/link-foundation/meta-sovereign/actions/runs/44107988047/job/134128955900)
on 2026-11-17. The test step runs 15:00:22–15:07:00 UTC. Raw log lines
2,901–2,910 report the native-export binary Lino publication test reaching
its existing 20-second deadline. The text counterpart passes in 4.924 seconds;
the subsequent translated control case passes in 12.043 seconds. The final
result is 7,139 passes, 23 skips and one failure. That output does not locate
the wait within Git, HTTP or fixture cleanup.

The six original publication tests pass in a focused Linux Bun run, including
binary publication in 1.466 seconds. This is no reproduction or correction of
the Windows cause. The actual missing evidence is retained explicitly rather
than attributing the failure to host load, transport encoding or cleanup.

`CI_CV_PUBLICATION_DEBUG=1` now enables paired, numbered fixture boundaries
with elapsed milliseconds around setup Git commands, production Git commands,
native-export seeding, both HTTP operations and owned service/removal cleanup.
The same variable already enables durable production publication states.
`CI_FIXTURE_DEBUG=1` retains the existing accepted-connection/close diagnostic.
Both switches are enabled only in the Windows Bun CI step and remain off by
default. Boundary diagnostics never include command arguments, paths, return
values, export content or error text. The focused privacy check verifies silent
defaults, paired success/failure events and preservation of actual return/error
identity. No deadline, assertion, test selection or publication guard changes.

For a focused attempt, run the two publication export/trace test files with
Bun and those two environment variables. Seven focused tests pass in Bun and
Deno; Node passes nine including the existing long-path/private Git trace tests.
Strict lint, formatting, file limits, workflow lint, secret lint and the
unchanged duplication gate are checked separately. An initial scoped lint run
identified two unqualified performance globals; the final helper uses
`globalThis.performance`. Both outputs remain in the evidence.

The [checked archive](data/ci-publication-boundaries.tar.gz) and
[manifest](data/ci-publication-boundaries.tar.sha256.json) preserve the full
14,005-line failing log, exact job metadata, unchanged parent bytes, focused
attempts and diagnostics. A successful hosted rerun does not establish this
historical failure's cause. All forty unfinished criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.
