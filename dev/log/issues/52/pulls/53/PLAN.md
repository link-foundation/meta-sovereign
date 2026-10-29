# Issue 52 / PR 53 work plan

Objective: implement and verify every requirement of issue 52 in PR 53, preserve
evidence here, and leave a clean, ready pull request with passing CI.

- [x] Verify branch and working tree; read issue and all PR comment types.
- [x] Archive all six cited workflow runs, jobs, annotations and complete logs;
      collect current branch runs and recent related merged PRs.
- [x] Snapshot full trees and all CI/config/script files from the JavaScript,
      Rust and Python templates at immutable SHAs, plus Hive Mind best practices.
- [x] Inventory every issue requirement and every local CI/CD file; compare the
      templates and classify applicable, already implemented and inapplicable
      practices with evidence. Reconstruct the event timeline.
- [x] Diagnose every error/warning and false result using log line references;
      research primary sources and existing tools; report confirmed shared
      template bugs upstream with reproduction, workaround and code suggestions.
- [x] Add minimal failing regressions before fixes; implement fixes throughout
      affected paths, retaining useful opt-in diagnostics with defaults off.
- [x] Run focused tests at concurrency 1 and changed-file lint/format checks;
      keep tests isolated from the running application. Do not run full suites,
      browser matrices, stress probes or memory-heavy builds locally.
- [x] Add release changeset and requirement documentation; commit atomic steps
      and push only issue-52-966c0184cc29, preserving history.
- [x] Read fresh CI runs by timestamp and SHA, save nonpassing logs and iterate
      until all required CI checks pass. Use CI for broad runtime/browser checks.
- [ ] Review PR diff for scope/regressions; verify main is incorporated, refresh
      all comments, update PR title/body with reproductions, tests and Fixes #52,
      verify clean tree, and mark PR 53 ready without merging.

The archive includes the original six runs, development failures, the missing
CodeQL configurations and failed scheduled scan discovered during final review,
and successful verification of both scan families at `1868964c`. Safe-SVG and
greeting compatibility repairs each have a failing/passing regression. Complete
diff review found the latter before finalization. The last checkbox is
deliberately pending in this immutable snapshot: final-head CI and readiness
are recorded on the live PR after the evidence commit, as VALIDATION.md explains.
The collection also preserves the later RFC self-redirect failure, direct-format
HTTP probes, upstream report #577 and the repair in all four email translations.
All final-head workflows must pass again before readiness.
Passing workflow logs were also searched for executed warnings: 21 remaining
transitive storage warnings led to a focused trace, two failing regressions,
lazy session exports, 104 passing consumers and two upstream reports. Final logs
must confirm those warnings are absent, alongside the workflow verdicts.

Collection started 2026-10-29. Initial branch head:
`b22541e5603e5a9fdcc69f4cb151d90062d1e9a6`; issue's main head:
`dc30f00aefb2c1a89c64bf7e7fa78ef80a860fe7`. No issue comments, PR conversation
comments, inline comments or reviews existed at collection time. No required
sub-issues are linked in the original issue.
