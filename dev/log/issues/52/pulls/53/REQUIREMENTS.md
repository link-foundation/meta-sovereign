# Issue 52 requirement inventory

The initial issue has no comments or required sub-issues. PR conversation,
inline review comments and reviews are collected separately and refreshed before
completion. All requirements below belong to the single existing PR 53.

| ID | Requirement (including prose and execution constraints) | Implementation / verification evidence |
| --- | --- | --- |
| 52-01 | Investigate every cited main workflow, not just the red run. | All six full logs, run/job metadata, annotations and available diagnostic artifacts; ANALYSIS.md timeline and warning table. |
| 52-02 | Find/fix every CI error, warning, false positive and false negative. | Root-cause sections for lock resolution, CodeQL verdict/findings, storage, desktop evidence/notices, writer queues/retry; CODEQL-FINDINGS.md covers all 50 initial alerts. External action warning uses a narrow regression-tested workaround; managed certificate-bundle diagnostic is explained from OpenSSL semantics. |
| 52-03 | Compare all files in JS, Rust and Python templates, including every workflow/helper. | All 805 files from untruncated recursive trees downloaded; per-file hashes/counterparts/diffs and complete workflow/helper role mapping in TEMPLATE-COMPARISON.md. |
| 52-04 | Reuse applicable best practices across the entire codebase. | All five workflows/34 jobs inventoried; both version modes, both CodeQL paths, both storage selectors and all maintained preference callers covered. Language-specific/sample-only roles explicitly mapped rather than copied as unrelated products. |
| 52-05 | Follow the Hive Mind CI/CD document. | All 17 principles mapped to implementation and evidence, including cross-workflow writer serialization, race recovery, actual merge validation, early preflight, native builds and observable downstream skips. |
| 52-06 | Report defects also found in templates/related projects. | JS #270, JS #266, Python #122, Rust #221 and deploy-pages #413/#434. UPSTREAM.md links reports/comments, reproductions, workarounds and code suggestions. |
| 52-07 | Collect all investigation logs/data in dev/log/issues/52/pulls/53. | Evidence archive and per-member/bundle SHA256 inventories; original/current CI, research, immutable templates and local before/after results. Installers retain full metadata; diagnostic artifacts are downloaded. |
| 52-08 | Deep online research, sequence of events, requirements, root causes, alternative solutions/plans and existing components. | ANALYSIS.md, timeline, this inventory, TEMPLATE-COMPARISON.md; primary sources and exact-pinned htmlparser2 reused. Existing Changesets, cross-spawn and CodeQL remain. |
| 52-09 | Add useful verbose output when evidence is insufficient; default off. | Root causes are reproduced. CI_SCRIPTS_DEBUG=1 reports version/package counts without secrets; existing browser/package/fixture/lifecycle debug switches remain off by default. Failed gates now name missing evidence/findings and ordinary blocked skips emit notices. |
| 52-10 | Reproduce bugs before fixes and prevent recurrence. | Saved failing version/storage/desktop/security/writer/warning tests, source-tree and SARIF contracts; safe SVG and emoji greeting compatibility have their own failing/passing regressions. Real offline release-mode/layout and concurrent-Git rehearsals run automatically in workflow-contract CI. VALIDATION.md maps before/after logs. |
| 52-11 | Keep local checks focused, concurrency limited and app fixtures isolated. | Relevant files only at test-concurrency=1, isolated temporary repositories/stores; bounded adversarial child probe. Broad runtime/browser/native/stress checks run only on GitHub CI. |
| 52-12 | Preserve history, commit useful atomic steps, only prepared branch, one PR, release trigger. | Forward commits on issue-52-966c0184cc29; one patch changeset serves R-Z34; existing PR 53 updated, default branch incorporated, no merge. |
| 52-13 | Review complete PR, all comments, fresh exact-SHA CI and a clean tree before ready. | Final review/CI evidence recorded in VALIDATION.md; PR title/body, Fixes #52 and ready state checked at completion. |
| 52-14 | Finish every requirement without presenting blocked work as done. | This inventory and final validation report remain explicit about live CI and external ownership. No required sub-issue was discovered. PR remains unmerged. |
| 52-15 | Eliminate the neutral aggregate CodeQL result caused by incomplete PR analysis. | Both workflow families and all eight baseline language configurations run on PRs, including documentation-only changes; ci-codeql-workflows.test.js guards triggers, conditions, language coverage and SARIF verdicts. Final CI checks the aggregate result too. |
| 52-16 | Resolve the stack-string path found by the additional scheduled audit. | Shared first-line, credential-redacted summaries in safeMessage and JSON error normalization; security-findings.test.js reproduces thrown strings, Error.message stacks, CRLF and arbitrary toString methods. No new exception or disabled query. Full failing SARIF and scan logs preserved. |

R-Z34 in all four REQUIREMENTS pages links this investigation. Changes are shared
where the same failure has multiple callers; tests cover real consuming features
rather than weakening the original release/security/runtime gates.
