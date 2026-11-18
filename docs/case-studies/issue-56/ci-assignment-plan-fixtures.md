# Assignment planning fixture compatibility

[Checks run 42961487507](https://github.com/link-foundation/meta-sovereign/actions/runs/42961487507), created 2026-11-11 at 04:47:16 UTC for `2113cda0794125ac5a1b0425f7e641e1a08af1f9`, passed lint, security, compilation and Chromium. Nine runtime jobs failed the same two existing assertions in `forms-answer-plan.test.js`. WebKit was still running when the job metadata was collected.

Ubuntu Node job `130329818989`, preserved log lines 5811–5833, shows the capacity fixture failing with `TypeError: store.get is not a function` before reaching its intended bounded knowledge scan. Assignment holds now require a metadata lookup; this deliberately minimal store double supplied only `scan`. Adding an empty metadata lookup restores the original capacity assertion without changing production guards or limits.

The same log, lines 5836–5851, shows the CLI lifecycle assertion expecting two closes and observing one. Inspection files now undergo bounded validation before the store is opened. The invalid-file call correctly acquired no store. The test now counts acquisitions and checks that the invalid input opens nothing and every acquired store closes. The invalid-file rejection and browser prohibition remain asserted.

All nine failed jobs were downloaded and inspected; Node, Bun and Deno on Windows, macOS and Linux report those same two failures. The focused file passes all 14 checks in Node and Deno after correction. Scoped lint and formatting pass. No production behavior, test exclusion or CI configuration changed in this correction.

The [archive](data/ci-assignment-plan-fixtures.tar.gz) and [manifest](data/ci-assignment-plan-fixtures.tar.sha256.json) preserve all nine logs, exact-head metadata, the preceding test source and passing checks. New-head hosted validation and every unchecked issue requirement remain required. [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft and unmerged.
