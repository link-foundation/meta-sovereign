# Preserve the sixth vacancy browser scenario in the CI contract

Exact-source commit `e68448ac0a526e5e62e5f5d178770a166d4e752b` failed
[Checks run 44229077094](https://github.com/link-foundation/meta-sovereign/actions/runs/44229077094).
Desktop, Pages, Links and Security passed at that same commit. This failure
does not establish browser acceptance: the main browser jobs were skipped.

The workflow job's raw log, `hosted-e68448ac-134549749721.log`, lines
648–674 shows the complete cause: the registry correctly runs the new
`verifyVacancySearchUrl`, but the exact scenario inventory still expects
five names. The correction requires all six names, preserving the limit of
four scenarios per group, mandatory Chromium/WebKit registration, disjoint
shards and existing deadlines. No browser assertion or workflow gate is removed.

The lint job's raw log, `hosted-e68448ac-134549749940.log`, lines 546–550
identifies formatting in `ci-follow-links-opening.md` and
`vacancy-observation-history.md`. Prettier formats only those documents.
The 22 existing lint warnings did not cause this failure.

Reproduce the scenario failure at the parent with:

```sh
node --test --test-name-pattern='vacancy search and discovery' js/tests/ci-browser-shards.test.js
```

The focused registration tests pass after the inventory correction; the two
documents pass their formatting check. Full hosted validation remains required
for the next commit, and all unfinished issue requirements remain open.

The evidence bundle preserves full failing-run output, all three failing job
logs, exact-head metadata for all five workflows, the parent scenario contract,
before/after focused checks and the corrected sources. Historical feature
archives retain their original document bytes; formatting does not rewrite
their evidence.
