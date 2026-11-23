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

Read configuration in this order:

1. `runner.lino` in the per-user Meta Sovereign application directory, alongside
   the default store directory.
2. `.meta-sovereign/runner.lino` in the current app folder. Its supplied fields
   override global fields, so an app-folder file may contain only a different port
   or SSH host. Missing implicit files are optional; an invalid layer refuses even
   when a later layer would hide it.
3. Explicit local CLI field options, which last for that command only.

`--profile=<file>` instead selects one required readable Lino file and bypasses
both implicit files. For example, a complete profile is:

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
paths; their defaults are `node` and `$`. Both targets default to `isolation screen`.

## Bundled desktop runner

In the desktop app, set the local target to `isolation desktop` to run it with
the bundled application and Node runtime. Use a separate absolute store directory
and a free loopback port for the runner. The desktop target takes `isolation`,
`store` and `port`.

```text
runner:
  local runner_local

runner_local:
  isolation desktop
  store /absolute/path/to/runner-store
  port 8788
```

Save this profile in **Settings → Runner sessions → Edit session targets**.
Use **Start** to open the worker. **Check application** reads its current store
and passcode state. **Stop** waits for that worker to exit. Quitting the desktop
app requests the same shutdown. A second controller that sees another
process's active desktop lease reports `unknown` and holds the switch.

The CLI controls the bundled runner through the desktop app's listening origin.

```sh
meta-sovereign runner start local --url=http://127.0.0.1:8787
meta-sovereign runner inspect local --url=http://127.0.0.1:8787
meta-sovereign runner stop local --url=http://127.0.0.1:8787
```

These commands show port `8787` for a desktop app started with `--port=8787`.
A shell controller or standalone server reports a configured desktop target
as `unknown`. Switching a local profile layer to `isolation desktop` retains
an inherited `store` and `port` and discards the inherited launcher fields.

## Detached sessions

The server also accepts `isolation docker` with an explicit `image`:

```text
runner_server:
  host operator@example.org
  directory /opt/meta-sovereign
  cli /opt/meta-sovereign/js/bin/meta-sovereign.js
  store /var/lib/meta-sovereign
  port 8787
  isolation docker
  image your-registry/your-prepared-runtime:your-version
```

Use an image that contains POSIX `sh` and the configured Node executable.
Explicit Start checks for the configured image on the SSH host and pulls it
once if Docker confirms it is missing. An existing image is reused. Use a
digest-pinned reference to select a specific release. An unavailable or
unconfirmed image leaves an active peer running. The application directory, including
its compatible production dependencies, is mounted at the same absolute path
inside the container; its CLI must be inside that directory. The private store
must already exist. A store outside the application directory gets a separate
read/write mount. Both mounts retain data after Stop and restart. Choose an image
whose runtime, architecture and native dependencies match those files.
Credentials do not belong in this file.

Each detached target needs the project's supported Node version, the application
and its production dependencies, and its selected isolation backend. A local or
remote Screen target needs GNU Screen. A
remote Docker target needs a working Docker daemon and permission to use it.

