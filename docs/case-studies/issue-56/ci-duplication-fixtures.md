# Preserve the duplication gate by sharing sticker fixtures

At `3fee602d25f2e4b7720ff43d3c956de8a4a947ed`, main workflow
[43909148654](https://github.com/link-foundation/meta-sovereign/actions/runs/43909148654)
failed its lint/format job, 133446896597. ESLint and formatting passed; the raw
job log at lines 18321–18327 reports 51,776 duplicated lines out of 794,408,
or 6.52%, above the existing 6.5% limit. This blocked the downstream matrix.

Three sticker browser scenarios repeated the same store/server/browser setup,
catalogue data and catalogue routes. They now use one fixture factory, with
fresh mutable data and an isolated memory store, temporary directory, ephemeral
server and browser for every invocation. Their scenario assertions, sends,
refusal paths, time limits and final cleanup remain in their original entry
points. Existing CI still runs all three scenarios in its browser matrix.
An optional existing-browser executable override follows the shared browser
runner's convention.

The focused local sticker-search scenario passes, including catalogue routing,
search and send behavior. Scoped ESLint passes without warnings, and the actual
repository duplication check passes with the original configuration. The
configuration, threshold and file exclusions are unchanged. The raw hosted
failure, exact parent source, corrected source and focused checks are preserved
in [`data/ci-duplication-fixtures.tar.gz`](data/ci-duplication-fixtures.tar.gz)
and its adjacent byte-verified manifest. Full scenario and runtime coverage is
left to CI on the published correction; this is not an issue-completion claim.
