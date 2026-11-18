# Exact assignment issue proof

The [automated review comment](https://github.com/link-foundation/meta-sovereign/pull/57#discussion_r4534718634), posted **2026-11-11 06:31:16 UTC**, identifies CodeQL alert 57 in the new synthetic source test on `2329461bb6fb7dd0f18d104728735967a70cdd83`. The assertion searched serialized issue records for the instruction URL as a substring. That verifies absence of one literal but gives weaker evidence than comparing the entire publication payload.

The test now requires exactly one published issue, an exactly matching reviewed title, and an exactly matching reviewed body plus the assignment marker. This verifies that private source metadata is not appended to the published issue without treating a URL substring as a host check. Production URL validation is unchanged.

All twelve source checks pass in Node and Deno, with scoped ESLint, formatting and Secretlint. The [archive](data/ci-assignment-source-proof.tar.gz) and adjacent SHA-256 manifest retain the actual alert/review, completed CodeQL job log, preceding assertion and updated test. Clearing the current-head hosted annotation remains a CI verification step. Every other unchecked issue requirement remains required; [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged.
