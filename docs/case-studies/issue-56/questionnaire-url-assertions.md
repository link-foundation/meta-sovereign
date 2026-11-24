# Complete questionnaire URL assertions

Security workflow [43909148185](https://github.com/link-foundation/meta-sovereign/actions/runs/43909148185)
on `3fee602d25f2e4b7720ff43d3c956de8a4a947ed` finished with three
`js/incomplete-url-substring-sanitization` findings. Raw job 133445977958,
lines 11205–11209, names the questionnaire unit test, browser helper and MCP
inspection script. Dependency auditing and the other CodeQL languages passed.
The complete findings and job log are retained in the evidence bundle.

These checks verified a proposed GitHub contact by substring. They now require
the entire whitespace-delimited HTTPS URL, with the hostname dots escaped and
both boundaries checked. Prefixes, extra hostname/path characters and query
suffixes cannot satisfy the expected fixture contact. Salary, email, all
questionnaire components, review state, native form non-mutation, ownership and
cleanup checks remain intact. No finding is suppressed and no security gate
is weakened.

All four focused questionnaire tests and the isolated native questionnaire
browser scenario pass. Scoped ESLint is clean. Production answer behavior is
unchanged by this test correction. Hosted CodeQL on the published correction
must confirm that the findings are resolved. The byte-verified
[`data/questionnaire-url-assertions.tar.gz`](data/questionnaire-url-assertions.tar.gz)
and adjacent manifest retain the exact parent checks, three findings, raw
failure, corrected checks and focused receipts. The original issue remains
unfinished in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
