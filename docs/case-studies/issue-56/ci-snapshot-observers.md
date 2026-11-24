# Snapshot cancellation and unrelated diagnostic owners

On exact source `b98098b7d0b55d60557024eab21461068798641a`, Checks run
[44308710016](https://github.com/link-foundation/meta-sovereign/actions/runs/44308710016)
has a failing macOS Bun job `134820578729`, started at 13:30:51 UTC on
2026-11-18. Its preserved log has 51,827 lines. Lines 30357–30403 show one
failed assertion: cancelling fake worker `90210` expected the entire process's
snapshot-memory registry to be empty, but real worker `136` was still visible.
The job passes its next real-worker cancellation and workspace cleanup check.
Its final result at lines 51801–51811 is 7,683 passes, 18 skips and one failure.

The registry intentionally reports every active snapshot for the connected
process. Cancelling one owner must remove that owner after its cleanup
acknowledgement without clearing other active owners. The original assertion
checks a stronger condition than the cancellation fixture owns. The log alone
does not establish why worker `136` was active or whether its earlier owner
eventually drained; that question is not presented as resolved.

The finite reproduction keeps one unrelated diagnostic entry, imports the exact
published test, and runs its three original checks plus an independent
preservation control:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 experiments/issue-56/snapshot-observer-parent.mjs
```

Both original empty-registry assertions fail; the cleanup-error and unrelated
owner controls pass. The reproduction opens only its tiny private one-record
snapshot fixture and closes it before returning.

The corrected fixture deliberately retains another diagnostic owner. It checks
the cancelled fake worker stays visible while cleanup is pending, disappears
only after acknowledgement and termination, and leaves the unrelated owner
visible. The real-worker case binds its assertion to the actual created thread
and retains the encoder workspace cleanup assertion. The fixture removes its
own unrelated entry in `finally`; it never clears the registry. No production
worker cancellation, cleanup order or deadline changes.

`MS_STORAGE_DEBUG=1` additionally records fixed tracking/release events with
thread IDs, alongside the existing cancellation checkpoints. It defaults off
and records no paths, record values or credentials. This permits a subsequent
shared-process recurrence to be associated with a worker lifetime.

All six focused cancellation/disk-network checks pass separately in Node and
Bun with limited concurrency. The Bun run enables the diagnostics and records
acknowledgement before release. Scoped lint, formatting, secret scanning and
whitespace checks pass. The full platform/runtime matrix remains in hosted CI.

The [source-bound archive](data/ci-snapshot-observers.tar.gz) and
[hash manifest](data/ci-snapshot-observers.tar.sha256.json) preserve the complete
failed job log, exact parent test, focused reproduction and current source.
Fresh hosted validation remains required. No inventory criterion is accepted
by this CI correction; **88 verified / 30 unfinished** remains unchanged in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
