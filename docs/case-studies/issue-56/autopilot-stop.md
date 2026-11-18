# Autopilot Stop owns its pending work

The autopilot retained only an abort controller. Stop removed it and returned
before planning, typing, VK pacing or an already-issued send had settled. The
single-step runner did not receive that cancellation signal. A pending message
could therefore be issued after Stop acknowledged, and the old loop could replace
its terminal state with `waiting`, `done` or `paused`.

Each automation now owns its loop promise and a recoverable control queue. Start
and Stop for that automation serialize; another automation can continue while a
provider request is held. Stop signals and drains the preceding owner before
saving the terminal stopped state. Server shutdown signals every owner before
awaiting all pending effects and control operations. Shutdown closes that runtime
instance; ordinary Stop still permits a later explicit Start. Shutdown preserves
the saved restart policy rather than silently granting a new resume permission.

Cancellation travels through model planning, typing, the shared VK FIFO and each
ordered-reply step. A final check immediately before the actual provider call also
covers durable outbox admission waits. Known cancellation before that call is a
definite `stopped` refusal. Once a provider request has been issued, its actual
confirmed or uncertain receipt is retained before Stop completes. Cancellation
never converts an issued effect into a claim that nothing was sent.

Reproduce against published parent `2769b823`:

```sh
python3 -B experiments/issue-56/probe-autopilot-stop.py
```

The **23-case parent run has 22 failures and one positive pass**, with zero
cancellations or skips. The
probe restores every replaced production file in `finally`. An initial
18-case parent log and intermediate test-draft failures are retained separately.

After correction, **72 focused checks pass**, with one worker:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 \
  js/tests/autopilot-control-ownership.test.js \
  js/tests/autopilot-stop-ownership.test.js \
  js/tests/autopilot-cap-lifecycle.test.js js/tests/send-safety.test.js \
  js/tests/automation-next.test.js js/tests/vk-engagement.test.js
```

The new cases cover five shared provider identities, actual single-step runner
and outbox behavior, held planning/typing/provider/storage boundaries, confirmed
and uncertain results, real VK pacing, overlapping Start/Stop, independent owners,
shutdown draining and cancellation between an acknowledged sticker and its text.
All waits have explicit release paths and five-second test deadlines. These are
isolated fixtures, not live-provider or full browser/runtime acceptance. Existing
restart, cap, consent, unknown-delivery and ordered-reply checks also pass.

This server-side lifecycle correction changes no visual controls or browser
bundle. The evidence archive retains exact parent/final sources, finite fixtures,
verification logs and the unchanged production bundle hash. Hosted verification
and full QA20 acceptance remain required: **83 of 118 criteria accepted, 35
unfinished**. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
