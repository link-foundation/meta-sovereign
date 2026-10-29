# Issue 54 / PR 55 work plan

Objective: fully implement and verify issue 54 and required sub-issues in this PR; retain complete evidence, keep external blockers explicit and leave the PR unmerged.

- [x] Verify prepared branch and clean starting state; read AGENTS.md and contributing instructions.
- [x] Read complete issue, all issue comments, PR conversation/inline comments and reviews.
- [x] Inventory required sub-issues and every acceptance criterion, including execution instructions.
- [x] Preserve all six cited workflow runs, failed-job annotations, artifacts and complete logs; collect current branch runs with timestamps and SHAs.
- [x] Read failure logs in chunks of at most 1500 lines; identify each error, warning and false result with evidence locations.
- [x] Read complete Hive Mind CI/CD best practices and inspect all three template trees at immutable commits; compare every workflow/helper/config path, including template-only files.
- [x] Study recent related PRs and existing implementations; search authoritative online documentation and reusable components.
- [x] Reconstruct timeline and root causes; document alternatives and solution plans per requirement.
- [x] Add minimum failing regressions before each logic fix; keep reusable offline experiments in experiments/issue-54/.
- [x] Apply fixes across all affected paths; add opt-in safe diagnostics only where actual causes remain uncertain.
- [x] Report reproducible shared upstream defects with workarounds and code suggestions; preserve references.
- [x] Run focused local tests sequentially and changed-file lint/format/contracts, respecting memory limits. Full matrices and stress tests run only in CI.
- [x] Update requirement records and CI operations documentation in four languages if needed; add changeset when applicable.
- [x] Commit atomic steps, integrate latest main, push only issue-54-8f98d199c8b1.
- [ ] Inspect fresh exact-SHA CI runs, download all nonpassing logs and diagnostics, resolve all locally actionable failures; verify every required check.
- [ ] Preserve checksummed compressed evidence without expanding GitHub's diff limit; review complete PR diff and ensure requirements match code/tests/description.
- [ ] Update PR title/body with closing references, reproduction and validation evidence; remove placeholder and mark PR 55 ready once implementation is complete.
- [ ] Verify clean working tree, no outstanding commands, and final requirements evidence before marking goal complete.
