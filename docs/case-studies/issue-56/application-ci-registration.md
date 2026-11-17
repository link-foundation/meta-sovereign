Commit `811b03a0` adds the salary admission scenario to a native application
entry point that already has four scenarios. Hosted workflow job
`133803690860` rejects the fifth scenario before the runtime/browser matrix:
`job-application combines 5 native scenarios`. Its exact-head log and metadata
are preserved in the [evidence archive](data/application-ci-registration.tar.gz).

Salary admission now runs with the existing answer approval/context group,
which has three scenarios after the change. The original application group
retains its four scenarios. The registry contract explicitly requires salary
admission exactly once, alongside every previous native application scenario.
No engine, shard, assertion, deadline or retry policy changes.

Three focused contracts verify the complete scenario list, direct registered
entry points, and disjoint Chromium/WebKit partitions within their existing
budgets. These pass with one process and a 192 MiB heap limit. The native salary
scenario itself already passed its focused browser check in `811b03a0`; the full
hosted engine matrix remains required. None of the 40 open criteria is accepted
by this CI correction.

Failed run: https://github.com/link-foundation/meta-sovereign/actions/runs/44012731824.

PR: https://github.com/link-foundation/meta-sovereign/pull/57.
