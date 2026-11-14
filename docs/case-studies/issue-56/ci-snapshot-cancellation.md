# Snapshot cancellation retains cleanup ownership

Work for [issue 56](https://github.com/link-foundation/meta-sovereign/issues/56)
in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Exact failure and investigation

[Checks 42790770640](https://github.com/link-foundation/meta-sovereign/actions/runs/42790770640)
was created at 2026-11-10 09:26:46 UTC for exact head
`86eebd79e4575e003471a0b03dd2d9f8153030e9`. Windows/Deno fails the first
`store-handoff.test.js` case with `EBUSY: resource busy or locked, rm` at full
log lines 93461–93464. It reports 4,127 passes and one failure at line 93469.
The aggregate fails on `test: failure` at lines 100883–100885. Other workflows
for this head pass. The complete log is preserved locally and a numbered
excerpt is archived here.

The error omits the locked file, so the precise Windows handle is unobserved.
Targeted inspection covered reader ownership, text flushes, handoff locking
and snapshot shutdown. Existing focused cases pass on Linux Node and Deno.
A finite one-file/one-worker descriptor probe also closes promptly on both
local runtimes; it does not reproduce the Windows failure.

A deterministic regression does expose a concrete cancellation gap: the
parent forcibly terminates an active encoder and releases ownership before
its cleanup can acknowledge closure. Warm handoff uses this path. Deno
v2.9.8's [worker implementation](https://github.com/denoland/deno/blob/v2.9.8/ext/node/polyfills/worker_threads.ts#L829)
emits exit and resolves termination immediately. Its
[host operation](https://github.com/denoland/deno/blob/v2.9.8/runtime/ops/worker_host.rs#L482)
requests termination without joining the worker thread. Thus termination is
insufficient evidence that outstanding native operations released their files.
This is a lifecycle defect independently of whether it caused this particular
Windows lock.

## Correction and verification

Cancellation now sends a cooperative request and waits for a final worker
message after stream/file cleanup and encoder closure. Bounded work-budget
checkpoints stop encoding and prevent a later rename when cancellation is
observed. Errors also travel after cleanup, and cleanup failures remain visible
even during cancellation. Only then is the idle worker terminated and its
workspace removed. Default-off `MS_STORAGE_DEBUG=1` tracing records cancellation
and cleanup stages without paths or stored text. An initial existing-format
progress message allows observation immediately after opening the encoder.

The first regression fails before the change. Three focused cases now verify
ownership while cleanup is held, actual worker cancellation after opening its
encoder, and visible cleanup errors. Together with existing handoff, mirror,
archive and reader cases, 17 Node checks pass with concurrency one and a 384 MiB
heap. Eight selected Deno checks pass with the same heap cap. No full local
matrix or stress test was run.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/snapshot-worker-cancellation.test.js js/tests/store-handoff.test.js js/tests/doublets-mirror.test.js js/tests/disk-network.test.js js/tests/lino-reader-lifetime.test.js
deno test --allow-all --v8-flags=--max-old-space-size=384 js/tests/snapshot-worker-cancellation.test.js js/tests/store-handoff.test.js js/tests/disk-network.test.js
```

Scoped strict lint, formatting, secret scanning and whitespace checks pass.
[Archived evidence](data/ci-snapshot-cancellation.tar.gz) includes before/after
logs, the negative descriptor probes, pinned runtime excerpts and source hashes;
the [manifest](data/ci-snapshot-cancellation.tar.sha256.json) verifies each entry.

The exact new-head Windows runtime and full CI remain required. Later `dfa1f68d`
Checks 42793097947 is still running at this snapshot; its Chromium job has
failed and requires separate log investigation. General answer extraction,
concurrent knowledge edits, provider imports and all other unchecked PLAN.md
requirements remain open. PR 57 stays draft and unmerged.
