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

## Backup cleanup failure in the repair matrix

The fresh [repair Checks run 40793790696](https://github.com/link-foundation/meta-sovereign/actions/runs/40793790696) tests exact source `2f24894801211a1be01e3552e2643789148f3657`. Its Bun/macOS lane exposed an independent backup cleanup race. `ci-logs/repair-bun-macos-40793790696.log`, lines 4518–4546, records `a failed write leaves no archive and no temp file` finding a leftover `.tmp` file. The new release-lock regression passed in that same lane (line 5022).

The actual backup pipeline includes gzip and an async-generator encryption/header stage. Bun 1.4.4 can reject this pipeline while its destination's asynchronous file open is still pending. Cleanup sees ENOENT, then the pending open recreates the temporary file. `experiments/issue50-bun-pipeline-close.mjs` reduces this to standard stream and filesystem APIs, with 20 tiny sequential attempts and explicit final cleanup. It fails under Bun 1.4.4 (`closed=false`, unlink ENOENT, then `archive.tmp` remains) and passes under Node 26.12.1. The new `js/tests/durable-stream.test.js` also fails against the previous helper and passes with the repair. Logs: `local/durable-stream-before.log`, `local/bun-pipeline-standalone.log`, and `local/bun-pipeline-node-contrast.log`.

The shared durable-stream writer now observes and awaits the destination's close before unlinking a failed write. This fixes every caller of that helper, preserving atomic rename, fsync and private file permissions. It also waits for close on success. This agrees with Node's documented [pipeline close semantics](https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-callback); no additional dependency is needed. Retrying unlink or delaying for an arbitrary duration would leave the ordering race unresolved.

Focused verification: the new bounded regression passes under Bun and Node; the exact original Bun failure passes; four existing Node backup tests pass, covering ordinary/encrypted round trips, failed writes and writes during backup. No local large-backup test or full runtime matrix was run. Logs: `local/durable-stream-after.log`, `local/durable-stream-node-after.log`, `local/backup-cleanup-after.log`, and `local/backup-focused-after.log`.

Existing Bun issues 44770 and 45724 describe different pipeline hangs. After reviewing them, the early-rejection/file-open race was reported with the executed standalone reproduction, affected versions, local workaround and proposed lifecycle correction in [oven-sh/bun#47277](https://github.com/oven-sh/bun/issues/47277). This report does not claim to have traced Bun's internal implementation.

## Outstanding delivery constraint

PR 51 is already merged. The tested correction remains on the authorized `issue-50-d289f94d6edd` branch. A merged GitHub pull request cannot integrate another commit. Opening a follow-up PR would depart from the user's explicit single-PR requirement, so that exception requires authorization. No second PR or direct main push is implicit in this report. Default-branch release success, publication and completion of issue 50 remain unverified until the correction is integrated and the resulting main workflows pass.
