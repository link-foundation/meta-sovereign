# Defer rolling-host codecs until use

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged. All thirty unfinished original criteria remain required.

The exact `623a144c` Windows/Deno shard-2
[job 135175317759](https://github.com/link-foundation/meta-sovereign/actions/runs/44409144537/job/135175317759)
fails both rolling CLI readiness cases. The first trace spends 3,062ms loading
the serve consumer and 5,023ms preparing the full immutable snapshot of 2,166
files. Worker initialization has not reported stdout before the unchanged
ten-second readiness deadline. This trace identifies startup costs; it does not
establish a worker import failure. Lines 17460–17505 retain the final errors.

Five paths make the stable host consume unused code: recovery format validation
loads archive streams and both codecs; discovery constants load browser storage
and fetch codecs; CORS refusal helpers load route codecs; proxy construction
loads error codecs; supervisor construction loads its later health probe.
The finite actual-parent import regression rejects all six unused consumer
modules, while its version control passes. The new graph loads 39 internal
modules instead of 47. One fresh-process observation changes from 377ms/86,468KiB
maximum RSS to 329ms/75,240KiB. These single observations are not a benchmark or
proof that Windows readiness now passes.

Pure format validation, discovery constants and CORS policy now have independent
modules. Existing public exports and synchronous route CORS behavior remain.
The proxy supplies an observed lazy error writer; failed imports or writes close
the response rather than leaving rejected callback promises. The health probe
loads on demand and rechecks the current worker after that await. Healthy proxy
traffic still forwards native bytes and replaces untrusted front credentials.
No startup deadline, retry count, file-copy concurrency or immutable snapshot
verification changes.

```sh
python3 experiments/issue-56/rolling-consumer-admission-before.py
node --max-old-space-size=384 --test --test-concurrency=1 \
  js/tests/cli-startup-imports.test.js \
  js/tests/rolling-consumer-admission.test.js js/tests/runner-health.test.js \
  js/tests/recovery-controls.test.js js/tests/backup-recovery.test.js \
  js/tests/rolling-start-preparation.test.js js/tests/server-cors.test.js \
  js/tests/hosted-ui.test.js js/tests/discover.test.js
NODE_OPTIONS=--max-old-space-size=384 \
  node experiments/issue-56/rolling-startup-profile.mjs
```

All 56 focused checks pass. They retain binary/text restore, scheduling and CLI
settings, public export identity, invalid formats, bad Host and denied Origin,
502 refusal, raw binary forwarding, authenticated health and handoff refusal,
busy-port admission, hosted UI and discovery behavior. One isolated real CLI
start/reuse/upgrade passes: initial host readiness is 3,978ms, complete snapshot
1,650ms and worker import 1,611ms. It owns its own temporary store and port and
closes its processes; no user server or provider session is used. The initial
draft's missing local format binding and two additional codec edges are retained
in the failed focused log and corrected before publication.

The same-source WebKit shard-2
[job 135175313302](https://github.com/link-foundation/meta-sovereign/actions/runs/44409144537/job/135175313302)
passes its native scenarios, including the 119,988ms forms-reader group and the
75,932ms forms-watchers group. Artifact upload then fails with `ENOTFOUND` at
log line 4031. This is a separate observed network failure; no scenario, artifact
requirement or timeout is removed. Exact-current-source hosted confirmation is
still required for both runtime readiness and the complete browser matrix.

The [archive](data/rolling-consumer-admission.tar.gz) and
[manifest](data/rolling-consumer-admission.tar.sha256.json) preserve both complete
failed job logs, their source-bound metadata, parent/current source bytes and
local failures/controls. Rebuild with
[the collector](../../../experiments/issue-56/collect-rolling-consumer-admission.py).
