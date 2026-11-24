# Desktop shutdown and window ownership

The desktop entry point closed its server only from `window-all-closed` on
non-macOS platforms. macOS Quit therefore left no owned drain path, and a
renderer startup refusal leaked the already opened runtime on every platform.
Overlapping activation during initial window loading could also create a second
window before the first was registered.

The desktop lifecycle now prevents OS Quit until its one owned server close
settles, deduplicates concurrent close requests, and allows the final Quit only
after that acknowledgement. A failed drain is reported without claiming success.
Windows/Linux last-window closure uses this path; macOS retains normal window
reopening until Quit. Window creation is shared while pending, existing windows
receive focus, and shutdown refuses new windows. Startup errors drain the server
and dispose app listeners; a refused renderer load destroys its blank window.
`MS_LIFECYCLE_DEBUG=1` adds bounded stage tracing, disabled by default.

Reproduce both original failures against published parent `6e2116d9`:

```sh
node experiments/issue-56/desktop-lifecycle-probe.mjs --before
node experiments/issue-56/desktop-lifecycle-probe.mjs
```

The finite probe executes the actual entrypoint body with injected app/window
dependencies. Before the fix, macOS Quit and startup failure each close zero
servers; both now close exactly once. No real Electron session, application
server, provider account or platform-runtime result is claimed by these mocks.
Sixteen focused checks pass on each of Node and Deno, including held drains,
repeated Quit, overlapping activation, error reporting, a Quit/startup race and
existing window/theme/updater/packaging compatibility. Full platform execution
remains in hosted CI.

The complete pinned desktop requirements also exposed five requirements missing
from the coarse inventory: scoped acceptance statistics, outgoing priority
seeding, constrained token acquisition, per-session verbose logs and ten-message
invitation defaults/reset. They are now explicit VD11–VD15 rows. All original
requirements remain active: **60 of 118 rows are unchecked**, including desktop
start/stop, remote execution and layered configuration. The shutdown fix does
not accept those missing features. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.

[Checked source and log archive](data/desktop-lifecycle.tar.gz) ·
[Hash manifest](data/desktop-lifecycle.tar.sha256.json)
