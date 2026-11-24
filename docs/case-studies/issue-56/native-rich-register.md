# Checked native rich-record admission

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), issue #56.

The published `b24e1ca5f757c6083e944fcdf17fe565f519dbd8` typed core
retains assignment clocks, but the native server independently stores rich
records and constructs a core mirror from only IDs, tokens and children.
Consequently that mirror discards vector clocks, assignment stamps and
versions. Public native reads also expose payload-free deletion records.
Four unchanged-API regressions fail against that exact parent and pass after
the correction. Reproduce with
`python3 -B experiments/issue-56/native-rich-check.py --before`, then run the
same command without `--before` for the final checks.

`record_sync` validates both inputs and merges the native finite structured
value model using the production JavaScript assignment order. It shares the
core's original-clock ranking, retains joined observations separately,
canonicalizes child unions and nested payload keys, handles absent clocks and
versions, and rejects malformed clocks, stamps and deletion records.
`ServerState::apply_remote` validates before changing state, excludes secrets
and the local schema record, and commits rich records and their typed mirror
under one mutex. Public reads hide deletion records; `sync_records` retains
their payload-free clocks for subsequent replication. Existing owner writes
keep their established API while retaining valid synchronization metadata.

Run `node experiments/issue-56/native-rich-vectors.mjs --check` to verify
twenty-seven finite fixtures against actual production JavaScript. Rust checks
all six delivery permutations, both groupings, duplicate delivery and input
preservation for each. Further cases cover eighteen malformed shapes in both
argument orders, nonfinite values, bounded excessive nesting, stale deletion
replay, recreation, private-record isolation and three concurrent admissions.
Twenty-six number-string examples check the decimal/scientific boundary,
negative zero, subnormals, large integers and finite extremes directly against
JavaScript. These finite examples are evidence, not an exhaustive proof of
every floating-point conversion or every JavaScript-specific value type.

The focused probe compiles only the real standard-library core, JSON reader,
state and register modules. It runs five mirror/number tests and four rich
integration tests. The shared typed register additionally passes eight
regressions and thirteen generated reference cases; the reused reader's three
existing unit tests also pass. `--clippy` checks the same targets with warnings
as errors. Compiles run sequentially without debug information. Full Cargo
builds and runtime/browser matrices remain on the hosted runner. Recorded child
peak RSS is 175,076 KiB for focused tests and 190,524 KiB for Clippy, within the
container's 3,135,369,216-byte limit.

## Observed hosted failure and duplication correction

Parent Checks run [43483668506](https://github.com/link-foundation/meta-sovereign/actions/runs/43483668506)
started at 2026-11-13 18:32:47 UTC on the exact parent above. Lint job
`132087249139` passes formatting and reports five nonfatal ESLint warnings,
then fails the unchanged 6.5% duplication limit: 42,655 duplicated lines out
of 648,641 (6.58%). The preserved complete job log records totals at line 14815
and the threshold error at line 14611. Dependent runtime/Rust jobs were skipped;
this run cannot verify
the earlier Bun fixture correction.

Generated typed Rust fixture literals contributed repeated code. Their inputs
and JavaScript expectations now live in JSON consumed by one helper, retaining
all thirteen individually named tests and every permutation assertion.
Fourteen evidence collectors also share the existing deterministic entry
writer. Twenty-eight finite comparisons read their original implementations
from already published archives, so verification works in shallow CI checkouts.
They prove identical gzip bytes, hash manifests and printed output. The prior
writer's four refusal/order cases remain enforced. No threshold, exclusions,
historical archives or acceptance assertions change.

The final local scan passes at 42,163 duplicated lines out of 649,818 (6.49%)
with the same configuration. New-head hosted checks remain required.

Sources, exact-parent failures, final focused checks, resource measurements,
complete failing CI logs and duplication output are preserved in the
[evidence archive](data/native-rich-register.tar.gz) and its
[hash manifest](data/native-rich-register.tar.sha256.json). The hosted workflow
checks both fixture generators and the archive-writer comparison.

## Remaining acceptance criteria

This is an in-memory admission boundary. It does not wire the native WebSocket
inbox into state, acknowledge durable application, reconcile initial/offline
records, persist rich causal metadata, gate native peers by schema, stamp native
owner edits or retain native owner-delete clocks. Those requirements, automatic
editable-tab merging, all unchecked original reference features and exact new
head hosted verification remain unfinished. PR #57 stays draft and unmerged.
