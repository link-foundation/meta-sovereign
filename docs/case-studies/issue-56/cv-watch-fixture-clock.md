# Keep offline CV verification independent of host scheduling

PR: https://github.com/link-foundation/meta-sovereign/pull/57

## Actual failure

Checks run 44409144537 uses source
`623a144c7d99f2a7c345a4d1c0fea95e28a12d0d`, created 2026-11-18
22:11:31 UTC. Two Windows jobs reject the same assertion in
`cv-save-watch.test.js:133`:

- Deno job 135175316364: preserved log lines 17320–17330;
- Node job 135175317099: preserved log lines 17008–17030.

The expected mismatch is actually `jobs-cv-readback-timeout`. The fixture uses
a real 40ms verification deadline. Its five retry reads can cross that budget
under host load. The production verifier correctly refuses a result after its
deadline; a test of mismatch and form-open behavior should control its clock.

```sh
python3 -B experiments/issue-56/cv-watch-fixture-clock-before.py
```

One finite 80ms asynchronous read delay reproduces the exact assertion against
the published fixture. The explicit-clock deadline control passes before the
correction. The replay restores current fixture bytes unconditionally.

## Correction and verification

The offline fixture supplies a logical verification clock through the existing
injection point, advancing only by its requested polling interval. Tests can
still explicitly supply another clock. Production code, monotonic time,
deadlines, retry limits, watcher duration and cancellation are unchanged.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/cv-watch-fixture-clock.test.js js/tests/cv-save-watch.test.js js/tests/cv-save-watch-recovery.test.js js/tests/cv-save-deadline.test.js js/tests/cv-created-workplace.test.js
```

Forty focused checks pass. The new regression requires five mismatch reads,
the unchanged prior snapshot, form-open expiry without extra exports and
detached resources. A separate explicit clock expires during otherwise valid
readback and must still refuse publication. No stress or runtime matrix runs
locally. Exact-source hosted confirmation remains required. Acceptance stays
88/118 with thirty unfinished criteria; PR57 stays draft/unmerged.
