# Default-branch release verification and repair

Issue 50 remains incomplete until the default-branch release succeeds. PR 51 was merged before its main-only release path had been verified; that integration was premature.

## Verified results

All five workflows passed for the final PR source `a07bac8fe56ead12ae56916f21108a38d7271378`, including all nine runtime/OS combinations, 41 Chromium and 41 WebKit browser checks, five desktop targets, Rust, Swift, security, documentation and packaging checks. See the [Checks run](https://github.com/link-foundation/meta-sovereign/actions/runs/40788640783) and the final results table in [PR 51](https://github.com/link-foundation/meta-sovereign/pull/51).

On merge commit `dc30f00aefb2c1a89c64bf7e7fa78ef80a860fe7`, all test and validation jobs passed again. Pages, links and security also passed. The [main Checks run](https://github.com/link-foundation/meta-sovereign/actions/runs/40790628774) failed only when release version synchronization changed the validated lockfile. The desktop workflow correctly skipped publication after that failure; its successful conclusion is not evidence of a published desktop release.

## Root cause and reproduction

The preserved `ci-logs/main-release-40790628774.log`, line 471 (full workflow log line 76652), reports `Error: Package configuration changed after validation: package-lock.json`. Versioning created an unpushed CI-local commit; neither that commit nor the proposed 1.0.0 release was published.

Both release entry points ran `npm install --package-lock-only --legacy-peer-deps`. With the updated dependency tree, this removes the validated peer-only `electron-builder-squirrel-windows@27.0.0-alpha.13` entry. The strict release guard correctly refuses that dependency drift. This is a local use of a documented npm mode, not an established upstream defect: npm documents that [legacy peer resolution ignores peer dependencies](https://docs.npmjs.com/cli/v12/using-npm/config/#legacy-peer-deps).

Run `node experiments/issue50-release-lock.mjs` to compare legacy installation, normal installation and metadata-only versioning in disposable copies of the real manifest and lockfile. Legacy installation fails the tree comparison; the other two preserve it. Run `node experiments/issue50-versioners.mjs` to exercise both actual release scripts in disposable fixtures. Neither experiment modifies the user's package or running server.

## Repair and alternatives

The shared `syncReleaseLock` helper invokes `npm version <current-version> --allow-same-version --no-git-tag-version --ignore-scripts` through the existing Windows-safe command wrapper. npm provides [version and lockfile metadata synchronization](https://docs.npmjs.com/cli/v12/commands/npm-version/), so release scripts no longer duplicate installation logic or resolve dependencies after validation. Both changeset and instant releases use it. The guard remains unchanged.

Normal `npm install --package-lock-only` also passed the immediate experiment, but unnecessarily re-resolves dependencies during a version-only operation. Manually rewriting lockfile version fields would duplicate npm functionality. Weakening the validation guard would permit untested dependencies to ship. Metadata-only versioning avoids those problems.

## Regression evidence

- `js/tests/ci-release-lock.test.js` fails with the previous legacy install command and passes with the helper. It uses the real checked-in lockfile and compares every non-version field, including validated peers.
- `node --test --test-concurrency=1 js/tests/ci-release-lock.test.js js/tests/ci-release-tree.test.js js/tests/command-process.test.js js/tests/ci-release-format.test.js`: 7 passed, 0 failed. Existing negative cases still reject source and dependency drift.
- Both complete production version-and-commit flows pass: changeset version 1.0.0 and instant version 0.55.1 preserve the validated dependency tree, pass the unchanged guard, and push to disposable local bare Git remotes. No GitHub branch is changed by these fixtures. Logs: `local/release-versioners.log` and `local/release-lock-contrast.log`.
- Focused ESLint, Prettier and `git diff --check` pass. Full runtime/browser matrices remain CI work, as required by AGENTS.md.

The supplemental archive beside this report preserves the failed main run and the new local evidence. The original `evidence.tar.gz` remains the explicitly dated pre-final-push snapshot.

## Outstanding delivery constraint

PR 51 is already merged. The tested correction remains on the authorized `issue-50-d289f94d6edd` branch. A merged GitHub pull request cannot integrate another commit. Opening a follow-up PR would depart from the user's explicit single-PR requirement, so that exception requires authorization. No second PR or direct main push is implicit in this report. Default-branch release success, publication and completion of issue 50 remain unverified until the correction is integrated and the resulting main workflows pass.
