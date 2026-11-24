# Persistent browser exit and native close-wait ownership

Checks run [44308710016](https://github.com/link-foundation/meta-sovereign/actions/runs/44308710016),
exact source `b98098b7d0b55d60557024eab21461068798641a`, fails WebKit shard 2,
job `134820577849`, in two places. The preserved 5,053-line log reports an
unhandled 30-second native window close wait at lines 2461–2480. Lines
4979–4987 report `ENOTEMPTY` removing a detached form's profile directory,
after its functional assertions have passed. The available watcher before/after
images and both scenario logs are retained in the evidence archive.

The installed browser-commander 0.34.1 persistent-session close sends the
browser close request and removes its session metadata without awaiting process
exit. A finite, private native Chromium probe observes Close returning before
exit; the process exits 476 ms later. Two new regressions fail against the
exact published `3ca58536` wrapper, with five independent controls passing:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 experiments/issue-56/persistent-close-parent.mjs
```

The shared persistent wrapper now captures its SDK-validated process owner
before metadata removal and waits for actual exit after the close request.
Fresh sessions use the owned child handle; reattached sessions validate the
saved profile, endpoint and PID, then use read-only process-existence probes.
The wrapper never signals a saved PID. Repeated Close shares the same result;
failed target initialization and refused close requests also drain their known
owner. A still-live process produces an explicit refusal after a finite
five-second drainage budget. Detached ownership remains unchanged. Default-off
`MS_BROWSER_LIFECYCLE_DEBUG=1` emits fixed lifecycle events without paths or
credentials.

The native probe reattaches to its own persistent Chromium session and verifies
the actual original child has exited when Close returns. It passes, observing
340 ms between the close request and exit (an earlier run observed 517 ms).
This establishes the premature
acknowledgement boundary; it does not identify the exact late writer in the
hosted `ENOTEMPTY` event. Fresh hosted validation remains necessary.

The deferred-question helper previously left a close promise unobserved while
awaiting the Save click. A finite reproduction of those exact three published
statements fails one check with two controls passing and records the unhandled
rejection. The corrected helper observes both operations immediately, drains
both, and retains the action refusal before the close refusal. It never retries
the click or changes its native deadline. Failure screenshots and bounded,
failure-only control/response diagnostics are enabled in hosted CI. No question
text or credential is logged.

The original deferred-question scenario passes in an isolated WebKit run with
one saved question associated with its vacancy, the actual letter preserved,
an empty worker queue, zero submissions and all owned browsers closed. Its
underlying hosted Save/close timing failure remains unexplained. The new promise
ownership check prevents that failure from escaping the scenario's cleanup and
diagnostics; it is not evidence of a production question-saving fix.

All 26 focused process, close-wait, browser-preparation and watcher checks pass.
An independent Playwright MCP check saves and reloads the shared deferred
question controls at desktop and phone widths, with no overflow, zero provider
browser opens and its isolated server/browser closed. Its
[desktop](../../screenshots/issue-56-browser-closure/mcp-desktop.png) and
[phone](../../screenshots/issue-56-browser-closure/mcp-phone.png) renders show
settings recovery, not an active provider window closing. The initial MCP VM
import refusal is preserved separately; it created no fixture.

The [source-bound archive](data/browser-closure.tar.gz) and
[hash manifest](data/browser-closure.tar.sha256.json) retain the complete failed
job, SDK source, exact parent wrapper, focused controls, native observations and
independent UI evidence. Scoped static checks pass; full platform, duplication
and browser matrices remain in hosted CI. No inventory criterion is accepted
by this correction: **88 verified / 30 unfinished** remains unchanged in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
