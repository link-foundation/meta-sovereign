# One release changeset for the complete PR

The exact `0b788c41` main workflow [44034710813](https://github.com/link-foundation/meta-sovereign/actions/runs/44034710813)
fails before its runtime/browser matrix. The downloaded changeset job
`133875089174`, lines 471–483, identifies three added changesets where the
repository requires exactly one. The aggregate job reports that same failure.
The two new salary units added their own files; one also used a scoped package
name rather than the actual `meta-sovereign` package.

Both salary summaries now live in the existing minor changeset,
`.changeset/visible-browser-defaults.md`. The two extra files are removed.
The release type and all existing summaries are retained. Production code,
tests and release validation are unchanged.

The existing validator reproduces the exact-parent failure with
`GITHUB_BASE_SHA=1dc578350c2404b4d6aa12b3530cd3459dae2d1a`,
`GITHUB_HEAD_SHA=0b788c41852b9f7a67b3151495c19796c6bbe18c` and
`node js/scripts/validate-changeset.mjs`. It reports three changesets and exits 1.
After consolidation, its local directory validation finds one correctly named
minor changeset and passes. The committed correction must also pass the explicit
base/head comparison and hosted validation. This is a metadata correction; no
additional product regression test is needed because the existing CI validator
is the reproducing automated check.

The [evidence archive](data/ci-salary-changeset.tar.gz) and adjacent hash manifest
preserve both full job logs, exact workflow metadata, before/after validator
receipts and parent/current release metadata. All 40 unchecked criteria remain
required in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57),
which stays draft and unmerged.
