# Observe the completed watcher draft

Published source `0e676ed071a1042ffa6bc50c28a2ff32f873e496` failed the
[Ubuntu Deno 2/3 job](https://github.com/link-foundation/meta-sovereign/actions/runs/43975640997/job/133681243959).
The raw log records the watcher assertion failure at lines 4737–4742; line 4748
reports 2,250 passing tests and one failure. The six other worker-setting tests
passed at lines 4282–4288. This was an actual test failure, distinct from earlier
checkout cancellations.

The mock provider uses a three-millisecond sequential watch interval. After
positive prefill, the next read sees its own draft and changes the transient
`prefilled` phase to the stable `owner-draft` phase. The assertion polls every
four milliseconds and can miss `prefilled` even when preparation succeeded.
Increasing its deadline would not recover a phase that already passed.

The finite reproduction loads the exact published test and adds one synchronization
before its old assertion: wait until the next real `owner-draft` phase. This
reliably reproduces the same bounded-watcher failure without CPU or memory stress:

```sh
node --max-old-space-size=384 --import ./experiments/issue-56/period-watch-observer-before.mjs --test --test-concurrency=1 --test-name-pattern='watched revalidation' js/tests/question-period-workers.test.js
```

The corrected test observes `owner-draft` and verifies the current retained plan,
five actual observations, exactly one positive prefill containing `Vietnam` and
zero sends. The test/fixture deadlines and production code are unchanged. Existing
opt-in tracing records `ready → prefilled → owner-draft → stopped`, and stays off
by default.

Ten focused Node checks pass. The one failing Deno case also passes locally;
the complete runtime, OS and browser matrix remains on hosted CI. The prior
failure, traced correction, focused results and exact source hashes are retained
in the [archive](data/ci-period-watch-observer.tar.gz) and
[manifest](data/ci-period-watch-observer.tar.sha256.json). This correction accepts
no inventory criterion; all 41 original unchecked requirements remain active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
