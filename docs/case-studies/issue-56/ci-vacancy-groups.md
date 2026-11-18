# Bounded vacancy browser groups

The exact-source `d48a617927cf6d33aa332b88485068fcb38401e4`
[Checks run](https://github.com/link-foundation/meta-sovereign/actions/runs/44286298815)
failed its workflow-contract job on 2026-11-18. The preserved failed-job log
reports `vacancies combines 5 native scenarios` at line 133, from
`ci-browser-shards.test.js:39`. The pipeline gate then correctly failed.

The modern public-metadata scenario added in `7439bcd9` was registered in a
group already containing four scenarios. Both the four-scenario limit and
the explicit expected inventory were stale relative to that registration.
The Deno partition correction did not cause this separate failure.

Move the modern scenario into the existing loading group, which previously
contained one scenario, and add it to the expected inventory. The eight
vacancy scenarios now run once across groups of four, two and two. Keep the
four-scenario maximum, both mandatory browser engines, all four partitions
and every existing deadline unchanged.

Reproduce with the single `js/tests/ci-browser-shards.test.js` target: the
published parent has seven passing checks and one failure; the correction
passes all eight. Its real child-runner probe also verifies disjoint execution
and failure propagation. This change only moves a previously verified native
scenario between groups; hosted checks must verify the resulting full groups.

The source-bound [evidence archive](data/ci-vacancy-groups.tar.gz) includes the
raw hosted failure, actual-parent reproduction, corrected checks, exact old
and new registrations, and independently hashed manifest. This correction
accepts no original inventory row. All 30 unfinished requirements remain
required and [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
