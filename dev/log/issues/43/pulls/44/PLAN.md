# Issue 43 / PR 44 work plan

Objective: implement and verify every issue requirement in this PR, preserving evidence here. Work only on `issue-43-1924384484c0`; keep the PR unmerged.

- [x] Verify branch, working tree, repository instructions and contributing rules.
- [x] Read complete issue, comments, sub-issue list, PR conversation, inline comments and reviews (all empty at initial collection).
- [x] Download original workflow logs, jobs, annotations and relevant artifacts; record timestamps and commit SHAs.
- [x] Inventory every local workflow and CI helper/configuration; compare full file trees and relevant files from JavaScript, Rust and Python templates at recorded revisions.
- [x] Read the referenced CI/CD best practices; research primary sources and existing components.
- [x] Build requirement/evidence matrix and event timeline; identify actual causes, candidate fixes and verification for each finding.
- [x] Add minimal reproducing tests before fixes; keep reusable probes under `experiments/`.
- [x] Implement fixes across every affected path without removing features or disabling gates. Add opt-in diagnostics if evidence is insufficient.
- [x] Run only focused local tests/checks with limited concurrency and save logs. Leave full suites, stress and runtime/browser matrices to CI.
- [x] Add a changeset/release trigger where appropriate; commit useful atomic steps and push only the prepared branch.
- [x] Report reproducible shared defects to relevant template/upstream projects, including workarounds and code suggestions.
- [x] Update PR title/body with reproduction, fixes, test evidence, limitations and `Fixes #43`.
- [ ] Review fresh CI by timestamp/SHA; preserve logs from failures and fix actual errors until required checks pass.
- [ ] Merge latest default branch if needed, review full PR diff for regressions, verify clean tree, refresh feedback and mark PR ready.

Constraints: no full local suite or stress tests; no real user accounts/data in tests; no merges to main; no rewrites of history; memory budget 2.92 GiB shared (Rust jobs=1 if needed). Read files over 1500 lines in chunks. Preserve long output as files, wait for running commands, and never treat passing CI as proof of unmet criteria.

Additional review findings: v27 configuration/API migration, native checksummed arm64 FPM instead of the obsolete system workaround, immutable evidence excluded from maintained shell selection, and unknown Git errors fail in both desktop/source versioning paths. Each has focused evidence.

- [x] A15: remove the staged updater warning through a scoped, exact, compatible two-argument comparator alias. Clean installation/audit and the actual updater cache pass; validate it on every CI target. Published upstream candidates and initial unsuccessful investigations remain preserved.
- [x] Isolate Windows Deno native AES access violation (0xC0000005), preserve the bounded reproduction, report upstream and select the existing WASM backend before application initialization. Focused regressions pass; final runtime verification remains tracked above.
- [x] Reproduce DEP0190 from successful Windows packaging logs; replace every raw-shell npm/npx caller with the exact existing cross-spawn component, preserve failure semantics, and verify literal arguments/deprecations-fatal execution.
- [x] Reproduce nested archived lint-staged task discovery, verify automatic rollback/reference hashes, pin the root hook configuration and add an owned real-Git regression that retains maintained-file checks.

- [x] Reproduce shared GitHub fixture shutdown on an incomplete request, close owned connections without increasing deadlines, and retain default-off teardown tracing.
- [x] Preserve repeated no-runner macOS ARM failures and select the supported native Intel pool for the affected Node/WebKit jobs while retaining every gate and ARM coverage elsewhere.

- [x] Inspect successful Checks job logs, repair Rustdoc bare URLs, require warning-free docs in all three build paths, and isolate the LF fixture from global Windows line conversion with before/after probes.

- [x] Follow the next successful Windows Deno log to the remaining server-fetch teardown; reproduce TCP/HTTP shutdown and migrate all owned network fixtures to the shared helper. Focused 50 Node, 34 Deno/50-step and 20 mail-security tests pass.
- [x] Forward-merge main `7630669`, retain all message-history features and run eight focused storage/API cases; require its browser coverage in both 41-suite engine manifests.

- [x] Merge main `fbf377b` without conflicts; retain single-write storage failure semantics and pass 19 focused message-version/store-append cases. Windows Deno verifies all 3279 tests after teardown/warning fixes; no runtime case is deferred.

- [x] Preserve F19 native WebKit missing-card failure, repair the proven diagnostic gap, retain a focused phone reproduction selector, and verify the phone sequence through Playwright MCP without claiming the historical cause.
- [ ] Review new source `6526815` native WebKit diagnostics and all required CI; preserve failures and continue any proven fix.

- [x] Forward-merge main release `a58fdab` (0.55.0), retain the pending patch changeset, reproduce four false-green browser skip variants and fix their common gate. Fourteen Node contracts and six selected Deno cases pass.

- [x] F21: preserve all three post-archive Bun failures; reproduce foreign test discovery with bounded owned sentinels, scope the actual Bun configuration to js/tests, verify 15 focused Bun contracts, refresh pinned comparisons and report shared template defect as issue 269.
- [ ] Verify the complete post-F21 runtime/browser/native matrix on the final source and record the fresh run links in PR 44.

- [x] F22: preserve failed standalone CodeQL context despite four successful workflows, reproduce both release-script defects, repair literal message handling and exact badge identity, verify 13 relevant Node tests, compare existing upstream repair without duplicate reports.
- [x] F23: reproduce and repair missing commit-wide service-check evidence with a finite offline two-page annotation regression; retain full SARIF and every existing GitHub alert without claiming a zero-alert product audit.
- [ ] Require every fresh PR check context, including standalone CodeQL, to pass on the final head before readiness.

- [x] F24: preserve Windows Node whole-lifecycle timeout, reproduce a false idle-socket attribution with a held flush, retain socket deadlines and final persistence, add default-off shutdown-stage tracing and four-language docs; pass 13 relevant server/fixture tests, 14 CI contracts and workflow lint.
- [ ] Verify every required context on the post-F24 head, review current artifacts/logs, refresh main/feedback and mark ready only after the complete matrix passes.
