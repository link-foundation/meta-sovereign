# CV experience fixture diagnostic ownership

[Checks run 43879915890](https://github.com/link-foundation/meta-sovereign/actions/runs/43879915890)
tests published `b61cf5fd504e8e928eec5e4ed869087f869dd395`. Its WebKit
shard 3 job `133345479581` fails at raw log lines 1094–1105: the experience
comparison reaches its final page-error assertion, which contains 27
same-origin access-control diagnostics. The preceding comparison, ambiguity,
unknown-field, four-language and phone-layout assertions do not fail. The
downloaded browser artifact's `cv-translation.log` reproduces those messages;
its summary names only that group as failed and contains no CV failure image.

The standalone CV fixture bypassed the existing shared WebKit diagnostic
policy and retained only `error.message`. That discards the native error name
needed to distinguish a handled browser diagnostic from an application
exception. The owned context now uses `watchFixturePages`, and the inspection
receives its collected errors. Standalone inspection still installs its own
collector, retaining `String(error)`. Application CORS, comparison behavior,
scenario coverage and deadlines are unchanged.

The same source review finds this collector in the group's four later
experience-document, LinkedIn, directed-plan and Formal-report inspections.
Their owned contexts now apply the same policy and pass their error arrays
into inspection; the existing action callbacks and mandatory scenarios remain.
Those four registrations were not reached by the failed hosted group. Their
integration is source-reviewed and linted here; fresh hosted WebKit must run
all five inspections. The local replay below covers the first failing scenario.

The finite `experiments/issue-56/cv-experience-page-errors.mjs` replay launches
native WebKit with one private fixture. `--before` obtains the actual published
inspection and wrapper function bodies with `git show`; it does not substitute
an imitation of their assertions. A single injected diagnostic uses the native
name/message split and exact fixture origin. The published scenario fails at
the final assertion; the current scenario handles that diagnostic and passes
one comparison, three ambiguities, two incomplete fields, all four languages
and the 390-pixel layout, with no remaining page errors. Both browser processes
and their private contexts/servers close.

The original hosted collector did not preserve `Error.name`, so its log cannot
prove the type of each original message. This replay proves the integration
defect and its correction, rather than establishing an unwitnessed browser
cause. Fresh native hosted WebKit coverage remains required. Twelve focused
checks pass, including the packaged-launch validator; the diagnostic boundary
checks retain genuine exceptions using identical text, unhandled rejections,
foreign origins and other engines as failures. Scoped lint and formatting pass.

Published `b558bd74` now passes all five inspections in both Chromium job
[133377235105](https://github.com/link-foundation/meta-sovereign/actions/runs/43888804953/job/133377235105)
and WebKit job
[133377235724](https://github.com/link-foundation/meta-sovereign/actions/runs/43888804953/job/133377235724).
WebKit log lines 1091–1099 retain the individual positive receipts for experience
comparison, documents, LinkedIn acquisition, directed plans and Formal reports.
Each inspection's current source matches that published revision. The original
lost error names remain unknowable; successful coverage does not establish their
type. The overall workflow still fails separate Deno import checks, so this
positive browser evidence accepts no inventory row.

```sh
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/cv-experience-page-errors.mjs --before
CI_BROWSER_DEBUG=1 NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/cv-experience-page-errors.mjs
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=10000 js/tests/e2e-page-errors.test.js js/tests/desktop-packaged-launch.test.js
```

The [checked archive](data/ci-cv-experience-page-errors.tar.gz) and
[manifest](data/ci-cv-experience-page-errors.tar.sha256.json) retain the full
hosted log, exact job metadata, extracted artifact receipts, actual parent
sources, current helpers, replay and focused checks. The
[acceptance audit](hosted-criteria-plan.md), nine candidate rows and every other
unfinished requirement remain open in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
