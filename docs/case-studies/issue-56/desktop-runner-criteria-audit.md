# Execution modes and desktop interface acceptance audit

PR: https://github.com/link-foundation/meta-sovereign/pull/57

This maps **VD02** and **VD06** to the complete execution and interface clauses
in the pinned [desktop requirements](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/docs/REQUIREMENTS.md).
It does not include VD01's automatic dependency preparation or VD07's complete
bot configuration. Those remain separate required criteria.

## Execution Modes 1–8

| Pinned clause                               | Current implementation                                                                                                                                                                                                                                                      | Verification                                                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Local execution without Docker           | `runner-profile.js` permits only Screen locally. `runner-session.js` launches the configured Node CLI directly through the isolated Screen wrapper. No local Docker probe, image or mount is required.                                                                      | The actual hosted lifecycle starts the local application under the real Screen binary, observes ready private health and stops it. The profile regression refuses local Docker settings.                                                                              |
| 2. Remote SSH with Docker or Screen         | `runner-transport.js` uses authenticated noninteractive SSH and literal argument quoting. The selected remote backend has its own observation, launch, stop and health paths. Docker identity includes its configured ownership label and mounts private data persistently. | Two actual SSH lifecycles, one for each backend, require application health, retained private data and closed resources. Docker also refuses an identically named foreign container. CLI, both Lino transports and the shared profile controls select these backends. |
| 3. Isolated start-command wrappers          | `runnerLaunch` invokes the configured start executable with `--isolated`, backend, exact session and `--detached`. Docker uses the supported retained-container option.                                                                                                     | Argument, literal SSH transport and owned-container regressions cover construction. The native lifecycle runs the actual pinned start-command executable; it does not replace SSH, Screen or Docker with a fake transport.                                            |
| 4. Screen defaults for both modes           | Profile validation supplies `screen`, `$` and `node` only when omitted. Docker is an explicit server choice.                                                                                                                                                                | Profile round trips and launch assertions require both defaults. The native remote Screen case runs the same application lifecycle as Docker.                                                                                                                         |
| 5. Starting local stops server first        | One cross-process controller lease covers observations, old-target binding, remote stop drainage, launch and final observations. Unknown or unconfirmed remote state refuses launch.                                                                                        | Native remote-to-local switching, retained-target controller tests, stop-drain tests and fresh-peer regressions.                                                                                                                                                      |
| 6. Starting server stops local first        | The same controller invokes and observes local Stop before remote launch. A refused local Stop or cancellation cannot become a successful switch.                                                                                                                           | Native local-to-remote switching and the symmetric focused controller/API tests.                                                                                                                                                                                      |
| 7. Check both modes for mutual exclusion    | Start reads both states initially, after stopping the peer and after launch. Even an already running destination requires a fresh peer observation. Unknown is distinct from stopped.                                                                                       | Six actual-parent failures reproduce stale receipts in both directions. Corrected tests require actual peer states and no repeated mutation. Real native receipts require both switching directions.                                                                  |
| 8. Stopped by default; edit before starting | Reading status or profile never starts an isolated session. A collapsed settings disclosure performs no probes. Saving a profile changes desired configuration and preserves the address of any earlier running target.                                                     | The native proof requires zero launches before explicit Start. Controller, API and browser checks require stopped initial states, read-only opening and editable configuration without launch.                                                                        |

Local means the connected server's machine. Closing a browser panel does not
stop a detached runner. A Screen session's existence does not prove application
readiness: **Inspect application** performs a separate private health check.
Transport failures, changed target bindings, ownership mismatch and ambiguous
dispatch preserve uncertainty and never announce success or replay a mutation.

The loopback SSH fixture uses actual OpenSSH authentication and known-host
validation. A separate remote `SCREENDIR` represents the distinct socket
namespace of a second host; it is not evidence of a production remote machine
or a live VK account. This finite fixture verifies the execution mechanism.

## Desktop UI clauses 1–3 and 6–7

