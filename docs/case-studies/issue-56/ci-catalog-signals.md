# Catalog CLI cancellation: Windows Deno signal compatibility

Run [42735153273](https://github.com/link-foundation/meta-sovereign/actions/runs/42735153273)
was created **2026-11-10 01:21:01 UTC** for exact commit
`19a39bb04c97c7895aaa25d43671cb1128b6efdd`. All four auxiliary workflows pass.
Checks fails Windows Deno; its other eight runtime jobs pass. Both browser jobs
are cancelled, so neither supplies a completed browser pass for this head.

The complete 94,527-line workflow log is preserved in
[the evidence archive](data/ci-catalog-signals.tar.gz), with verified hashes in
[its manifest](data/ci-catalog-signals.tar.sha256.json). Failure sections were
read in bounded chunks. Lines **41113–41120** identify
`telegram-greeting-stickers-cli.test.js:117`: `events.includes('cancel')` is false.
Line **41126** reports 3861 passing tests and one failure. Browser cancellation
appears at **78836** and **80990**. This failure is unrelated to the earlier
rolling-host readiness investigation.

The test registers `process.once('SIGTERM')` and calls `process.emit('SIGTERM')`.
Deno 2.9.7's Node process implementation deliberately ignores registration of
that signal on Windows, including the EventEmitter listener. Its pinned
[source lines 810–815](https://github.com/denoland/deno/blob/v2.9.7/ext/node/polyfills/process.ts#L810-L815)
establish why cancellation never ran. The fake status already reported cancelled,
which allowed the command to return nonzero without exercising cancellation.
Node, Bun and POSIX Deno do register this listener. The installed Linux Deno
reproduction passes, consistent with the platform branch; it does not reproduce
Windows behavior. The finite provider-free probe
`experiments/issue-56/telegram-cli-signals.mjs` reports registration and invocation
for each signal without sending an OS signal.

The test now exercises supported terminal Ctrl+C (`SIGINT`) everywhere and also
`SIGTERM` on POSIX. It still requires the cancellation call, nonzero result and
account-before-store cleanup. No application behavior, timeout or job deadline
changes, and no runtime job is skipped. Nine focused catalog/send CLI checks pass
on Linux Node and Deno; strict lint and formatting pass. Windows verification
and the full current-head runtime/browser matrix remain required in CI.

The application retains both signal handlers. Catchability of real OS signals
is a platform/runtime capability, so this test no longer assumes identical
synthetic SIGTERM behavior on Windows. This is a test compatibility correction,
not a claim that Deno Windows supports graceful SIGTERM shutdown.
