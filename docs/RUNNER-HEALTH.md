# Runner application checks (languages: en • [ru](RUNNER-HEALTH.ru.md) • [hi](RUNNER-HEALTH.hi.md) • [zh](RUNNER-HEALTH.zh.md))

Open **Settings → Runner sessions → Show session controls → Check application**
to explicitly check a configured local or SSH target. Session status and the
last application check are separate observations. Opening the controls does not
check the application. Closing cancels the owned read and ignores late results.
Starting another action clears the last check. A changed session observation
also clears it. No health check installs, starts or stops anything.

```sh
meta-sovereign runner inspect local --profile=/absolute/path/runner.lino
meta-sovereign runner inspect server --url=http://127.0.0.1:8787
meta-sovereign runner health --store=/absolute/path/store
```

`inspect` uses the configured target, including its SSH transport. A retained
running or unknown target remains addressable after a profile edit; inspection
does not authorize starting the new target. Stopped or unconfigured sessions
skip application execution. `health` reads the selected store's private running
host; it does not open that store or read the runner profile. It is available on
hosts running this version's rolling server. Older or absent hosts return
`unknown`; an unrelated service on a public port cannot confirm health.

`GET /api/runner/inspect?mode=local` (or `mode=server`) exposes the same read
using default text/binary Links Notation and existing passcode/origin policies.
The CLI and API accept configured mode selection, not arbitrary remote paths.

Application results are `ready`, `locked`, `degraded` or `unknown`. `ready`
means the owned application worker responded with its storage health. It does
not confirm enabled jobs or message delivery. `locked` requires unlocking the
application for protected features; `degraded` reports a storage problem.
`unknown` includes cancellation, startup/handoff, unavailable control channels,
malformed replies and transport failures. `runner health` exits zero for
`ready`, `locked` or `degraded`. `inspect` also exits zero for a confirmed
stopped/unconfigured session that skips the application read. Neither confirms
that a job succeeded.

The private worker request has a two-second deadline and a 16-KiB reply limit;
the private control read has a 2.5-second deadline. The configured command has
a ten-second deadline, aborts its owned transport and waits for its child to
close before releasing controller ownership. Credentials and remote diagnostics
are excluded from the projected receipt. No mutation is replayed.

[Reproduction and verification evidence](case-studies/issue-56/runner-health.md).
Automatic dependency preparation and independent desktop job ownership remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
