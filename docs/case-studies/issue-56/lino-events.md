# Lino event streams

The structured HTTP migration left two JSON boundaries: `/api/events` and `/api/telegram/accounts-events`. Both servers called `JSON.stringify`, and the browser parsed `event.data` as JSON. Changing ordinary HTTP headers could not migrate these streams: EventSource requires `text/event-stream` and does not expose arbitrary request headers.

Each SSE data field now carries one `text/lino-line` record. The existing codec escapes embedded LF/CR characters, so a multiline message cannot create additional SSE fields. The browser explicitly requests `?format=lino-line`; it can therefore connect to either a default server or an explicitly compatibility-enabled server. JSON events remain available only with server compatibility enabled. A default server rejects `?format=json` with 406 before opening a stream. Unknown formats are also rejected. The response identifies its data codec with `X-Lino-Event-Format`.

A shared event encoder serves change and account-notification streams. Origin checks, filtered prefixes, secret exclusion, passcode behavior, reconnect hints, heartbeat timing and existing slow-reader policies remain in place. Account notification cleanup now releases its watcher only once when close and error arrive together.

## Reproduction and verification

`js/tests/lino-events.test.js` failed all three cases against the previous implementation and passes after the change. The real HTTP cases cover Unicode/multiline put/delete events, excluded secrets, rejected origins, JSON opt-in and explicit Lino requests to compatibility-enabled servers. The actual account route is exercised with a fake watcher under each policy. Readers are bounded to 32 chunks/32 KiB, test timeouts are finite, and stores contain only small fixtures.

```bash
node --max-old-space-size=192 --test --test-concurrency=1 \
  --test-timeout=15000 js/tests/lino-events.test.js
```

Four selected existing cases also pass: explicit legacy account notifications, legacy chat events, slow-client cutoff, and the bounded regex timeout regression. Full local suites and browser matrices were not run.

`js/tests/e2e-lino-events.mjs` passes in installed Chromium and is registered in the existing CI browser matrix. It uses an isolated memory store, a production server without accounts, a real EventSource and the actual browser API decoder. It verifies a Unicode/multiline message, deletion and exclusion of a secret. The command is `RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/usr/bin/google-chrome npm run test:e2e:lino-events`; CI uses its installed browser without that override.

Playwright MCP additionally attached to visible Chrome launched through browser-commander under Xvfb. The isolated fixture blocked external requests. The browser API received precisely the public message after two real Lino HTTP writes (one secret, one message), with the original Unicode, CR/LF and quotes preserved. Its state was `open`. A preliminary browser-local write correctly produced no server event with sync disabled; the verification then used the server's actual `/links` endpoint. The fixture, browser and MCP page were closed. This is a transport change with no new visual layout.

Focused raw before/after and browser logs are retained in `evidence/local/lino-events-*.txt`. Socket sync/signaling and Rust wire protocols remain unfinished under R-AA16; this change does not claim native parity.
