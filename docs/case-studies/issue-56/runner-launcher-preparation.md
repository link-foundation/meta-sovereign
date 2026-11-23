# First-use isolated runner launcher preparation

The pinned [desktop execution requirements](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/docs/REQUIREMENTS.md)
require a Screen or Docker session wrapper on the execution host. Previously,
the controller issued the default `$` after stopping the other mode. A host
without that executable could fail the new Start after losing the active session.

Explicit Start now checks the destination launcher before stopping a running
peer when the destination is already confirmed stopped. An explicit `start`
command is preserved. An existing PATH default must respond to its version
check. A confirmed absence prepares `start-command` 0.44.0 and Bun 1.4.4
with one integrity-locked, script-free npm install on the execution host.
The same prepared runtime is used for Screen and Docker. The application's
configured Node argument and Docker mounts retain their existing meaning.

The controller uses a private revision directory under the execution user's
home. Preparation verifies the native binaries before publication and reuses
the directory after a second check. It refuses a symlinked or shared cache.
Installation failure leaves the active session untouched and returns
`runner-launcher-unavailable` with observed states. Status, profile reads,
inspection and Stop never prepare tools. A warm Start requires no npm or
registry download. An interrupted preparation cannot publish unchecked tools.

## Reproduction

```sh
node experiments/issue-56/runner-launcher-local.mjs
node --test --test-concurrency=1 js/tests/runner-dependencies.test.js
```

The native fixture uses a private home, a private Screen socket directory and
an available loopback port. The published parent `d39b638f` returns the generic
`runner-start-unconfirmed` error with a missing PATH launcher. The updated
fixture refuses an unsafe cache symlink, retains its unrelated marker, cleans
an npm failure, downloads the locked launcher in an empty cache and verifies two
real local application starts, each with a separate ready receipt. On the second
start a failing npm shim remains uncalled. Stop closes the owned session.
The focused runner suite passes 62 checks each in Node and Deno. Package dry
run includes both the application-side script and its lock. Desktop staging
and hosted package smoke require both files.

The hosted SSH fixture now starts with an empty private launcher home. It
requires both native backends to prepare through SSH, reuse the exact binaries
when switching modes, retain application data and close the owned sessions.
Exact-source hosted checks are pending.

## Node and npm on a clean execution host

The published parent `84ca6588` returns `runner-launcher-unavailable` when
the selected Screen host has no Node, npm or default launcher on PATH. The
controller now resolves the configured application runtime before launcher
preparation. A confirmed absence of the default Node on Linux or macOS can
prepare a private Node installation on explicit Start. Existing PATH and
configured Node executables, and the Node inside a configured Docker image,
retain their roles. Docker can also obtain Node on its host for the launcher.

The supported downloads are the official Node 26.13.0 x64 and arm64
archives for Linux and macOS. Their pinned SHA-256 checksums were independently
verified from the signed release manifest with the Node release keyring. The
host checks the archive before extraction, verifies the executable and bundled
npm, and publishes the private directory atomically. Read-only inspection can
use a previously prepared runtime. Status and Stop still observe the owned
backend without installing dependencies. A failed check returns
`runner-runtime-unavailable` before stopping a running peer.

```sh
node experiments/issue-56/runner-node-local.mjs
node --test --test-concurrency=1 js/tests/runner-node.test.js
```

The native Linux fixture runs with a restricted PATH, a separate Screen socket
and a private home containing literal spaces and a quote. It rejects a corrupt
download without leaving an installed runtime, starts the real application
from a cold cache using the official archive and bundled npm, then confirms the
same ready state from a warm cache with archive downloads disabled. Each Stop
is observed. Both runtimes passed 61 focused runner tests, and package dry-run
includes the bootstrap assets. The hosted Linux job now runs this fixture.
The same fixture also passed over a real loopback SSH connection. The OpenSSH
client checked the ephemeral host key and authenticated with a private test key.
The loopback server accepted the runner's normal stdin command. SSH quoting
preserved the private home and store paths, and both Screen starts, application
health reads and Stops completed with no Node or npm on the remote PATH.

```sh
python3 -B experiments/issue-56/runner-node-loopback-ssh.py
```

The loopback script uses the optional Paramiko 4.0.0 wheel. The first local
attempt omitted public-key advertisement. The next reached native Screen but
the test peer closed its transport before OpenSSH finished disconnecting. The
corrected peer advertises its one key and drains the protocol before closing.
The hosted OpenSSH server fixture now exercises the same private runtime path.
Hosted SSH and packaged checks, other platforms, the OS backend and application
closure remain open for VD01.

## Dependency refusals in Settings

Open Settings, expand **Runner sessions**, then start the stopped SSH session
while the local session is running. The owned test API runs the production
controller and alternates two preparation failures. The published
`2810a508` bundle shows the same generic warning for both. It also treats the
runtime refusal as a transport error because its bundled receipt reader lacked
the new code. The rebuilt bundle keeps the connection usable and shows which
dependency could not be prepared. Refresh retains the explanation. The local
session stays running, the SSH session stays stopped, and no success message
appears. The backing fixture observes sessions and receives neither Stop nor
Start.

```sh
node experiments/issue-56/runner-dependencies-browser.mjs --parent
node experiments/issue-56/runner-dependencies-browser.mjs
```

The Chromium test exercises the old and rebuilt bundles at 1180 and 390 pixels.
The hosted browser group runs the same regression. An independent Playwright
MCP check saw both notices in English, Russian, Hindi and Chinese at 390 pixels,
with both observed states retained and no horizontal overflow. MCP logged
unrelated Settings errors for the Telegram endpoints disabled in the fixture,
the favicon and Chromium's asset cache. Both browser contexts and the temporary
server closed after verification. The copy follows the existing grouped
Settings controls and distinguishes a known failure from an unavailable view,
as in the pinned [T3 Code Settings controls](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/components/settings/AppearanceSettingsPanel.tsx)
and [Telegram Web A conversation states](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/MessageListAccountInfo.tsx).

[Node before](../../screenshots/issue-56-runner-dependencies/runtime-before-phone.png) ·
[Node after](../../screenshots/issue-56-runner-dependencies/runtime-after-phone.png) ·
[Launcher before](../../screenshots/issue-56-runner-dependencies/launcher-before-phone.png) ·
[Launcher after](../../screenshots/issue-56-runner-dependencies/launcher-after-phone.png)

[Signed release manifest](https://nodejs.org/dist/v26.13.0/SHASUMS256.txt.asc) ·
[Pinned release keyring](https://github.com/nodejs/release-keys/tree/481637f813e912c4aa3622d7964ab426c97b8e8d)

[Source and native Node preparation evidence](data/runner-node-preparation.tar.gz) ·
[Hash manifest](data/runner-node-preparation.tar.sha256.json)

[Native loopback SSH evidence](data/runner-node-ssh.tar.gz) ·
[Hash manifest](data/runner-node-ssh.tar.sha256.json)

[Source-bound logs and package evidence](data/runner-launcher-preparation.tar.gz) ·
[Hash manifest](data/runner-launcher-preparation.tar.sha256.json)