Explicit Start uses the configured `start` command when supplied. For the
default `$` it uses an existing working PATH launcher. When the launcher is
absent, Start prepares the pinned [start-command](https://github.com/link-foundation/start)
and Bun packages under `~/.meta-sovereign-runner-tools` on the execution host.
The first preparation needs Node, npm and access to the npm registry on that
host. When Node or npm is missing, a supported Linux or macOS host can prepare
a private checksum-verified Node distribution with bundled npm. Explicit
executable overrides are preserved. A prepared launcher is reused without npm
or a registry download. The cache belongs to the runner's OS user and requires
a private directory. Launcher preparation uses locked package integrity hashes
and skips package scripts.
SSH uses existing host-key and key authentication with batch mode;
it does not accept unknown host keys or request passwords. Each backend
requires a compatible host. Missing tools, refused SSH and malformed status
output report `unknown` and prevent a switch. For an unconfirmed session,
**Inspect** also reports whether GNU Screen or Docker is reachable, missing,
unavailable after discovery, or still unconfirmed. This read runs outside the
application directory so it can diagnose a fresh host. A reachable backend
can still have unconfirmed application or session status. A launcher that cannot be
prepared or verified returns `runner-launcher-unavailable`. If discovery
confirms the destination is stopped, Start checks that the configured
application file is readable and prepares the launcher before requesting Stop on
an active peer. A failed file check returns `runner-application-unavailable`
with the freshly observed session states. For the standard product CLI path,
Start also loads the application module graph in the selected Node runtime.
Docker runs this check in the resolved image with a read-only application mount.
A failed load returns `runner-application-dependencies-unavailable` before
stopping a peer. Install the selected operating-system backend before starting
the target. For a fresh target, prepare application source from a reviewed
release before the first Start.

### Prepare application source from a release

Select a GitHub release with `meta-sovereign-runner-source.tar.gz` and
`meta-sovereign-runner-source.tar.gz.lino`. The recipe identifies the release
tag, source commit, archive SHA-256 and dependency lock SHA-256. Both files are
listed in the release's `SHA256SUMS.txt` and included in the build provenance
attestation. Review the release and recipe, then copy `applicationSource` and
`applicationLock` into the Lino target. Use a new, absolute application
`directory` under an existing parent controlled by the selected host's OS user.
Set `cli` to `js/bin/meta-sovereign.js` inside that directory and keep the runner
store at its own path.

In **Settings → Runner sessions → Edit session targets**, save the profile, choose
**Review application source** for the destination, and check the URL, host,
directory and both hashes. Choose **Prepare reviewed source** to authorize the
download on that host. Preparation checks the archive against the reviewed hash
and verifies the package version and lockfile before publishing the checkout. It
returns **already present** for the same verified recipe and preserves existing
owner-managed directories. A new target, release or lock requires a new review.
The action leaves existing sessions and application data in place. Use a separate
**Start** to prepare dependencies and launch the session.

Direct or connected CLI commands show the same plan and require its revision.
The example uses an SSH target selected on an existing controller server.

```sh
meta-sovereign runner deploy-plan server --url=http://127.0.0.1:8787
meta-sovereign runner deploy server --revision="$reviewed_revision" --url=http://127.0.0.1:8787
```

For a direct command, use `--profile=/absolute/path/runner.lino` in place of
`--url`, or use the default file precedence. Direct commands can override the
pins with `--local-application-source` and `--local-application-lock` or their
`--server-` equivalents. The same overrides must be used in both commands. The
default HTTP API accepts Lino text and binary on both source endpoints.

| Request                                   | Decoded body         | Effect                                       |
| ----------------------------------------- | -------------------- | -------------------------------------------- |
| `GET /api/runner/deploy-plan?mode=server` | none                 | Read the effective source plan and revision. |
| `POST /api/runner/deploy`                 | `{ mode, revision }` | Prepare the destination from that source.    |

The target needs a supported host Node runtime and `tar`. Private Node bootstrap
can run after approval on supported hosts. GitHub release asset access is needed
for cold preparation. A repeated preparation of the same source uses the
existing checkout without another download.

### Prepare production dependencies from a reviewed lockfile

For a fresh source checkout, set `applicationLock` in the target profile to the
SHA-256 of the reviewed `package-lock.json` from that checkout. Use the checkout
root as `directory` and its `js/bin/meta-sovereign.js` as `cli`. To print the
digest from the checkout on Linux, run `sha256sum package-lock.json`. On macOS,
run `shasum -a 256 package-lock.json`. Add the field in **Settings → Runner
sessions → Edit session targets**, in the saved Lino profile or with
`--local-application-lock=<sha256>` or `--server-application-lock=<sha256>` for a
direct CLI start. Both Lino encodings share the same profile revision and
start operation. The source checkout must belong to the runner's OS user.

Explicit Start with this field prepares a missing dependency tree with `npm ci`
from the public registry and the checkout's integrity-locked vendor tarball.
The private stage uses production and optional packages with package lifecycle
scripts skipped. It checks the staged CLI and server imports and publishes the
new dependency tree as the checkout's `node_modules` link. A concurrent or
existing owner installation keeps its path. Later Starts confirm the saved lock
and load the prepared modules again. A mismatched lock or a failed install
keeps any active peer running. To switch to a differently reviewed lock, use a
fresh checkout, stop the old target and save the new paths and digest.

Screen uses the selected host runtime and can use bundled npm. Docker uses the
resolved image with Node and npm, installing as the SSH owner's UID and GID.
The image's runtime user needs read access to that private installation. The
first install needs npm registry access in the selected environment. A completed
warm start, status, profile save and inspection require no download. Leave the
field unset to use an owner-managed dependency tree.

Starting one mode first confirms the other is stopped, requesting its stop
when necessary. It then rechecks the destination and starts only when its
state is confirmed stopped. It rechecks the other mode before accepting an
already-running destination and after launch. A running or unknown peer refuses
success and preserves both observations, including when SSH aliases this host.
A failed or uncertain operation is never retried
automatically. `running` confirms the named isolated session exists;
`scope isolated-session` does not establish application readiness, enabled
provider jobs or message delivery. Check the application's status separately.

Docker observations require the exact configured name and the runner's matching
ownership label. An unrelated container, paused/created container or ambiguous
daemon reply reports `unknown` and blocks mutation. Stop and application health
use the observed container ID. A later explicit Start removes only a positively
observed owned exited container, without force, then rechecks that its name is
available before launch. The launch explicitly retains the exited container so
start-command's completion watcher cannot remove it independently. Stop leaves
that container for the next Start; its writable layer uses disk until then.
Cleanup never removes the mounted application or store.
No container ports are published by this session controller; application health
runs inside the container. Configure any separate network access explicitly.

Screen Stop sends Ctrl+C to the exact freshly observed `PID.session` identity,
then waits for its disappearance. Duplicate names report `unknown`. Stop does
not depend on start-command's historical session record, which can refer to a
different backend after switching between Docker and Screen on the same host.

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
The API uses the serving user's default runner profile. Process-control callers select a configured mode. The profile endpoints
below edit that configuration through the shared controller; callers cannot choose a server file path. `--url` selects that API through the CLI;
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
runs on the connected server's machine. Open **Edit session targets** to read and edit the effective readable Lino profile.
When an app-folder profile exists, saving writes that file and preserves the
per-user source. Otherwise it retains the existing per-user save location.
A complete effective copy is saved, so inherited values visible during review
remain frozen in that app-folder copy. Removing an inherited target writes an
explicit `local false` or `server false` overlay; reloading leaves it unconfigured.
You can use the same declarations in an app-folder file. Status and Stop still
retain any old running target until its stopped state is confirmed.
The editor reads only while open. Saving validates the schema and acknowledges
the persisted document; it never probes, installs or starts a process. Credential
fields and arbitrary schema additions are refused. Paths, executable names and
SSH addresses are configuration, so review them before saving. Credentials stay
in protected stores and SSH authentication.

A revision accompanies each canonical document. Save submits that revision; a
changed revision produces a conflict instead of overwriting another controller's edit. On a refused or unconfirmed save, the editor retains your draft and
disables another save. **Reload saved profile and replace this draft** explicitly reads
the server copy. Copy any draft you want to keep before reloading. A newer draft
typed while a save is pending remains in the editor after the acknowledgement.
Closing the editor aborts its owned request and ignores late responses. A save
already accepted by the server can still finish; reopen to read the saved file.

These controls are a shared session foundation for the active
[desktop execution work](case-studies/issue-56/vk-desktop-execution-plan.md),
not acceptance of the remaining issue requirements.

The same profile operations are available through CLI and API:

```sh
meta-sovereign runner profile --url=http://127.0.0.1:8787
meta-sovereign runner configure --input=/absolute/path/reviewed-runner.lino --revision=<saved-revision> --url=http://127.0.0.1:8787
```

Use `--profile=/absolute/path/runner.lino` instead of `--url` to read or edit a
local profile. `--input` is a bounded local source file; the CLI validates and
submits its canonical document. It does not transmit the input file path. Read
the current revision with `runner profile` before saving. The revision covers the
effective document; a visible change in either source conflicts with an old edit.

| Request                      | Decoded body             | Effect                                                       |
| ---------------------------- | ------------------------ | ------------------------------------------------------------ |
| `GET /api/runner/profile`    | none                     | Read `{ ok, document, revision }` for the effective profile. |
| `POST /api/runner/configure` | `{ document, revision }` | Validate and durably save at the matching revision.          |

The document limit is 64 KiB of UTF-8; the configure request limit is 128 KiB.
Stale revisions return HTTP 409. These operations use the same controller lease
as session actions and the existing passcode/origin rules. Revision checks
serialize cooperating CLI/API writers; direct external file edits are outside
that lease. Editing leaves the retained session binding intact, including when
an old target is running or unreachable. Status and stop still address that
target, and new starts stay blocked until the old targets are confirmed stopped.

For direct CLI control, `--session` and each target's `--local-<field>` or
`--server-<field>` override `directory`, `cli`, `store`, `port`, `node`, `start`
and `isolation`; `--server-host` overrides the SSH address and `--server-image`
selects the prepared Docker image. Ports are decimal
integers from 1 to 65535. Other values retain the profile validation above.
For example:

```sh
meta-sovereign runner profile --local-port=8790
meta-sovereign runner start local --local-port=8790
meta-sovereign runner stop local
```

The first command previews the effective configuration without probing a
process. The second retains its exact addresses in the durable session binding;
the last stops that retained target even though the temporary port option is
absent. These options never write a configuration file or process environment.
They cannot accompany `--url` or `configure`: connected operations use the
server's saved configuration and edits require the actual saved revision.
Tokens, passwords and cookies remain rejected in every layer and command.
