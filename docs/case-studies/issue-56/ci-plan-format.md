# CI plan formatting refusal

Published commit `ff8cfc1026f88ca095261d1729dd1264b862cfd6` failed
[Checks and release](https://github.com/link-foundation/meta-sovereign/actions/runs/43798379362)
on 2026-11-16. Its lint job's preserved log, lines 503–505, identifies only
`docs/case-studies/issue-56/PLAN.md` as incorrectly formatted. Dependent browser
jobs skipped; this run supplies no browser acceptance evidence.

The new introductory paragraph had removed the blank line before the first
list to retain the 1,500-line documentation limit. Prettier requires that blank
line. Move the introductory content into the existing browser-history paragraph
and retain the list separation. The file stays exactly 1,500 lines, the scoped
Prettier check passes and `git diff --check` passes. No acceptance row changes.

The checked archive preserves the failed job log, parent and corrected plan,
and local formatting receipt. All original incomplete requirements remain
required; PR57 remains draft and unmerged. Fresh exact-head workflows must pass
before the earlier browser corrections can be accepted.
