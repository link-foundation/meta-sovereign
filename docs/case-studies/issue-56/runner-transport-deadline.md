# Bounded runner transport cancellation

The runner runtime owns pending transports during shutdown, and the controller
retains its exclusive lease until a command completes. The existing transport
correctly waited for both the execution callback and the actual child `close`
event, but cancellation sent only `SIGTERM`. A child ignoring that signal could
hold Stop, the controller lease and shutdown indefinitely. Session probes also
had no command deadline; the separate application-health timer did not cover them.

The finite event/clock probe evaluates the actual published `b558bd74` transport
with a simulated stubborn child. After cancellation and the grace interval, the
parent lacks the required `SIGKILL` signal and fails. The fixture then explicitly
closes its simulated child, so the reproduction never starts a process or leaves
pending resources. The corrected source passes the same assertion.

Commands now have a ten-second deadline. Cancellation or expiry first requests
termination, then sends `SIGKILL` after a one-second grace period if the child has
not closed. The command still resolves only after both its callback and close;
late zero exits cannot turn cancellation or expiry into success. Already cancelled
calls spawn nothing, and normal completion removes its timers and abort listener.
These receipts remain unknown to session observations. No remote effect is
retried or claimed reversed after transport interruption.

Four deterministic lifecycle tests verify signal order, deadline expiry, late
success refusal, close ownership and timer cleanup. A separate real-child
regression uses the existing throwaway fixture with its own three-second exit
fallback, confirms a child ignoring `SIGTERM` is killed and reaped, and cleans
its temporary files. Existing graceful cancellation, output bounds, SSH quoting,
controller binding and lease checks remain enabled. The focused Node run passes
24 tests; focused Deno transport checks pass eight. No full suite or application
server was run locally.

`MS_RUNNER_TRANSPORT_DEBUG=1` enables bounded phase diagnostics (`cancel`,
`deadline`, `force-kill`, `closed`). It is off by default and records no target,
arguments, paths, credentials or output. Tests inspect these phases through an
injected observer without enabling owner logging.

Reproduce with `node experiments/issue-56/runner-transport-deadline.mjs --before`,
then omit `--before` for the correction. Focused coverage lives in
`js/tests/runner-transport-lifecycle.test.js` and `runner-transport.test.js`.
The full hosted matrix remains required for the published correction. Automatic
dependency preparation and full independent desktop execution remain unfinished
VD01/VD02 work; this fix accepts no inventory row. All original requirements
remain active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/runner-transport-deadline.tar.gz) and
[manifest](data/runner-transport-deadline.tar.sha256.json).
