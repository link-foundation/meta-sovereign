# Cache reload refusal diagnostics

The exact `7973fe42` [hosted run](https://github.com/link-foundation/meta-sovereign/actions/runs/43799402081),
created on 2026-11-16 at 03:38:32 UTC, failed its WebKit fourth shard. Job
`133077189111` raw log lines 777–787 retain the failure at 03:49:44 UTC:
`retained.cache.count` accessed an undefined cache after reload. The earlier
401-message refresh and export assertions passed. The original assertion hid
the response status, refusal code and submitted fields; it cannot establish
whether the cause was input handling, transport or cache storage.

One finite local WebKit run of the unchanged scenario passes. Request tracing
retains account 1, peer 42 and a successful cache inspection after reload, with
401 records, 17 synthetic provider reads and no provider writes. This negative
reproduction does not resolve the hosted failure.

The browser fixture now verifies each action's positive receipt before reading
cache fields. A refusal retains the HTTP status, code, bounded synthetic wire
input, displayed field values and a screenshot in the existing browser artifact
directory. It keeps the original 401-record reload assertion, deadlines and
mandatory browser coverage. A finite injected Lino refusal after reload proves
that the new diagnostic exposes HTTP 400 and `bad-request`; that injection is
diagnostic verification, not evidence of the actual hosted cause.

Run the original case with:

```sh
node --max-old-space-size=256 experiments/issue-56/vk-cache-reload-probe.mjs
```

Add `--refuse-reload` to verify refusal diagnostics against the same synthetic
fixture. Each invocation owns and closes its browser, context and server. The
checked archive retains both logs, the exact failing job, run metadata and the
old/current helper. VK24 and all 60 unmet criteria remain open; the cause still
requires hosted evidence. See the [investigation plan](ci-vk-cache-reload-plan.md).
