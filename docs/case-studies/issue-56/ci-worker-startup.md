# Deno Windows worker startup investigation

The exact `b4cf60bbf560d82fe7ff74f558d82187843f073d` [Windows Deno shard 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44293188362/job/134766269933) failed on 2026-11-18. The complete raw job log is retained in the evidence archive. Its lines 13247–13276 report `CLI host did not start` after 10,363 ms, followed by bounded child output. Release staging completed after 4,139 ms and startup reached worker launch. No initialization checkpoint arrived before the readiness deadline. Lines 15443–15460 retain the failure stack and missing named-pipe cause. The shard reports 2,381 passes and one failure.

The same CLI path passes on `9da8b847644b0daf07da6475e6ad9bb2f7d81e3e` [Windows Deno shard 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44295087709/job/134774752086). Its lines 13248–13284 show readiness after 5,922 ms, staging after 2,874 ms and worker initialization after 2,312 ms. The startup production files are unchanged between those commits. This later success does not explain the historical failure.

Existing diagnostics do not distinguish a delayed spawn call, child process creation, IPC write completion or a child that never produces output. The opt-in `MS_LIFECYCLE_DEBUG=1` trace now records those fixed phase names and elapsed times, plus first stdout/stderr arrival and drained exit. It never prints IPC values, paths, private runtime output, arbitrary errors or environment values. Ordinary mode remains silent. Existing worker-operation logs still use their configured logger.

Mock checks verify ordering, private-content exclusion, default-off behavior and ownership through process/stdio closure. A focused real Deno CLI lifecycle retains the actual staging, repeated serve, worker upgrade, stable listener, local UI and control-refusal assertions. The ten-second readiness budget and workflow deadlines are unchanged. No full suite or local runtime matrix is run.

```sh
node --test --test-concurrency=1 js/tests/worker-client.test.js js/tests/rolling-cli-readiness.test.js
MS_LIFECYCLE_DEBUG=1 deno test --allow-all --no-lock --node-modules-dir=manual --no-check js/tests/rolling-cli.test.js
```

The [source-bound evidence](data/ci-worker-startup.tar.gz) and [SHA-256 manifest](data/ci-worker-startup.tar.sha256.json) preserve both complete hosted logs, current/parent worker source, failed diagnostic contracts, focused checks and unchanged deadlines. The historical cause and any necessary correction remain **unresolved**. Hosted verification of the new checkpoints and all 30 unfinished original criteria remain required; PR57 stays draft and unmerged.
