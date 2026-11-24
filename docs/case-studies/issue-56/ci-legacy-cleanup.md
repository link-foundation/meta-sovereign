# Windows legacy-cache fixture cleanup

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft with 86 verified criteria and 32 unfinished. This fixture repair accepts no additional criterion.

Exact-source Checks run `44238030260`, created 2026-11-18 at 04:32:30 UTC for `c4ebc9de786e62e2dda08e74a9a853ed57c1882d`, exposed one shared Windows failure under Node, Deno and Bun. The preserved Node job `134580700737` reports `EBUSY` at lines 3982–3984; Deno job `134580701099` reports it at lines 5765–5773. Bun job `134580701104`, lines 15909–15933, identifies the failing `fs.rm` in `vacancy-legacy-fixture.mjs:78`. All three fail the original default-store/app/repository precedence test.

The test changes the process working directory into its temporary fixture. Its outer `finally` restores that directory only after `withLegacyVacancies` has attempted to remove the fixture. Windows holds the current directory open, so removal fails even though migration and precedence assertions succeed. This is a fixture lifecycle error, separate from the earlier canonical-path production repair.

The fixture now captures the caller's working directory and restores it before draining its owned services/stores and removing its temporary tree. Existing migration, private-byte, precedence, acknowledgement and interface assertions remain unchanged. No retry, platform skip, deadline increase or production behavior change is introduced.

Two small portable regressions check the working directory at the actual removal boundary after successful and rejected work. They also require complete removal, original rejection identity and restored caller state. Both fail against the exact published fixture and pass after correction. The focused Node run passes 17 checks including the original migration and real alias-path cases; Deno and Bun each pass 15 lifecycle/migration checks. All local runs are sequential and bounded. Windows confirmation remains assigned to the next exact-source hosted run.

Reproduce with `python -B experiments/issue-56/legacy-cleanup-before.py`. Verify with `node --test --test-concurrency=1 js/tests/vacancy-legacy-lifecycle.test.js js/tests/vacancy-legacy.test.js js/tests/vacancy-legacy-paths.test.js`. `data/ci-legacy-cleanup.tar.gz` and its hash manifest preserve the three complete failing job logs, source-bound run metadata, original fixture bytes, new regressions and focused verification.
