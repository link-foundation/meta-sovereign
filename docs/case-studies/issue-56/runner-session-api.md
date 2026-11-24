# Shared runner API and connected CLI

The published `adb2c8f1` CLI controller had no application API route. The same
finite read-only admission against its exact server dispatch returns HTTP 404;
the new route returns the two observed states without launching a process.
This extends the [session controller](runner-session-control.md), retaining
its global lease, durable target identity and positively observed switching.
It does not establish application readiness or complete desktop independence.

The API offers read-only status and explicit local/server start/stop through
both default Lino encodings. It uses the serving user's profile and accepts no
profile path, executable or SSH host from HTTP callers. The existing passcode,
origin and authorization gates apply. Small bodies, strict mode validation and
generic failures keep private paths and transport diagnostics out of responses.
No dependency installation or application-store access occurs on a runner read.

`runner --url=<origin>` uses these routes without invoking the client's local
controller. It rejects credential-bearing URLs, extra URL components, invalid
actions, redirects and malformed or contradictory receipts. It projects only
the known state fields and never replays a mutation after failure. Successful
start requires the selected session observed running and the other confirmed
stopped or unconfigured. `isolated-session` remains explicit: a session's
existence alone proves neither server readiness nor job or delivery state.

The server registers every owned operation before starting it. Client response
loss does not release its lease early. Shutdown aborts the owned transport and
waits for actual completion before releasing the lease. The durable binding
survives uncertain operations; detached sessions survive closing the control
API. The server's existing socket ownership and shutdown order are retained.

```sh
python3 -B experiments/issue-56/runner-api-before.py
node experiments/issue-56/runner-api-admission.mjs
node --test --test-concurrency=1 js/tests/runner-api.test.js js/tests/runner-client.test.js js/tests/runner-cli.test.js js/tests/runner-controller.test.js
deno test --allow-all --no-check js/tests/runner-api.test.js js/tests/runner-client.test.js js/tests/runner-cli.test.js js/tests/runner-controller.test.js
```

The focused Node and Deno checks each pass 17 cases. They use the real server,
public CLI and bounded injected backend, including both switch directions,
text/binary transport, forbidden origins and arbitrary targets, JSON default
refusal, malformed/oversized bodies, locked passcodes, uncertain SSH states,
private-field projection and non-replayed mutations. The shutdown regression
holds an admitted launch and verifies that its lease and durable binding remain
owned until the fixture releases cleanup. All private fixtures drain and close.
Strict changed-file lint, formatting and diff checks pass.

Actual installed backend/SSH readiness, automatic preparation, independent
desktop execution, shared configuration editing and UI controls remain required.
No inventory row is accepted here; all 60 unchecked original criteria remain
active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/runner-session-api.tar.gz),
[hash manifest](data/runner-session-api.tar.sha256.json).
