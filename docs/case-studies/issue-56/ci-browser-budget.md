# Preserve native browser coverage within existing deadlines

PR: https://github.com/link-foundation/meta-sovereign/pull/57

Exact-source [Checks run 44328438761](https://github.com/link-foundation/meta-sovereign/actions/runs/44328438761),
created 2026-11-18 at 14:49:02 UTC for `b3364503`, has two independent
deadline failures and three runner-allocation cancellations in its first attempt.
The complete WebKit job log and the job metadata/annotations are preserved in
the accompanying evidence. The aggregate run-log request failed with an HTTP/2
stream cancellation; the complete individual failed browser log was retrieved.

The [WebKit shard-4 job](https://github.com/link-foundation/meta-sovereign/actions/runs/44328438761/job/134889666218)
started at 15:14:04 UTC. Its annotation reports the 35-minute job deadline.
Log lines 1456–1457 show cancellation during vacancy discovery at 15:49:17,
before the remaining registered checks ran. Thirty-five preceding groups
consume 1,655.241 seconds, including one failed group. This is accumulated serial
work; no completed browser assertion failure is reported in this log.

Separately, log lines 1066–1095 show the combined `vacancies` group exhausting
its 180-second subprocess budget. `verifyVacancies` passes in 61.890 seconds;
`verifyVacancySelection` starts next and reaches its final search input trace
before the child is terminated. Metadata and search-URL scenarios never start.
The log does not establish why that selection took longer on this runner.
An isolated unchanged WebKit selection completes locally in 48.949 seconds,
retaining actual search/description decisions, saved owner deferral, failed-read
recovery, phone reload, zero provider clicks and an empty page-error list.
Its fixture closes its isolated server and contexts, then the runner closes the
browser. This finite success does not turn the timed-out hosted group green.

Deno macOS partitions 3/8 and 6/8 and macOS Bun never acquired a runner. Each
annotation reports repeated hosted acquisition failure and ARM capacity
constraints; all three have zero executed steps. They provide no test verdict.
The terminal status correctly refuses the abandoned test matrix and cancelled
browser matrix. A same-SHA failed-job retry was requested after preserving the
first attempt. Retry results remain separate evidence.

The correction retains the 35-minute job and 180-second subprocess deadlines.
Both mandatory engines run eight disjoint shards instead of four. The complete
156-entry registry is covered exactly once per engine, with twenty checks in
the first four shards and nineteen in the remaining four. A focused contract
refuses a future shard exceeding twenty registrations. Each shard retains its
independent diagnostic artifact and mandatory terminal gate.

Vacancy selection now has an independent direct Node entry. The original
vacancy group retains search/cache, metadata and search-URL verification; the
selection's assertions and fixtures are unchanged. All ten original vacancy
scenarios remain registered exactly once across four groups. No provider
behavior, runtime matrix or ARM coverage is removed.

Two focused assertions fail against the actual published workflow/registration
before correction. All 29 selected CI contracts pass afterward, including real
subprocess partition execution and failed/skip propagation. Workflow policy
also passes. Full runtime and browser matrices remain hosted checks.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/ci-browser-shards.test.js js/tests/ci-contracts.test.js
node js/scripts/check-ci-workflows.mjs
```

The [source-bound evidence](data/ci-browser-budget.tar.gz) records parent/current
workflow and entry sources, the complete failed browser log, native probe,
annotations and focused checks. Exact-source hosted success remains required.
No original acceptance criterion is accepted by this CI correction; the issue
inventory remains **88 verified / 30 unfinished**. PR57 stays draft and unmerged.
