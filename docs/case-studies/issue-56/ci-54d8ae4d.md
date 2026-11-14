# Automatic Follow browser assertion and CodeQL

The security workflow for commit `54d8ae4d139b0f6fe7e56cb877a40369b2f4359d`,
created at 2026-11-10 07:59:15 UTC, failed in its JavaScript CodeQL gate.
The downloaded [complete log](data/security-42779144630.log.gz) records the
finding at lines 6992–6994: `js/incomplete-url-substring-sanitization` in
`js/tests/e2e-follow-auto-browser.mjs:114`. The test waited for the new run
by searching its text for the expected VK invite URL. It now locates the
exact rendered text, making the expected identity explicit.

The same analysis reported a parser diagnostic at log line 6920 for
`await using;` in `telegram-follow-session.test.js:431`. The promise variable
is renamed to `importing` in both affected shutdown tests so the parser can
distinguish awaiting the import from an explicit resource declaration.
The shutdown assertions and lifecycle remain intact.

Production Chromium passes the corrected automatic Follow scenario. All
10 focused session-migration tests pass. Full CodeQL runs remain in GitHub CI;
the correction needs a fresh exact-head result. The npm and Cargo audit job
passed in the original workflow; this was a test-source analysis finding.

Original run: <https://github.com/link-foundation/meta-sovereign/actions/runs/42779144630>.
PR 57 remains draft while FL08 and the other unchecked issue-wide criteria
are implemented and verified.
