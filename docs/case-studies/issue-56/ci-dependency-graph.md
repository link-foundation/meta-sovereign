# Dependency comparison gateway failure

The checks run created at 2026-11-09 15:42:00 UTC for exact head
`01f4d6c805801ee3051e49202b8a932d4a42e865`
([42647281999](https://github.com/link-foundation/meta-sovereign/actions/runs/42647281999))
failed before its dependent test matrix started. Its release preflight job
129263839330 received HTTP 502 from GitHub's dependency comparison API. Full
logs, lines 482–502, show the request SHAs, `REQUIRE_GRAPH: 0` and the thrown
`Dependency graph state is unknown: HTTP 502`. The npm credential report
succeeded; this was not missing publication credentials or a Q&A test failure.
The aggregate pipeline job then correctly reported the failed prerequisite at
lines 1115–1117. Separate Pages, desktop, security and link workflows passed.

The probe previously made one attempt. Reproduce without network traffic with:

```sh
node --test --test-concurrency=1 --test-name-pattern='dependency graph' js/tests/ci-helpers.test.js
```

The two new cases fail before the change and pass afterward. The probe now
retries transient transport errors and HTTP 408/429/500/502/503/504 twice,
waiting one and two seconds. Each request retains its 15-second deadline, so
three attempts take at most about 48 seconds. Recovery must still return an
actual successful comparison. Exhaustion and permanent HTTP errors fail;
configuration/access HTTP 403 retains the existing explicit PR notice and
required main-branch administrator setup failure. No unknown result is marked
as a successful dependency review.

Three focused cases pass using injected requests and waits, with no real sleeps
or API calls. ESLint/format checks pass. Full exact-head CI after this change is
still required. The [verified evidence archive](data/ci-dependency-graph.tar.gz)
contains the downloaded full CI log and metadata plus failing/passing local
regressions; [hashes](data/ci-dependency-graph.tar.sha256.json) identify each file.
