# WebRTC queued sends and departure readiness

Published parent `96a54d9927981990a5a6155d3f7dc2c6357f2b48` fails Checks run
`43462136209`, created 2026-11-13T16:22:50Z. Job `132013458396` completes
three-peer mesh assertions, then reports `Error sending string through
RTCDataChannel.`. Raw job lines 1203–1204 and complete workflow lines
38838–38839 preserve the failure. The artifact summary identifies `lino-sync`
as the only failing scenario in that shard. Its screenshot was downloaded,
validated as PNG and inspected. Other parent workflows pass.

Initial investigation found two real lifecycle defects: connecting queue drain
can throw outside synchronous-send isolation, and an incoming channel can attach
after disposal. Two finite tests fail before correction. Queued-send failure now
closes the connection, clears pending work and reports the original error.
Late channels close immediately; stale callbacks cannot reactivate the transport.
New sends fail explicitly, and failed delivery is not replayed automatically.

A final native rerun disproved the initial claim that this alone explained CI.
The saved `rtc-open-browser-send-failure.log` reports the same error from ordinary
send despite existing JavaScript error isolation. The app-free finite
`experiments/issue-56/rtc-handled-send.mjs` then reproduces two native teardown
sends returning normally, no `window.error` or `unhandledrejection`, and native
diagnostics surfaced by Playwright as `pageerror` with an empty name. One send
observes an open channel on an already closed peer connection. No throw means
JavaScript catch cannot intercept this diagnostic.

[WebKit's message queue](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/mediastream/RTCDataChannel.cpp#L72)
logs native send failures with JavaScript source and error severity.
[Playwright's console handler](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/webkit/wkPage.ts#L538)
promotes those messages to page errors. The source supports the inference from
the native probe; it does not establish successful delivery. Full primary source
snapshots and the observed probe output are preserved in the archive. The
[upstream report](https://github.com/microsoft/playwright/issues/44103) includes
the executable reproducer, environment, workaround and protocol-level suggestion.

Closing a third browser context does not await the broker's departure message.
The remaining-pair fixture now waits for both survivors to actually dispose
that connection before testing a new write. Its existing 20-second readiness
limit and page-error checks remain unchanged. Fixture-only RTC instrumentation
records actual `close()` calls; optional `CI_LINO_SYNC_DEBUG=1` tracing retains
bounded page-error stacks and transport reports. Production error reporting and
native failures remain observable. This avoids deliberately sending to a
known departing fixture peer; it does not promise lossless live delivery.

Nineteen focused transport, mesh and wire checks pass with one worker. The rebuilt
native WebKit scenario passes actual three-peer forwarding, connected reload,
ordinary edits, deletion, receive isolation and remaining-pair writes. The failed
draft native run remains in evidence. No full local browser matrix is run.

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 js/tests/webrtc-transport.test.js js/tests/webrtc-mesh.test.js js/tests/sync-wire.test.js
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/rtc-handled-send.mjs
RUN_BROWSER_E2E=1 E2E_BROWSER=webkit CI_LINO_SYNC_DEBUG=1 NODE_OPTIONS=--max-old-space-size=384 node js/tests/e2e-lino-sync.mjs
```

The [checksummed evidence](data/rtc-open.tar.gz) retains complete parent workflow
and job logs, CI metadata, artifact summary/image, failing-before regressions,
failed draft, native probe, final checks and source snapshots. Exact new-head
hosted verification remains required. Initial/reconnect reconciliation and every
other unchecked requirement remain unfinished in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
