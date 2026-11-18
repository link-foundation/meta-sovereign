# Observe runner shutdown before acknowledging Stop

In [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), a native
GNU screen/start-command probe reproduced a premature Stop refusal. The isolated
fixture handled Ctrl+C and took 3.5 seconds to finish cleanup. The installed
`start-command` 0.40.0 returned a successful signal dispatch while that fixture
was still alive. The controller checked the exact session once, saw `running`
and returned `runner-stop-unconfirmed`. It could similarly refuse a mode switch
that had already requested the other runner's normal shutdown.

The [pinned upstream control implementation](https://github.com/link-foundation/start/blob/8e37b91d649287f94fc0d4da93645f5b686fc1c4/js/src/lib/execution-control.js) explicitly reports `signal-sent`; this is
not an application-drain acknowledgement. Its status and descendant inspection
can delay the wrapper, which explains why the earlier 600 ms and 1.8-second
exploratory fixtures passed. Those timings cannot establish a shutdown contract.

After sending Stop once, the shared controller now observes the exact configured
session until it is stopped, observation becomes unknown, cancellation arrives
or a monotonic ten-second observation window expires. Checks are spaced by
100 ms, with each native transport command retaining its own existing deadline.
The controller's exclusive durable lease stays held through this observation.
The other mode starts only after a positively observed stop. A missing response,
unknown transport or still-running session cannot authorize a launch. The
controller neither repeats Stop nor escalates to a forced termination.

## Reproduction and verification

`experiments/issue-56/runner-screen-stop.mjs` uses real GNU screen and the
installed start-command executable with a private socket directory, tracking
folder and logs. A tiny temporary Node fixture supplies a finite 3.5-second
cleanup and a 15-second fail-safe lifetime. Its path and store contain literal
arguments, including an apostrophe. It never opens application data or a provider.
The actual parent returns a refusal before cleanup; the corrected controller
returns success after cleanup and observes the session stopped. The probe then
closes its exact private session and removes its temporary directory.

`runner-stop-drain.test.js` adds finite virtual-clock checks for delayed Stop in
either mode, both switch directions, a stuck-session deadline, lost observation
and cancellation. A private durable-controller fixture additionally proves that
a second caller cannot start another mode while shutdown is settling. All six
checks fail against published parent `4bb612207b6cc2673862a6f5a196d13775096a6b`;
all 22 focused runner/control/controller checks pass after correction. The
original status, optimistic-launch refusal, retained-profile and shared-backend
checks remain in that focused set.

`MS_RUNNER_CONTROL_DEBUG=1` enables state-only wait/terminal tracing. It omits
session addresses, commands, stored configuration and credentials. Default
operation emits none of these messages.

The source-bound archive retains the complete before/after native receipt,
actual-parent regressions, focused results, reviewed upstream control sources
and static checks. This establishes local native graceful Stop. The remote
branches use the same controller and have focused fixture checks; this probe
does not establish a real SSH account, desktop-wide acceptance or completion of
VD01, VD02, VD07 or issue 56. All unfinished inventory requirements remain
required, and PR57 remains draft and unmerged pending complete acceptance.
