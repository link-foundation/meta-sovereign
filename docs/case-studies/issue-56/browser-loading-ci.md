# Browser loading registration and release validation

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft;
88 of 118 acceptance criteria are verified. This correction accepts no additional
issue criteria.

The checks run 44263206762 began at 2026-11-18 07:59:42 UTC against
`3ff4d3e215a173bcc7a8f5bd5e1694f363e7a204`. Its two independent failures are
preserved in the adjacent `data/browser-loading-ci.tar.gz` and SHA-256 manifest:

- `workflow-contracts-134661799617.log:651` reports that vacancies combines five
  native scenarios. The existing contract limits a browser group to four. The
  new delayed-description scenario accidentally exceeded that limit.
- `changesets-134661799666.log:476` reports two added changesets. Repository
  release policy requires exactly one per PR. The loading note introduced a
  second release file instead of extending the existing one.
- `pipeline-status-134663605548.log:372` and `:373` identify those two failures;
  the aggregate failure is a consequence, rather than another root cause.

The correction registers delayed loading in its own direct Node browser entry
and retains the other six vacancy scenarios. The focused contract checks all
seven identities exactly once, preserves the four-scenario limit and confirms
every mandatory Chromium/WebKit partition retains every registered group.
Browser engine, shard, process and job budgets remain unchanged. The loading
release note is appended to the existing changeset without deleting its earlier
release notes.

The focused partition test fails on the published source (six pass, one fail)
and passes after the correction (seven pass). The changeset validator reproduces
the published two-file failure, then passes with the single combined release
file. Scoped ESLint and formatting pass. Full hosted workflows must verify the
new published commit; success on an earlier commit is not acceptance evidence
for this correction or for the unfinished deferred-question draft.
