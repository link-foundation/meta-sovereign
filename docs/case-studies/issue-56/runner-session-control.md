# Local and SSH session control foundation

The desktop source audit found no shared controller for local and remote
processes. The pinned reference's remote UI prepares an installation script;
it does not prove that a remote process is running. Its SSH failure handling
also cannot establish that a previously running remote bot is stopped. The
current desktop still owns provider jobs in its application server, so full
independent execution, dependency preparation, shared configuration/editing,
Lino/UI controls and mode switching remain active VD01–VD09 requirements.

This atomic step adds `runner status`, `runner start local|server` and
`runner stop local|server` through the actual deferred CLI. A missing default
profile leaves both modes unconfigured and starts nothing. A strict readable
Lino profile selects existing installations, absolute paths, a session name
and an SSH address. The shared bounded reader refuses oversized/nonregular
files without blocking on a FIFO. Startup configuration retains its existing
precedence and private errors. See [usage and limits](../../DESKTOP-RUNNER.md).

The transport invokes local executables without a shell. SSH receives fixed
arguments and a quoted stdin script, with batch authentication and no relaxed
host-key policy. Captured output is bounded to 64 KiB. Status parses complete
GNU screen observations in the C locale, with exact session matching and socket
counts. Missing tools, malformed output, cancellation and SSH failure remain
`unknown`. Neither a launch wrapper's exit code nor missing output establishes
a running or stopped session.

Starting first confirms the other mode is stopped. A stop request requires a
new observation; the destination is also rechecked because the two addresses
can refer to one machine. The controller retains both target addresses before
any mutation, using a private durable Lino binding and a per-user exclusive
lease. Profile edits cannot hide a running/unknown target. Bound status and stop
remain available even if the selected profile disappears. No mutation is retried
after ambiguous completion. Receipts explicitly describe `isolated-session`
state, not application readiness, scheduler activation or provider delivery.

The lease regression exposed an existing race: two simultaneous exclusive
requests from the same process both checked the in-memory map before the first
request published its handle. The second then treated its own live PID as stale
and removed the first lock. The exact published lock source admits two owners
in the finite two-request regression (`2 !== 1`). Exclusive requests now refuse
that live PID; ordinary same-process reentrant ownership remains unchanged.

```sh
python3 -B experiments/issue-56/runner-cli-before.py
node experiments/issue-56/runner-cli-admission.mjs
node --test --test-concurrency=1 js/tests/runner-control.test.js js/tests/runner-controller.test.js js/tests/runner-profile.test.js js/tests/runner-cli.test.js js/tests/runner-transport.test.js js/tests/store-exclusive-race.test.js js/tests/startup-configuration.test.js
node --test --test-concurrency=1 js/tests/store-handoff.test.js
deno test --allow-all --no-check js/tests/runner-control.test.js js/tests/runner-controller.test.js js/tests/runner-profile.test.js js/tests/runner-cli.test.js js/tests/runner-transport.test.js js/tests/store-exclusive-race.test.js
```

The published `d6d3070d` dispatch source refuses `runner status`. The corrected
production dispatch reports both observed modes without opening application
data, starting sessions or installing anything. Focused regressions cover both
switch directions, exact status parsing, unconfirmed stop/launch, profile edits,
missing/corrupt files, cancellation, quoted shell metacharacters, output bounds,
durable address-before-issue and exclusive ownership. The final focused Node run
passes 34 cases (including seven startup-configuration and two store-handoff
compatibility cases); Deno passes the 25 runner/lease cases. Strict changed-file
lint and formatting pass. Real finite child tests
require delayed cancellation cleanup before transport completion. Temporary
files and children close; the user's server is never used as a fixture.

Hosted verification, actual installed backend/SSH application readiness and
all wider desktop criteria remain unverified. This step does not accept a
single unfinished inventory row. All 60 unchecked original criteria stay active
in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/runner-session-control.tar.gz),
[hash manifest](data/runner-session-control.tar.sha256.json).
