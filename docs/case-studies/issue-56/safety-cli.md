# Shared safeguard CLI (QA19)

Global opt-outs and quiet hours were configurable through the shared API and UI;
the automated-send cooldown was available through the API. These settings had no
CLI controls. Seven focused checks fail
against dispatcher `757e241e`; the help control still passes. This is a missing
surface of [issue #56](https://github.com/link-foundation/meta-sovereign/issues/56),
not acceptance of the full per-system/per-chat requirement.

The CLI now provides:

```sh
meta-sovereign automations safety show --store=/path/to/workspace
meta-sovereign automations safety configure --quiet-enabled=true --quiet-from=22:00 --quiet-to=08:00 --timezone=Europe/Moscow --cooldown-days=7
meta-sovereign automations safety opt-out-add --source=hh --chat=123 --note='Owner opt-out'
meta-sovereign automations safety opt-out-remove --source=hh --chat=123
```

Use `--contact=<id>` instead of `--chat` for a person opt-out. Both together are
refused, keeping changes precise. Updating an existing target retains its time
and replaces its note only when explicitly supplied. Other provider, chat and
contact entries remain intact. `--timezone=local` selects the computer's zone;
`--cooldown-days=none` restores the seven-day global default. Each automation's
explicit cooldown still takes precedence; its silence condition still applies.

Show uses the read-only store opener and defaults to Lino output; `--json` is an
explicit CLI output choice. Mutations use the same acknowledged record writer
as the API and UI. Invalid or misplaced options fail without changing settings.
There is no browser, local model, discovery or provider owner to start for these
commands. The store closes on success or failure. A refused write returns exit
code 1 and leaves the previous opt-out protecting the final send guard.

All 28 focused checks pass: eight new CLI checks, eight existing automation CLI
checks and twelve safeguard acknowledgement regressions. They cover default Lino
readback, partial configuration, exact target updates/removals, validation,
refused persistence, an actual Lino file close/reopen and ordinary CLI command
routing with independently opened stores. No provider action is performed.

```sh
node --test --test-concurrency=1 js/tests/safety-cli.test.js js/tests/automation-cli.test.js js/tests/safety-settings-acknowledgement.test.js
```

The [checked source/log archive](data/safety-cli.tar.gz) and
[per-file manifest](data/safety-cli.tar.sha256.json) preserve the exact parent
dispatcher, failures and corrected verification. The related
[acknowledgement correction](safety-settings-acknowledgement.md) retains native
before/after UI evidence. This CLI change does not alter the UI or its bundle.

The acceptance checkpoint stays **82 of 118**, with **36 unfinished**. Full QA19,
QA20 and all other unchecked criteria remain required in
[draft PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), along
with every exact-head hosted workflow.
