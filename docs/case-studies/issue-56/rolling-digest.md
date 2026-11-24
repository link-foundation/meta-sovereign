# Release hashing and the macOS CLI startup failure

The `3a24c7a5` macOS Node shard 3/8 failed its initial CLI readiness probe.
[The job](https://github.com/link-foundation/meta-sovereign/actions/runs/43769059388/job/132982082137)
reports `CLI host did not start` at `rolling-cli.test.js:54`. The retained log
has 1,700 lines: 1184–1211 show the ten-second deadline, CLI imports, 1,976-file
staging and worker spawn; 1663–1678 retain the assertion and missing control
socket. No provider failure or application exception is shown before shutdown.

The trace identifies a serial I/O cost before worker imports: source hashing
takes 1,493 ms; copying completes at 3,713 ms; verification hashing completes at
5,228 ms. The existing digest awaits every file separately, twice on a cold
release. It consumes about three seconds in those two hashing phases alone.
This is a measured startup bottleneck, not evidence that every later worker
delay is resolved.

The draft reads batches of at most four files and hashes their bytes in the
original manifest order. It retains at most four read buffers, preserves every
existing release identity, and drains all issued reads before reporting failure
or removing a snapshot. There is no full-tree buffer allocation and no increased
readiness or CI deadline. Existing copy admission remains bounded to four slots.

```sh
python3 -B experiments/issue-56/rolling-digest-before.py
node --test --test-concurrency=1 js/tests/rolling-release-digest.test.js js/tests/rolling-release-copy.test.js js/tests/rolling-cli-readiness.test.js
node --test --test-concurrency=1 js/tests/rolling-cli.test.js
```

The exact published `65bc33ee` source fails the finite overlap regression with
`read concurrency was 1`. Two new cases verify bounded overlap, byte-identical
serial hashing and draining on refusal. Eight existing copy/readiness cases
pass, retaining edited-source refusal and immutable snapshot verification.
Both actual CLI cases pass locally with one test file at a time: initial host
readiness is 4,225 ms, hashing 369 ms and verification 196 ms for 1,978 files.
These local figures are not a comparison against hosted macOS hardware.
Strict changed-file lint passes; an initial missing-braces lint error is retained
and corrected. All child processes and temporary stores close.

Exact-head hosted macOS and wider matrix verification remain required before
calling the CI failure resolved. Every unchecked original criterion stays open
in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/rolling-digest.tar.gz),
[hash manifest](data/rolling-digest.tar.sha256.json).

[The Deno instrumentation follow-up](ci-digest-deno.md) preserves the actual
`b30ac9e4` failures, identifies descriptor re-entry in the runtime shim, and
corrects counting without changing the production read limit or assertions.
Hosted resolution remains unverified.
