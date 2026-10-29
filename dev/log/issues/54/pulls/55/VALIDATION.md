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
| pr-pagination-before.log / pr-pagination-after.log | A 31st related PR is lost before pagination; all 11 release tests pass afterward, including the second API page. |
| fenced-commit-before.log / fenced-commit-after.log | Commit-shaped code examples wrongly trigger a refused lookup before repair; all 12 release tests pass after sharing the fence scanner with metadata extraction. |
| release-after.log | 23 focused release/helper tests pass at the initial implementation checkpoint. |
| cache-after.log / cache-release-after.log | Cache/writer policies and related release regressions pass. |
| cache-ref-before.log / cache-ref-after.log | Cross-ref cache identity fails before repair; both cache policies and both existing writer policies pass afterward (4 tests). |
| zizmor-after.log / zizmor-final.log | Full `.github` scan reproduces 5 Dependabot cooldown findings; pinned zizmor 1.31.1 passes after configuration fixes. Earlier CI self-repository errors are preserved in the failed-job API log. |
| actionlint-self-before.log / actionlint-self-after.log / actionlint-compatibility.log | Real pinned Docker checker reproduces 11 valid-syntax false positives; the narrow compatibility fix passes. Unknown references and real ShellCheck errors still fail. |
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

Earlier source checkpoints had queued, cancelled or failing checks. In particular, fresh CI exposed zizmor's self-repository requirement and actionlint's older syntax parser; both failures, their complete job logs and the subsequent repairs are retained. They do not validate replacement commits.

## Verified implementation checkpoint

All five workflows passed for **78789d7451e34a2856f3ab47de42255bb1737e34**, created **2026-10-29 08:59:29 UTC**, after the final source commit. The last required gate completed at **09:18:54 UTC**. `metadata/source-passing-runs.json` and `validation/source-passing-checks.json` retain the exact-SHA verification: **49 passing checks, six expected skips, no failures or pending checks**.

| Workflow | Result / run |
| --- | --- |
| Checks and release | [Success, 40846140276](https://github.com/link-foundation/meta-sovereign/actions/runs/40846140276) |
| Desktop release | [Success, 40846140295](https://github.com/link-foundation/meta-sovereign/actions/runs/40846140295) |
| Deploy to GitHub Pages | [Success, 40846140249](https://github.com/link-foundation/meta-sovereign/actions/runs/40846140249) |
| Scheduled security audit | [Success, 40846140246](https://github.com/link-foundation/meta-sovereign/actions/runs/40846140246) |
| Broken Link Checker | [Success, 40846140219](https://github.com/link-foundation/meta-sovereign/actions/runs/40846140219) |

This includes all nine Node/Bun/Deno and operating-system combinations, Chromium and WebKit, Rust tests/lint/docs, package smoke, both container builds, backup stress coverage on CI, all five desktop build targets, workflow/security linting and archive verification. The six skips are main-only release/instant-release, changeset PR creation, desktop publication, Pages deployment and deployed-site browser checks. PR validation does not publish a live release or deploy a site.

The remaining annotations are notices: credential isolation on PRs, ad-hoc macOS signing without publication secrets, hosted macOS ARM capacity, and the link report location. Capacity notices did not prevent any required job from completing. Original historical warnings and their dispositions are in ROOT-CAUSES.md.

The complete maintained-file diff and PR patch were reviewed. The fetched default branch **04f2081bdb48ee37b422a65c112c0e36cb70470d** is an ancestor. Refreshed issue/sub-issue and all three PR comment/review APIs remain empty. No original feature was removed; the prepared root `.gitkeep` placeholder has no runtime role.

## Final evidence commit

The archive contains the complete passing implementation checkpoint above. Its own committing workflow necessarily occurs later; the PR description records that final head SHA and its completed run links. Raw final-head logs are also collected locally in the same ignored evidence directories. This avoids an endless sequence of commits attempting to archive their own future CI results. Finalization requires passing checks on that final evidence commit, a clean tracked working tree and no unfinished commands; passing implementation checks alone are insufficient.
