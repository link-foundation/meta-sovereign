# Bounded live diagnostics across the shared controls

Pinned `konard/vk-bot-desktop` at `8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`
provides redacted live logs with copy feedback. Its README, full requirements,
Electron entry point, lifecycle, installer, configuration, CLI and logger were
read completely. The installer generates a script; its Electron entry point
has no remote SSH execution handler. The broader desktop execution and protected
configuration requirements remain active in [the desktop checklist](vk-desktop-execution-plan.md).

The existing application writes private rotated server logs but offers no live
inspection surface. Its string-only formatter misses camel-case private keys
and some nested credential fields. The finite actual-parent regression on
`77ac37e3e51746f6dd74afef4aec3fd5881c9030` fails with `must redact private-fixture`.
Reproduce it and the missing-controls screenshots with
`python3 -B experiments/issue-56/diagnostics-before.py`. An initial import-only
probe did not establish this failure; the retained functional probe does.

An original structured formatter now masks known secret keys, provider token
suffixes and common long token forms before serialization. It bounds traversal,
avoids getters/toJSON and tolerates cycles, BigInt and failed sinks. The same
formatter protects file/stdout output and a per-server 300-entry/256-KiB memory
journal. Lines are limited to 4,096 characters. There is no disk scan or growing
queue. Polling excludes its own access entries; gaps and stale process cursors
are explicit rather than presented as complete history.

The read-only API retains origin and local-passcode gates and default text/binary
Lino encoding. CLI `diagnostics logs [--url=<origin>] [--after=0] [--follow]`
reads that endpoint without opening the store. It drains cancellation, removes
its owned signal handlers and does not print a late cancelled response or raw
transport errors. Locked and unsupported servers report unavailable diagnostics.

The shared Settings card uses existing theme, card and disclosure components,
following the pinned T3 appearance guidance in [Chat References](../../CHAT-REFERENCES.md).
Four-language status, bounded retry, retained entries, acknowledged copying and
copy failure feedback are shared across the web and desktop renderer. Closing
the view aborts the owned request and timer. Diagnostics own retries so transient
HTTP failures become visible rather than staying hidden inside generic recovery.
Message delivery states remain separate from diagnostic activity.

Focused tests cover structured secrets, inert accessors, bounded retention,
Lino text/binary, origins, invalid cursors, passcodes, real CLI admission, held
shutdown, view disposal, malformed responses, restart, retained recovery and
bounded backoff. Native WebKit checks successful and refused copying, automatic
recovery, no polling after closure and fitting desktop/phone layouts. Independent
MCP checks all four languages and real clipboard contents, with no page exceptions.
Its no-Telegram fixture has expected missing-provider HTTP 404 console entries;
navigation/disclosure teardown aborts owned event and diagnostics reads. Disabling
the MCP browser cache removed its initial cache-write diagnostics.

The focused run passes 55 Node checks and 54 Deno checks, with the existing
Node-only import-graph check ignored by Deno. Changed-file strict lint,
formatting, secret scanning and diff checks pass. The unchanged duplication
gate reports 6.48%, below its 6.5% threshold.

The first fixture used the default passcode directory despite an in-memory data
store. The newly created fixture passcode was verified and removed; every current
fixture now owns and removes a separate temporary directory. This isolates browser
and passcode validation from the user's application.

Sources, exact parent bytes, tests, native/MCP results, screenshots and reference
files are retained in [the checked archive](data/live-diagnostics.tar.gz) and
[hash manifest](data/live-diagnostics.tar.sha256.json). Hosted acceptance remains
required. All 55 unchecked original inventory rows remain required; this evidence
does not accept the unfinished desktop lifecycle or any other missing feature.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and unmerged.
