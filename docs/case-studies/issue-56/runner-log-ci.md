# Hosted diagnostic and checkout corrections

PR57 remains draft; every unchecked issue criterion remains required. Run
43756286439 is for `b18c9d0a776e2b4770bd3bdce050c5bedce86c4b`, created
2026-11-15 at 20:07:45 UTC. Its downloaded job logs distinguish three causes:

- Linux Node job 132942318905, lines 7693–7742 and 7745–7774: the existing
  friend-refusal and live-history checks assumed the old diagnostic event list.
  The new trigger checks/completion/timing are intended. Their assertions now
  verify the exact new sequence, severity, finite duration and retained provider
  behavior. The friend failure exposed a real privacy gap: passing a raw Error
  to custom sinks also exposes its unredacted provider `cause`. Trigger tracing
  now passes the existing bounded, accessor-safe redacted plain error summary,
  while rethrowing the identical original error to the action owner. The finite
  `trigger-log-cause.mjs --before` reproducer fails against this exact parent.
- Windows Node job 132942319004, lines 3352–3377: Git's inherited autocrlf policy
  yielded `fresh base\r\n` where the fixture expected LF. The owned source and
  clone now explicitly exercise CRLF checkout on every platform, while retaining
  exact historical binary-byte assertions, full history and the fresh-base merge.
  No user/global Git setting is changed.
- macOS Node job 132942318898, lines 32–38: the runner times out three times
  downloading the same-repository npm-cache action archive, before checkout or
  tests. Only this runtime job now resolves the same composite action from its
  already checked-out, freshly merged tree. Cache keys, designated writers,
  restore policy and ten-minute job deadline remain unchanged. A contract checks
  that checkout precedes the local action; other jobs retain their self reference.

The other downloaded Bun/Deno/Windows logs preserve the same failures without
presenting them as distinct application causes. Local validation is restricted
to the six relevant Node cases and the two changed provider cases in Bun/Deno;
CI owns the remaining platform/runtime/browser matrix. The recurring WebKit
vacancy/sticker/application failures remain separately unresolved.

```sh
node experiments/issue-56/trigger-log-cause.mjs --before
node experiments/issue-56/trigger-log-cause.mjs
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 \
  --test-name-pattern='scheduled read refusals|first live trigger|filtered checkout|bounded filtered|npm caching|cache reservations' \
  js/tests/vk-friends.test.js js/tests/vk-live-history.test.js \
  js/tests/ci-filtered-checkout.test.js js/tests/ci-cache-policy.test.js
```

Raw logs, exact-parent source, the finite probe and check receipts are retained
in `data/runner-log-ci.tar.gz` with a verified per-entry SHA-256 manifest.
Exact-head hosted acceptance remains pending.
