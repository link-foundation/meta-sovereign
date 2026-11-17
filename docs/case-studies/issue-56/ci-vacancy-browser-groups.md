# Independent vacancy browser budgets

The WebKit [fourth partition](https://github.com/link-foundation/meta-sovereign/actions/runs/44022664526/job/133837402279)
for source `13806114` passes the first four vacancy scenarios. The fifth starts
at 05:50:58 UTC; the parent process reaches its unchanged 180-second group
deadline at 05:51:19. Preserved log lines 1075–1083 show the scenario start,
`spawnSync ... ETIMEDOUT` and `Completed vacancies in 180215ms; exit 1`.
The downloaded artifact retains the same partial scenario log and failed
group summary. No metadata assertion failure is reported.

Two later additions made this group combine five substantial native fixtures.
Keep vacancy read, selection and metadata scenarios in `vacancies`, and run
discovery and salary-tier progression in their own mandatory
`vacancy-discovery` entry. Append that entry to the registry so every existing
check keeps its partition. Both engines execute every scenario exactly once;
the three-minute per-group and 35-minute per-job deadlines stay unchanged.
Every fixture still owns its browser pages, provider simulation and cleanup.

A focused regression fails against the prior five-scenario entry. The updated
contract retains all five exact scenario names in groups of at most four,
reusing the existing application-group contract. All 26 focused browser
registry, partition, runner and workflow checks pass. The new two-scenario
entry is also run once on installed Chromium, with its actual native assertions
and closed fixtures. Full WebKit and runtime matrices remain hosted checks.

Reproduce the lightweight registration check with:

```sh
node --test --test-name-pattern='vacancy search and discovery' js/tests/ci-browser-shards.test.js
```

The [hashed evidence archive](data/ci-vacancy-browser-groups.tar.gz) preserves
the hosted job and artifact, previous registration, regression, focused checks
and native run. The main workflow's separate macOS runtime cancellation remains
unresolved: its preserved timestamps show over six minutes spent on checkout
and dependency setup before tests, and cancellation at the ten-minute job
deadline. A successful exact-head run remains required. This CI correction
accepts none of the forty unfinished requirements in
[PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
