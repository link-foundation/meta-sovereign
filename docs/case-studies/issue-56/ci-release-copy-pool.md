# Keep immutable release copy slots working

The Windows Deno shard in parent run `43448780532` fails initial CLI readiness.
Raw job `131967810018` log lines 2244–2260 show 1,620 release files hashed at
350 ms, copied at 8,535 ms and published at 8,877 ms after staging began. The
copy-and-directory phase therefore consumes about 8,185 ms. These are phase
timestamps, not a measured 8,535-ms copy duration. No worker-ready phase or
control pipe appears before the existing ten-second readiness deadline. Lines
5088–5109 retain the `connect ENOENT` named-pipe cause and the one failed test.
The subsequent cold-snapshot test copies the same file set much faster. The
hosted trace does not identify the per-file latency distribution.

Inspection finds a separate avoidable barrier in that path: copies run in
batches of four, and the next batch waits for the slowest of the four. A
fourteen-file fixture explicitly holds the first copy open and completes all
other work deterministically. Against published `dec17a26`, only four copies
start. The other ten cannot use the three available slots. No timing threshold,
large files, stress load or increased concurrency is needed to reproduce it.

Four continuous workers now refill their own slots. A slow copy occupies one
slot while the other three continue. The first observed copy failure prevents
new admissions; all issued copies still drain before temporary files are
removed, and the original error is returned. Snapshot hashing, installed
dependency junctions, atomic publication, source-change refusal, existing
release reuse and tamper verification remain in place. Existing default-off
`MS_LIFECYCLE_DEBUG=1` tracing gains a content-free `directories_ready` phase,
separating directory preparation from copying in future hosted failures.

Reproduction and focused checks:

```sh
python3 -B experiments/issue-56/release-pool-before.py
node --test --test-concurrency=1 js/tests/rolling-release-copy.test.js js/tests/rolling-cli-readiness.test.js js/tests/rolling-control.test.js js/tests/worker-client.test.js
MS_LIFECYCLE_DEBUG=1 node --test --test-concurrency=1 js/tests/rolling-cli.test.js
```

Eleven focused checks pass, with the Deno-only dependency check skipped by
Node. Both real CLI checks pass: initial readiness, repeated serving, prepared
worker/UI upgrade with a stable public listener, control rejection and snapshot
tamper refusal. Initial local readiness takes 5,290 ms with the unchanged
ten-second budget. This Linux Node measurement does not establish Windows Deno
performance or prove that the batch barrier explains the hosted latency.
Scoped lint, formatting, secret scanning and the existing minor release
changeset are checked. No full local runtime/browser matrix or test suite runs.

The [checksummed evidence](data/ci-release-copy-pool.tar.gz) includes the exact
parent source and failing regression, final sources, local results and raw
hosted failure. Exact-head hosted Windows Deno confirmation remains required.
All other unchecked requirements in issue 56 remain unfinished;
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged while they are implemented and verified.
