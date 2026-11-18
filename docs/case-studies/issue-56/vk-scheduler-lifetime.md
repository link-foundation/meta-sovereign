# Scheduled automation process lifetime

The complete pinned desktop requirements explicitly prohibit unreferenced
scheduler timers: the original runner could exit successfully before the next
trigger. Our online and shared friend-policy schedulers both called `unref()`.
An HTTP listener concealed that defect during server tests, but a standalone
owner with scheduled work exited before its first callback.

Both schedulers now retain their timer reference until explicit `stop()` clears
it. The existing minute cadence, disabled defaults, independent saved settings,
coalescing, positive delivery receipts and shutdown draining are preserved.
Wall, birthday, greeting, maintenance, discovery, retention and reengagement
policies use the common friend-policy scheduler; no additional interval is added.
Read-only foreground CLI commands still do not start a background schedule.

The finite child experiment has no server, socket, watchdog or other referenced
handle. It accelerates only the injected test clock to ten milliseconds, asserts
the unchanged production interval, starts twice, observes three full trigger
checks/completions and stops the actual job. Disabled policies must resolve
neither provider nor credentials. Successful child exit after the receipt also
proves the stopped timer no longer holds the process open.

```sh
node --test --test-concurrency=1 js/tests/vk-scheduler-lifetime.test.js
node --test --test-concurrency=1 js/tests/vk-scheduler-lifetime.test.js js/tests/vk-online.test.js js/tests/vk-friends.test.js js/tests/runner-log.test.js
```

On parent `74e64e42`, all three isolated online/friend/wall cases fail with
`The process exited before its scheduled triggers could run`; each child exits
zero with empty output. After the correction, all 42 focused checks pass,
including owned port admission, disabled scheduling, interval throttling,
coalescing, provider uncertainty, actual store reopen and shutdown draining.
The parent bounds each child to eight seconds and 16 KiB captured output; Node
children use a 128 MiB heap. No stress inputs, external accounts or installation
are involved. Full runtime/platform verification belongs to exact-head CI.

Pinned source: `konard/vk-bot-desktop` commit
`8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`, complete requirements,
Bot Behavior item 17. That source was inspected, never executed.

[Evidence archive](data/vk-scheduler.tar.gz) and
[byte manifest](data/vk-scheduler.tar.sha256.json) retain both parent sources,
the failing/passing logs, focused checks and the actual experiment. VD03 and
the other 60 unchecked rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57); this timer
correction alone does not establish complete desktop execution parity.
