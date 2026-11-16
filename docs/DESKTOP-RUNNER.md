# Isolated runner sessions

The CLI can observe and control a configured local or SSH server session:

```sh
meta-sovereign runner status
meta-sovereign runner start local --profile=/absolute/path/runner.lino
meta-sovereign runner start server --profile=/absolute/path/runner.lino
meta-sovereign runner stop local --profile=/absolute/path/runner.lino
meta-sovereign runner stop server --profile=/absolute/path/runner.lino
meta-sovereign runner status --url=http://127.0.0.1:8787
meta-sovereign runner start server --url=http://127.0.0.1:8787
```

Neither mode starts automatically. A missing default profile reports both
modes as `unconfigured`. A selected missing or invalid profile refuses a new
start. Status never installs dependencies or opens the application's store.

The default profile is `runner.lino` in the per-user Meta Sovereign application
directory, alongside the default store directory. Use `--profile` to select
another readable Lino file. For example:

```text
runner:
  session meta-sovereign-bot
  local runner_local
  server runner_server

runner_local:
  directory /opt/meta-sovereign
  cli /opt/meta-sovereign/js/bin/meta-sovereign.js
  store /var/lib/meta-sovereign
  port 8787

runner_server:
  host operator@example.org
  directory /opt/meta-sovereign
  cli /opt/meta-sovereign/js/bin/meta-sovereign.js
  store /var/lib/meta-sovereign
  port 8787
```

Directories, CLI entry points and stores must be absolute paths. Server paths
refer to the SSH host. Omit either target to leave that mode unconfigured.
The optional `node` and `start` fields select executable names or absolute
paths; their defaults are `node` and `$`. The optional `isolation` field is
currently `screen`. Credentials do not belong in this file.

Each target currently needs the project's supported Node version, the
application and its production dependencies, GNU screen and
[`link-foundation/start`](https://github.com/link-foundation/start) already
installed. The JavaScript distribution of `start-command` also requires Bun (a supported
Rust installation is an alternative). Install the chosen distribution's
documented prerequisites on each execution host.
SSH uses existing host-key and key authentication with batch mode;
it does not accept unknown host keys or request passwords. This screen backend
requires a compatible host. Missing tools, refused SSH and malformed status
output report `unknown` and prevent a switch. Automatic dependency preparation
and full independent desktop workflow integration remain under development.

Starting one mode first confirms the other is stopped, requesting its stop
when necessary. It then rechecks the destination and starts only when its
state is confirmed stopped. A failed or uncertain operation is never retried
automatically. `running` confirms the named isolated session exists;
`scope isolated-session` does not establish application readiness, enabled
provider jobs or message delivery. Check the application's status separately.

A private durable binding retains both target addresses before process changes.
If the profile changes while an old target is running or unknown, starts are
refused with `runner-profile-change-blocked`. Status and stop continue to use
the retained addresses. Stop the old targets and confirm their stopped states
before selecting a new profile. If the profile disappears, retained status and
stop remain available. Do not delete the binding to bypass an uncertain stop.

Concurrent controllers are refused while an operation owns the per-user lease.
Interrupting the CLI aborts the owned transport and waits for its child to close;
remote effects can remain uncertain, so read status before another action.

The application's existing server exposes the same controller:

| Request                  | Body                                        | Effect                                          |
| ------------------------ | ------------------------------------------- | ----------------------------------------------- |
| `GET /api/runner`        | none                                        | Observe both modes.                             |
| `POST /api/runner/start` | `{ mode: 'local' }` or `{ mode: 'server' }` | Confirm the other mode stopped before starting. |
| `POST /api/runner/stop`  | `{ mode: 'local' }` or `{ mode: 'server' }` | Request stop and observe its result.            |

Bodies and receipts use the default text or binary Links Notation transport.
The table describes their decoded shape; JSON compatibility stays disabled by
default. Existing passcode, origin and server authorization policies apply.
The API uses the serving user's default runner profile. Callers cannot supply
profile paths, hosts or executables. `--url` selects that API through the CLI;
it cannot be combined with `--profile`, which selects local control instead.
The client follows no redirects and never retries a mutation automatically.

An interrupted HTTP response can leave the result uncertain. The server retains
ownership of its transport until it finishes; server shutdown aborts and drains
that transport before releasing its controller lease. Closing the API does not
stop a detached session. Read status after reconnecting. The private durable
binding still retains the target if a start or stop was interrupted.

Open **Settings → Runner sessions → Show session controls** to observe or
control the same configured targets in the shared desktop/browser UI. The
closed panel performs no probes. Unknown or stale state disables starts;
retained observations stay visible during read recovery. Closing the panel
disposes its polling and never implies the session was stopped. Local execution
runs on the connected server's machine. Profile editing is currently through
the readable file described above.

These controls are a shared session foundation for the active
[desktop execution work](case-studies/issue-56/vk-desktop-execution-plan.md),
not acceptance of the remaining issue requirements.
