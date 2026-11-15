# Deno release-hash instrumentation correction

The published `b30ac9e4` checks started on 2026-11-15 at 22:54:26 UTC.
The [macOS Deno shard](https://github.com/link-foundation/meta-sovereign/actions/runs/43771864991/job/132991570360)
and [Linux Deno shard](https://github.com/link-foundation/meta-sovereign/actions/runs/43771864991/job/132991570596)
each report 2,133 passing tests and two failing new hash regressions. The
retained macOS log lines 5570–5588 and Linux lines 4561–4583 report
`read concurrency was 8` and `7 !== 4`. These are actual published failures,
not a passing result from an earlier commit.

A single filtered local Deno test reproduces the first failure, excluding
concurrent test execution as its cause. The finite 14-file trace then records
four path-based application reads followed by four numeric file-descriptor
calls through Deno's `FileHandle.readFile` and `internal/fs/promises.ts`.
Deno's promise implementation re-enters the patched `fs.readFile` function.
The test counted the same admitted operation twice; the three held successful
reads in the refusal test similarly re-entered, producing seven calls.

Both interceptors now delegate numeric descriptor calls without counting or
holding them. They still count every application path admission, require
overlapping reads bounded to four, verify the original serial digest, and
require all held reads to drain before a failed preparation settles. No
production hashing, timeout, concurrency limit or acceptance assertion changes.

```sh
deno test --allow-all --no-check js/tests/rolling-release-digest.test.js
node --test --test-concurrency=1 js/tests/rolling-release-digest.test.js
deno run --allow-all --no-check experiments/issue-56/digest-deno-read-trace.mjs
```

The exact published test fails twice before this correction. The corrected
two tests pass in Node and Deno; the trace, original failures and complete
hosted logs are retained. A separate
[WebKit job](https://github.com/link-foundation/meta-sovereign/actions/runs/43771864991/job/132991569780)
fails during checkout at lines 233–234 with an inflate error and a corrupt
packed object, before dependency installation or application tests. That
infrastructure failure requires a fresh hosted run; it proves no UI result.

Exact-head hosted verification and all 60 unchecked original inventory rows
remain required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/ci-digest-deno.tar.gz),
[hash manifest](data/ci-digest-deno.tar.sha256.json).
