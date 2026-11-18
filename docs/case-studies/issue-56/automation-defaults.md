# Shared desktop automation file defaults

Issue 56 requires the desktop reference's layered configuration through shared
CLI, server and UI mechanisms. The pinned reference is
`konard/vk-bot-desktop@8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`.
Its configuration/storage requirements cover readable Links Notation, global and
local files, application state/cache, lino-arguments, redacted diagnostics,
verbose defaults and legacy list shapes. Its bot configuration includes six
feature switches, intervals, limits, priority friends and message variants.

At published parent `b98098b7d0b55d60557024eab21461068798641a`, server startup
files accept only the server section. Native automation settings read durable
records or built-in defaults, and policy CLI commands never read application
configuration. The server also ignores an injected automation-defaults option.
Consequently the existing layered runner and appearance settings cannot supply
the six bot policies.

## Implementation and precedence

Optional `automations.vk` file defaults now support `online`, `friends`, `cleanup`,
`outgoing`, `wall` and `birthday`. Native validators, compatibility list readers,
acknowledged persistence and scheduler guards remain shared. Unknown fields and
credentials refuse; diagnostics contain a generic scope-specific error without
private values or paths. Each file layer must validate before a later override.
Files and inline readable Lino have the existing 64 KiB byte limit.

Within each policy the global file is overlaid by the local/selected file and
then explicit `--automation-defaults=<readable-Lino>`. Lists replace earlier
lists. Validated defaults are bound to the final runtime store wrapper in a
WeakMap, cloned on assignment/read and never written into durable owner records.
Native saved owner fields take precedence, including saved pauses. Existing
explicit policy command flags save an acknowledged owner choice as before.
Removing a configured default restores the built-in value when no owner setting
exists. No data-store decorator, global environment change or credential copying
is involved.

The CLI, Electron startup, direct server options and rolling worker use the same
validation and policy readers. Reading settings does not start provider work.
Explicitly enabling a previously unconfigured policy can enable it when the
server scheduler starts, subject to existing credentials and delivery guards.
Invalid direct server configuration refuses before logs, directories or services
open. Policy CLI validation similarly precedes opening its writer/reader.

An initial focused compatibility run exposed a new rolling regression: an absent
initial `automationDefaults` property differed from `{}` sent by repeated serve,
causing an unnecessary worker replacement. Initial host options now normalize
the empty value. An actual CLI regression checks unchanged worker reuse, changed
file readback, removal back to native defaults, retained public port and retained
host PID. This also prevents stale defaults surviving file-section removal.

The [four-language guide](../../SERVER-CONFIGURATION.md) documents the complete
field mapping, precedence and protected-credential controls. The
[readable example](../../../examples/desktop-automation-config.lino) keeps all
six policies explicitly paused. A regression parses this exact example and
confirms all six effective switches.

## Finite verification

```sh
node --max-old-space-size=384 --test --test-concurrency=1 experiments/issue-56/automation-defaults-parent.mjs
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/automation-defaults.test.js js/tests/rolling-cli.test.js
```

The exact published parent fails eight configuration regressions with two
independent compatibility controls passing. Corrected source passes all ten
configuration checks, including all six actual public CLI reads, text and binary
Lino API reads, acknowledged owner edits, restart, inline UTF-8 byte limits,
protected-secret refusal, owner-pause precedence and isolated stores. All three
rolling checks pass. Thirteen startup/desktop and eleven diagnostics checks pass
after the runtime-store initialization extraction. The earlier 80-check
compatibility run had 79 passes and the now-reproduced rolling mismatch; its
original log is retained rather than presented as a clean run.

All fixtures are finite, use private temporary stores and close owned servers and
CLI children. They do not contact VK, run a real scheduler or send provider
mutations. No full local runtime/browser matrix or source build is used.
Scoped lint, formatting, secrets, source/document limits and the unchanged
duplication gate are recorded in the independently hashed
[source-bound evidence](data/automation-defaults.tar.gz). The full hosted matrix
for the new source remains required after publication.

This unit does not accept the entire VD07 contract. The full bot/storage/logging
and protected-secret contract still needs a source-to-evidence audit alongside
fresh hosted results. Inventory remains **88 verified / 30 unfinished**.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and
unmerged; every unfinished requirement remains required.
