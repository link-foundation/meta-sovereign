# Final import samples can also emit a resource warning

PR: https://github.com/link-foundation/meta-sovereign/pull/57

## Hosted failure and reproduction

Checks run 44405088672 uses source
`08cf9ee557380fdf8f9edd59e164cca7c34325c1`, created 2026-11-18
21:47:32 UTC. Two Bun jobs fail the same import-observation assertions:

- macOS job 135161142778, complete preserved log lines 39819–39864;
- Ubuntu job 135161143433, complete preserved log lines 7986–8031.

The rejected-import test expects the last event to be
`server_import_resources_final`. The settled-import test expects exactly the
baseline and final events. Both actually receive a `server_resource_high`
transition after the final sample. The diagnostic intentionally emits its
sample before a change in warning state, so this extra event is valid. The
assertions do not preserve the specific threshold values; the hosted memory or
CPU cause is not established by these failures.

```sh
python3 -B experiments/issue-56/import-resource-warning-before.py
```

The replay restores the published test bytes and uses an isolated preload
that supplies finite synthetic CPU counters, with zero synthetic memory usage.
It creates no CPU or memory stress. Both original assertions fail and the
default-off and thirty-sample controls pass. Current test bytes are always
restored afterward.

## Correction and verification

The assertions retain exact baseline/final sample order, excluding only the
two documented high/recovered transition events. An unexpected event, missing
or duplicated sample, changed module/error identity, extra interval sample or
failed timer cleanup still fails. Two additional ordinary automated cases
mock memory counters to cross the warning threshold only on the final sample,
and require the warning and its `memoryHigh` flag. These counters allocate no
large buffer. Production diagnostics, thresholds and deadlines are unchanged.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/worker-import-resources.test.js js/tests/resource-diagnostics.test.js
node --max-old-space-size=384 --import ./experiments/issue-56/synthetic-import-resources.mjs --test --test-concurrency=1 js/tests/worker-import-resources.test.js
```

Eight focused checks and six checks under the synthetic preload pass. Complete
runtime/browser matrices remain hosted checks for the published correction.
The adjacent source-bound archive retains both actual job logs and metadata,
published test bytes and finite before/after checks. Acceptance remains
88/118, with thirty unfinished criteria; PR57 stays draft/unmerged.
