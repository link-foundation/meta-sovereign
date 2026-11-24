# Deno worker startup uses the installed dependency graph

Windows Deno shard 3/3 on parent `d4c7fb81`, run `43269083327`, job
`131362601592`, fails initial CLI readiness after 10,154 ms. Raw job-log lines
2257–2309 show child startup downloading newer `lino-objects-codec@0.9.6`,
`prettier@3.10.0`, Clack and AWS packages, although the install step had already
installed the locked graph (including codec 0.9.5 and Prettier 3.9.10). The CLI
then reaches release staging but not worker readiness before the fixture ends.
This establishes redundant dependency resolution as a startup cost; it does not
establish how long Windows startup will take once that cost is removed.

`workerArgs` passed `--no-lock` while inheriting `nodeModulesDir: auto`. Each
spawned CLI/worker could therefore resolve package ranges afresh and modify the
shared installed graph. Workers now explicitly use `--node-modules-dir=manual`:
they resolve the dependencies already installed for the application, including
the dependency directory linked into an immutable rolling release. `--no-lock`
still prevents worker execution from modifying a release lockfile. Node/Bun
invocation and the ten-second readiness/thirty-second test limits are unchanged.
[Deno documents manual mode](https://docs.deno.com/runtime/fundamentals/node/)
for applications with an existing installation step.

The new finite regression creates an auto-mode project with one installed local
package and executes the actual worker arguments with `--cached-only`. The real
parent fails because it tries to resolve the fake package in the registry; the
corrected code reads the installed module without registry access. Five focused
Deno worker/output checks pass. One existing real Deno CLI startup/repeated
serve/prepared upgrade case passes in 17 seconds overall, with initial durable
readiness at about seven seconds and no package downloads. These Linux results
are not a Windows timing claim. Exact-head hosted Windows verification remains
required.

Reproduce the parent with
`python3 -B experiments/issue-56/deno-worker-dependencies-before.py`; run the
focused Deno worker test or the existing `default serve owns` rolling CLI case.
Both own temporary fixtures, drain their children and leave the user's server
alone. The [checksummed archive](data/ci-deno-installed-workers.tar.gz) retains
the complete failed Windows job, parent sources, regression and verification
logs. All other unchecked issue criteria remain open in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
