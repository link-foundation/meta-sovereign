The security run for `5104793937dce20cd90ddb6a592f7258e90baade`, created
2026-11-17 at 02:23:04 UTC, failed its JavaScript CodeQL gate. Job
133769970218 reports `js/polynomial-redos` in `salary-question.js:90`.
The preserved raw job log identifies the finding at lines 11464–11466;
the SARIF identifies repeated `часов` as the problematic input.

The Russian hourly adjective previously accepted an unbounded non-whitespace
suffix. Repeated prefixes could make the regex reconsider a long suffix at
each position. The matcher now permits at most 32 letters after that prefix.
Ordinary adjective endings and the existing hourly abbreviations remain valid.
Malformed punctuation and arbitrarily long suffixes no longer imply hourly pay.

`salary-hour-word.test.js` fails against published parent `51047939` and passes
with the correction. Its finite repeated-prefix input has 20,000 characters;
the process uses a 384 MiB Node heap limit and concurrency one. The regression
and the existing salary-intent interface checks pass together (seven tests).
No full local suite or CodeQL database build was run. The fresh hosted CodeQL
result is required before calling the security gate verified.

Evidence is in [ci-salary-hour-word.tar.gz](data/ci-salary-hour-word.tar.gz)
and its SHA-256 manifest. This correction accepts no additional inventory row.
PR: https://github.com/link-foundation/meta-sovereign/pull/57.
