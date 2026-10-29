# Issue 52 investigation and implementation

[Issue 52](https://github.com/link-foundation/meta-sovereign/issues/52) · [PR 53](https://github.com/link-foundation/meta-sovereign/pull/53)

The failed release re-resolved a validated lockfile while bumping its version,
removed a peer package, and was correctly rejected by the source-tree guard.
The audit also found green CodeQL uploads containing 50 alerts, missing desktop
evidence accepted as success, repeated Node Web Storage warnings, and incomplete
cross-workflow writer serialization/retry policy. These paths have fixes and
regressions in this PR. The two intentional regex constructs remain covered by
explicit, whole-file-hash-pinned audit decisions; queries remain enabled.

- [Analysis and timeline](ANALYSIS.md): causes, alternatives, chosen fixes and warning disposition.
- [Requirement inventory](REQUIREMENTS.md): each issue and execution requirement mapped to evidence.
- [Full template comparison](TEMPLATE-COMPARISON.md): all three trees and all 17 Hive Mind principles.
- [CodeQL findings](CODEQL-FINDINGS.md): every original alert, location and resolution.
- [Validation](VALIDATION.md): reproductions, focused local checks and exact-SHA CI results.
- [Upstream reports](UPSTREAM.md): reproducible shared defects and existing action warning reports.
- [Work plan](PLAN.md): completion checklist.

## Evidence archive

`evidence.tar.gz` contains the unabridged logs, API responses, downloaded diagnostic
artifacts, immutable template source trees, complete per-file comparisons, SARIF,
and local before/after checks. `evidence-files.sha256` inventories every member;
`evidence.sha256` verifies the bundle and inventory. Raw directories are ignored
to avoid thousands of duplicated tracked reference files. This is preserved
source evidence, not an executable dependency.

Extract into a temporary directory, then verify from there:

```sh
mkdir /tmp/issue52-evidence
tar -xzf dev/log/issues/52/pulls/53/evidence.tar.gz -C /tmp/issue52-evidence
(cd /tmp/issue52-evidence && sha256sum -c /path/to/evidence-files.sha256)
```

The archive builder additionally extracts into a fresh temporary directory and
verifies every member digest. Installer binaries from repeated PR packaging runs
are not diagnostic logs: their complete API metadata (size, digest, artifact URL)
is retained; browser/CodeQL/docs diagnostics are downloaded. All six cited run
logs and all available completed branch-run logs are retained. Active-run
snapshots are labeled with timestamps and SHAs, never treated as completed passes.

Reusable collectors and bounded probes live in `experiments/issue-52/`:
`collect.py`, `compare.py`, `probe-lockfile.py`, `rehearse-release.mjs`,
`rehearse-push.mjs`, and `archive.py`. Collection uses authenticated GitHub APIs
with pagination; template snapshots include all blobs and untruncated trees.
