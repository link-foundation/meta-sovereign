# Shared desktop startup configuration and runtime packaging

The published `425e6ce6` desktop entry hard-codes its server options. The new
actual-dispatch regression supplies private readable global/local files and an
explicit port. The parent still passes port 0 instead of 9001. The corrected
entry consumes the same loader and parser as `serve`, before importing or
opening its server. Missing selected files and malformed files refuse first.

```sh
python3 -B experiments/issue-56/desktop-config-before.py
node --test --test-concurrency=1 js/tests/desktop-configuration.test.js js/tests/desktop-lifecycle.test.js js/tests/desktop-window.test.js js/tests/desktop-clipboard.test.js js/tests/startup-configuration.test.js js/tests/cli-startup-imports.test.js js/tests/desktop-packaging.test.js js/tests/desktop-runtime-packaging.test.js
node --test --test-concurrency=1 js/tests/vk-token-electron-entry.test.js
```

The shared option adapter preserves server defaults and the desktop's bundled
UI, free port and plain local HTTP defaults. Explicit hosted-UI mode uses the
discoverable default port 8787. Explicit TLS loads the owned HTTPS origin and
only adds an exception for that window's actual server certificate fingerprint.
The handler checks the window, exact origin and certificate bytes, releases on
close or failed load, and leaves other verification unchanged. Clipboard
ownership follows the selected secure origin. The window component is separate
from the executable entry so native checks cannot accidentally start an app.

The audit also found that the staged desktop manifest contained only the
updater, omitting the server's production dependencies. A second exact-parent
regression fails with the missing codec, parser and other runtime packages.
Staging now includes the root production dependencies and updater while
excluding development and optional peer dependencies. After installation,
hosted staging verifies dependency realpaths stay inside the app and imports
the actual staged configuration and server modules without opening a runtime.
A small temporary fixture rejects fallback to a surrounding checkout.

The reader's regular-file check previously followed a blocking open. A private
FIFO therefore blocked before validation. The POSIX probe imports the exact
parent module and bounds itself to three seconds and a 128 MiB JS heap. Its
deadline removes the private fixture and uses SIGKILL, because a blocked libuv
open can also prevent ordinary process exit teardown. An initial ordinary-exit
probe required an external kill; it is not counted as successful bounded
verification. The corrected reader reuses the existing nonblocking-open pattern
from Telegram configuration and refuses the FIFO immediately.

Fifty focused Node checks pass with one test file at a time. The lifecycle
fixture now waits for the renderer's actual entry before racing Quit; its old
single-turn assumption failed after adding asynchronous file reads. The retained
initial failure is a fixture timing error, not evidence of a product fix. No
deadline was increased. Strict changed-file lint passes. No full local suite,
native package build, provider or running application server was used.

A finite real-Electron CI case exercises the production window against two
private TLS servers: reject a mismatched certificate, load the owned certificate,
reject the foreign certificate and release the listener. It is added to the
existing owned authorization/clipboard fixture. The new native case and the
staged-runtime gate remain pending hosted verification; no native result is
claimed here. Electron API documentation is retained at version 45.3.2.

The [user guide](../../SERVER-CONFIGURATION.md) documents launch behavior.
Shared configuration editing, other automation configuration lists and actual
local/SSH runner control remain required. VD07 and all 60 unchecked inventory
rows stay unfinished in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/desktop-configuration.tar.gz),
[hash manifest](data/desktop-configuration.tar.sha256.json).
