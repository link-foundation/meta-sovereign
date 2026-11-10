# Follow fixture secret scan

Run [42751038486](https://github.com/link-foundation/meta-sovereign/actions/runs/42751038486)
was created on 2026-11-10 at 03:41:13 UTC for
`f87a05062d4fcd7a5dfc7891489f0be1c7a2941c`. Its lint job rejected the
deliberately fake Basic Authentication URL in `follow-links.test.js:54`.
The complete preserved log identifies the file at line 12721, the BasicAuth
finding at 12722, and the secret scan exit at 12726. No actual credential
was present. All other selected jobs passed or were skipped by the failed gate.

The test now constructs the same user-information URL using explicit fixture
placeholders. It continues to verify that Telegram link recognition rejects
URLs with user information. All seven focused Follow tests, the focused
secret scan and formatting check pass. No scanner rule or exclusion changed.

The complete workflow log, exact-head job metadata and focused verification
logs are preserved in [the evidence archive](data/ci-follow-fixture.tar.gz)
with a [SHA-256 manifest](data/ci-follow-fixture.tar.sha256.json).
The new commit still requires its own complete CI matrix.
