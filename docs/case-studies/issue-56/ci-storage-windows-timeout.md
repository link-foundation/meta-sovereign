# Windows durable storage timeouts

The [45bb2376 workflow](https://github.com/link-foundation/meta-sovereign/actions/runs/44069711910)
fails in Node Windows shard 2, job `133996283032`. Its preserved log lines
3803–3821 identify five tests cancelled at their existing ten-second bounds:
managed atomic receives, durable offline edit and deletion reconciliation,
desktop friendship quota reopen, and real Lino friendship restart. There are
2,302 passing tests, five cancellations and zero assertion failures in this job.

The same five tests pass locally unchanged with one worker. A second focused
run with native filesystem tracing also passes. Both managed dual stores and
plain Lino stores are affected in the hosted log, so that evidence does not
isolate the native mirror or a particular provider as the cause. The historical
cause remains unconfirmed; a passing local retry does not resolve it.

After a failed Node Windows test step, CI now runs only these five fixtures
with one worker, existing storage debug checkpoints and Node's native
filesystem trace. The trace records operation entry and completion separately,
including operations that never reach the next application checkpoint. It is
retained for seven days as a diagnostic artifact. Failed setup steps do not
trigger the retry. The original test step still fails, and its assertions,
concurrency, partitions and deadlines are unchanged. This diagnostic is off on
normal passing runs and does not run a full suite again.

```sh
node experiments/issue-56/storage-windows-timeout.mjs
```

The [checked archive](data/ci-storage-windows-timeout.tar.gz) retains the exact
failed log, source/job identity, both focused local results, diagnostic source
and verified native trace summaries. The five local process traces contain
filesystem open/read/write/close and fsync events; all five JSON files parse.
The raw traces remain diagnostic artifacts rather than accepted behavior.

Hosted recurrence analysis, a demonstrated root cause and any necessary
regression correction remain unfinished. All forty unchecked original criteria
also remain required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
