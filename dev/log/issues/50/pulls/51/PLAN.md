# Issue 50 / PR 51 work plan

Objective: fully update all dependencies and toolchains, fix regressions from merged Dependabot PRs, verify all acceptance criteria, and preserve evidence in this folder. Commit and push only on issue-50-d289f94d6edd. Integrate through PR 51 after its checks pass, then verify default-branch CI as explicitly required by issue 50.

- [x] Read root AGENTS.md and verify branch and clean starting state.
- [x] Read complete issue, issue comments, and PR conversation/inline/review feedback.
- [x] Archive GitHub inputs; inventory requirements and required sub-issues.
- [x] Read contribution/release instructions, all manifests, locks, workflows, embedded pins, Python/Swift sources, and recent related merged PRs.
- [x] List recent main/PR CI runs with timestamps and SHA; preserve failing logs and identify actual failures.
- [x] Research dependency-update best practices and current official registry releases and major migration guides.
- [x] Inventory every direct/transitive dependency, action, image, runtime, and toolchain with original/current/latest version and reasons for exceptions.
- [x] Update JavaScript first; regenerate npm lock; reproduce any logic regressions before fixing them.
- [x] Update Rust manifests/toolchain/edition/lock and adapt APIs.
- [x] Audit Python and Swift scripts and add manifests only if they have external dependencies.
- [x] Update Docker images and all workflow/reusable action/runtime pins consistently.
- [x] Verify Dependabot covers all real dependency manifests and directories.
- [x] Search upstream reports for workarounds, duplicated general logic, missing features and bugs; report supported findings with repros and link them.
- [x] Run focused local tests and required lint/format checks with limited concurrency; preserve logs. Full suites/build/browser matrices run in CI only per AGENTS.md. Keep test fixture servers isolated.
- [x] Run applicable security audits and resolve findings, new deprecations, and compatibility issues.
- [x] Add release changeset; commit independent useful steps and push only the prepared branch.
- [x] Review final PR CI for exact latest SHA; all five workflows passed at a07bac8f.
- [x] Review gh pr diff, preserve existing features, ensure current main is included, update PR title/body with reproduction/validation/closing keyword.
- [x] Verify clean tree and PR CI green; mark PR 51 ready.
- [ ] Integrate the verified PR through GitHub and verify every applicable default-branch workflow; preserve its exact SHA and results.
- [x] Preserve and investigate main release failure 40790628774 at dc30f00a; reproduce legacy-peer lockfile pruning before repairing both versioners.
- [x] Verify focused regression and guard tests (7 passed) and both actual release entry points in disposable fixtures; retain the strict release guard.
- [ ] Commit and push the repair on the original authorized branch; resolve the single-PR delivery constraint before opening a second PR.
- [ ] Integrate the repair through an authorized PR, verify main release and desktop publication, and close issue 50 only after all acceptance criteria pass.

Resource rules: no full suite, stress tests, or browser/runtime matrices locally. Rust builds sequentially with CARGO_BUILD_JOBS=1 and reduced debug if needed. Stop repeating memory-killed builds and use CI. Save large output to logs; read files above 1500 lines in bounded chunks. Keep experiment scripts in experiments/. Wait for every background command before finishing.
