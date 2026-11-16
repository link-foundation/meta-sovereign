# Keep relocated worker fixtures bound to production imports

The main workflow on `f09c8d2b0199e6693a9bfe22471e9b3ad81c5009`
([run 43928621395](https://github.com/link-foundation/meta-sovereign/actions/runs/43928621395),
created 2026-11-16 18:25:19 UTC) exposes a regression in the copied recovery
worker. The worker-loading diagnostic changed the application import to dynamic
loading, but the fixture rewrote only `from '../src/…'`. Its copied entry then
resolved the application module relative to a temporary directory. The real
recovery scenario never started.

Every reviewed job below has one failing test, `an upgrade can replace a build
that keeps failing recovery`, with the same unresolved `rolling-worker.js`:

| Job | Runtime and platform | Preserved log and cause line |
| --- | --- | --- |
| 133522615752 | Bun Ubuntu | `ci-f09-133522615752.log:2445` |
| 133522615753 | Node macOS shard 3/8 | `ci-f09-133522615753.log:1686` |
| 133522615813 | Node Windows shard 3/3 | `ci-f09-133522615813.log:3890` |
| 133522615996 | Deno Windows shard 2/3 | `ci-deno-windows-43928621395-133522615996.log:5979` |
| 133522616020 | Bun Windows | `ci-f09-133522616020.log:8812` |
| 133522616603 | Deno Ubuntu shard 2/3 | `ci-f09-133522616603.log:4735` |
| 133522616858 | Node Ubuntu | `ci-f09-133522616858.log:8081` |
| 133522617198 | Bun macOS | `ci-f09-133522617198.log:6928` |

The overall run was still active during collection, so `gh run view --log`
could not provide a complete run archive. Each completed job's raw log is retained
from its authenticated jobs/logs endpoint, alongside the exact-SHA job and run
metadata. Line numbers refer to those unchanged downloaded files in the archive.

The Windows log separately records initial CLI readiness at 6,905 ms (5691),
release readiness at 2,577 ms (5709), worker import start/finish at 1,620/3,344 ms
(5712–5713), and durable control readiness at 6,008 ms from staging (5719).
That scenario passes (5728). This distinguishes the new fixture failure from the
earlier ten-second readiness refusal. One passing hosted observation does not
establish the older timeout's cause or a permanent performance correction.

The two relocated worker fixtures now share a helper that resolves every quoted
production `../src/` reference against the original entry, covering both import
forms. Their injected failures and real production worker remain intact. The
handoff check additionally requires `fixture handoff failure`; missing imports
can no longer satisfy an unrelated `assert.rejects` and bypass rollback coverage.
No production code, test exclusion, retry or deadline changes in this correction.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/recovery-import-before.py
node --max-old-space-size=384 --test --test-concurrency=1 --test-name-pattern='an upgrade can replace a build|a rolling upgrade serves' js/tests/rolling-host.test.js
NODE_OPTIONS=--max-old-space-size=384 deno test --v8-flags=--max-old-space-size=384 --allow-all --no-check --no-lock --node-modules-dir=manual --filter='/an upgrade can replace a build|a rolling upgrade serves/' js/tests/rolling-host.test.js
```

The first check fails against exact implementation parent
`36d41ffb916fdaa17b4cb75c36730e4c694e354b` with the same missing dynamic import.
Both selected recovery/rollback checks then pass on Node and Deno, preserving
the acknowledged pre-crash write, real failed activation rollback and writes
after rollback. Focused lint/format and the unchanged duplication gate pass.
Fresh hosted verification and every unchecked issue requirement remain required;
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft.

[Raw logs, source snapshots and focused results](data/ci-worker-fixture-imports.tar.gz)
and [hash manifest](data/ci-worker-fixture-imports.tar.sha256.json).
