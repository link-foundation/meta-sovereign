# Rolling local-server upgrades

The JS CLI's default `serve` keeps a stable loopback host in front of a replaceable application worker. After updating the installed package or checkout, run the same `serve` command again. It asks the existing host to prepare the installed version; an unchanged version is reused. Keep the original host process running. GitHub Pages remains the default app, and `--local-ui=true` is optional.

The active worker continues answering requests while the replacement reads the saved archive. The replacement initially has read-only access to a fixed log prefix. Compaction is held while the owner continues appending. Once the replacement is ready, the host briefly holds incoming requests, drains the old worker, flushes its durable text log, and transfers the exclusive writer lock. The replacement replays intervening writes and deletions before serving. Preparing a replacement never creates two writable stores.

The public HTTP/TLS listener, port, certificate and existing HTTP/2 connection stay in the host. Account event streams reconnect automatically when their worker changes. The unlocked state is retained. The old worker remains available for rollback for 30 seconds; a failed warm-up leaves it active, and failed activation restores it. A worker crash triggers automatic recovery. Safe reads retry while recovery proceeds. The browser retains its screen and retries queued sends with their original client IDs and reply options; the proxy does not blindly replay mutations.

Repeated early worker crashes use increasing restart delays, capped at 30 seconds, while safe reads keep waiting. This avoids continuously spawning replacements and consuming CPU when a persistent fault prevents the worker from running. Closing the host cancels a pending restart.

Prepared code snapshots and the control socket live under `<store>/runtime/`. Source files are hashed and verified before activation. The control socket is private to the OS user; executable paths and lifecycle controls are never accepted through the browser HTTP API. The data log, accounts, media, sessions and existing local TLS identity remain in the same application folder.

Deno worker launches disable runtime lockfile writes so they cannot modify a verified release snapshot. On Windows, Deno requires `--allow-all` to use the private named-pipe control channel; start the CLI with `deno run --allow-all js/bin/meta-sovereign.js serve`.

For slow release preparation, set `MS_RELEASE_DEBUG=1`. It prints elapsed times and file counts for enumeration, hashing, copying and verification to stderr, without account data or store paths. It is off by default. The CLI's `meta-sovereign listening on ...` announcement follows worker initialization and durable control metadata, so automation can use it as the readiness signal.

This covers application-worker upgrades with a compatible store schema. An incompatible replacement is refused while the working version remains available. Changing the public TLS listener configuration, stopping the host, or rebooting the OS still requires a host restart. An installation already running the older single-process launcher needs one initial restart to adopt the stable host; subsequent `serve` upgrades use the rolling path. Warm-up temporarily requires memory for both archive readers.

Focused regression tests are `rolling-host.test.js`, `rolling-cli.test.js` and `store-handoff.test.js`. They check writes during warm-up, lock ownership, rollback, crash recovery, unlock state, release integrity, private control permissions, CLI reuse and a verified TLS/HTTP/2 connection across the switch. Tests use temporary fixture stores. Run the full suite in GitHub CI/CD; use only focused tests locally.