| Pinned clause                             | Current implementation                                                                                                                                                                               | Verification                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Single desktop window                  | Electron `lifecycle.js` shares pending creation, focuses an existing window and prevents activation after shutdown begins. Settings and mode controls render inside the same React shell.            | Overlapping activation and startup/shutdown regressions; five native packaged launches require exactly one visible, isolated window, a ready backend and drained runtime on exit.                                     |
| 2. Local/server mode switching            | The expandable settings panel exposes both observed modes and their shared controller.                                                                                                               | Native Chromium and WebKit scenarios switch local → server → local and require the other mode stopped after each acknowledgement. Unknown peer status disables unsafe switching.                                      |
| 3. Start and Stop                         | Shared controls issue one explicit operation and retain last observations while pending. Ambiguous replies disable further mutation until a read-only recovery succeeds.                             | CLI and actual text/binary Lino API tests, both native browser engines, held actions, lost responses and read-only recovery without replay. Floating confirmations require acknowledged outcomes and preserve focus.  |
| 6. Light, dark and automatic system theme | Shared appearance state supports explicit light/dark, live system preference and the additional timed `auto` mode. Browser choices override app defaults; reset follows configured defaults again.   | Native assertions select controls, reload, change OS preference twice and advance a finite clock across the day/night boundary. Unit tests cover boundaries and storage/default precedence.                           |
| 7. Automatic Russian and English          | One locale owner detects actual navigator preferences unless an explicit browser or configured app choice overrides them. Both requested languages are fully registered alongside Chinese and Hindi. | Fresh Russian and English contexts, explicit language retained after reload, clearing the override, a delayed defaults response and all four translated reset controls. Locale tests retain translation completeness. |

The same presentation defaults reach desktop and `serve` through global/local
readable Lino files and explicit CLI values. The read-only `/api/ui/defaults`
endpoint supports text and binary Lino. It exposes only validated presentation
values, performs no writes and never returns the surrounding configuration.
Invalid file layers are refused before runtime opening, including invalid
values hidden by a later override. A late response cannot replace an owner's
newer choice; closing or replacing a connection aborts the owned read.

The [appearance reproduction](ui-defaults.md) retains five published-parent
regressions, native and independent MCP before/after/phone screenshots, and the
actual draft locale-race failure. Existing [window ownership](desktop-lifecycle.md),
[runner controls](runner-session-controls.md), [fresh receipts](runner-exclusive-receipt.md)
and [real backend verification](runner-remote-verification.md) preserve their
original evidence and historical limits. Their earlier partial status and
counts describe those checkpoints, not acceptance of today's source.

## Exact-source acceptance gate

The catalog `experiments/issue-56/desktop-runner-evidence.json` selects 18
original evidence archives. The finite integrity audit independently verifies
every entry without extraction, compares archived production source to the
selected commit and retains the deltas. That step alone establishes neither
behavior nor acceptance.

`collect-desktop-runner-hosted.py` additionally requires all five workflows to
finish successfully on one exact source commit. It binds every named runner,
desktop lifecycle/window/configuration, appearance, UI-default and locale test
to the actual successful Node log. It requires both awaited mandatory browser
groups in Chromium and WebKit, their semantic receipts, both actual SSH backend
receipts and all five native packaged one-window/ready/drained receipts. It
rejects missing, duplicate, skipped, failed or contradictory selected evidence.
The preserved pinned Git blob is independently verified.

**Accepted at `cd4cd0b5c0c894a3a7501371a2ce95f6d3ad22e0`:** all five
workflows pass, with 72 successful jobs and six intentional skips. The actual
logs satisfy all 162 named tests across 26 files, both mandatory groups in
both engines, both real SSH lifecycles and all five packaged desktop launches.
The 18 original archives contain 815 independently verified entries. All 142
entries in `data/desktop-runner-hosted-cd4cd0b5.tar.gz` are independently
rehashed, including pinned contracts, source comparisons and complete selected
job logs. Review of the mapped clauses, source ownership and actual assertions
accepts **VD02 and VD06**. Integrity checks alone did not establish acceptance.

The inventory is **88 verified / 30 unfinished**. VD01, VD07 and every other
unfinished original requirement remain active. PR57 stays draft and unmerged;
later production changes require their own exact-source validation.
