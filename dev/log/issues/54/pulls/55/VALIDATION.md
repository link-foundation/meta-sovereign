# Validation and limits

## Reproductions and focused local checks

The following logs are archived under `validation/`. Tests invoke real helpers with fake external APIs and isolated temporary Git repositories; none publish to npm/GitHub or touch a running application server.

| Evidence | Result |
| --- | --- |
| release-before.log | Four failing regressions / one passing before the first repair: literal HEAD payload, wrong version/section, swallowed release lookup failures, unresolved formatter target and destructive Markdown behavior. |
| enrichment-before.log | Two failing / five passing before all-PR metadata and large-body protection. |
| cache-before.log | Implicit setup-node cache policy regression fails before writer ownership changes. |
| fenced-notes-before.log | Fenced version heading truncates the release before the scanner repair. |
| notes-after.log | All 10 release-focused tests pass after the repairs, including CLI status matrices and Unicode/body preservation. |
| release-after.log | 23 focused release/helper tests pass at the initial implementation checkpoint. |
| cache-after.log / cache-release-after.log | Cache/writer policies and related release regressions pass. |
| cache-ref-before.log / cache-ref-after.log | Cross-ref cache identity fails before repair; both cache policies and both existing writer policies pass afterward (4 tests). |
| zizmor-after.log / zizmor-final.log | Full `.github` scan reproduces 5 Dependabot cooldown findings; pinned zizmor 1.31.1 passes after configuration fixes. Earlier CI self-repository errors are preserved in the failed-job API log. |
| fenced-notes-after.log | Minimum fenced-heading regression passes. |
| template-fenced-notes.log | Executed JavaScript and Python template functions both reproduce fenced-heading truncation. |
| template-formatter-403.log | Actual upstream JavaScript formatter exits zero on simulated HTTP 403. |
| workflow-contract.log | Complete terminal-gate coverage and workflow policy contracts pass. |
| changeset.log | Release fragment is accepted by existing changeset validation. |
| eslint.log / prettier.log / commit-*.log | Changed maintained JavaScript and staged formatting pass; commits enforce the root pre-commit policy. |

Reproduce the principal local checks:

```sh
node --test --test-concurrency=1 js/tests/ci-github-release.test.js
node --test --test-concurrency=1 js/tests/ci-cache-policy.test.js
node js/scripts/check-ci-workflows.mjs
python3 -B experiments/issue-54/archive.py --verify
```

The mock POST explicitly checks the full SHA of the newly created version commit, not merely a string resembling a hash. Refused/unknown status checks ensure no POST/PATCH/format operation is attempted. No full local test suite, stress probe, runtime/browser matrix or Rust build was run. Finite note fixtures and streaming archive compression respect the shared 2.92 GiB memory limit.

## CI checkpoint policy

Fresh checks must match the pushed SHA and start after its commit. `metadata/branch-runs-*.json` and `github/runs-*.json` preserve the checkpoints. Superseded or cancelled runs are historical evidence and do not validate a replacement commit. Queued jobs remain unverified. Full CI includes Node/Bun/Deno on all configured operating systems, both browsers, Rust, packaging, security, links, Pages and workflow linting.

At report preparation, source commits `64428d1` and `cd91295` had passing Pages/link jobs while other checks were queued/in progress. This is a progress checkpoint, not a claim that the final PR passed. The final exact-SHA results and any failures are recorded below during finalization.

## Final checkpoint

Pending final pushed-source CI, archive verification, full PR diff review and clean-tree check. This explicit pending state must be replaced with actual verification evidence before the issue is called complete.
