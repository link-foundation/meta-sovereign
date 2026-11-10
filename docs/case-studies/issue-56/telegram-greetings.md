# Telegram bot and group greeting audit (TG07–TG10)

Work remains in progress in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
Bot startup, chosen-target greeting delivery, participant planning and paced
delivery remain unfinished. Sticker discovery has a shared account implementation,
CLI, default Lino routes and common React catalog controls.

The secret-free logs, installed-SDK probe and source hashes are preserved in
[the evidence archive](data/telegram-greetings.tar.gz), with verified per-file
hashes in [its manifest](data/telegram-greetings.tar.sha256.json).

## Sticker delivery receipts

The existing sticker sender accepted any resolved `messages.SendMedia` call,
including `null`, `true` or an empty `Updates` result. This could record a
greeting as delivered without a Telegram message receipt.

The minimal regression first failed with `Missing expected rejection` for a
resolved empty response. It now passes: the sender requires either a positive
short sent-message ID, an `UpdateMessageID` matching the request's random ID, or
an outgoing message naming the requested peer. Malformed, unrelated and incoming
updates produce `send-unknown`; callers must not retry these automatically.
Scheduled-message results must also match the scheduling kind. The returned
result retains the confirmed message ID. A later local update-projection failure
does not undo Telegram's acknowledgement and has identifier-free debug logging.

Focused verification (35 passing checks, concurrency one, ten-second test timeout):

```sh
node --test --test-concurrency=1 --test-timeout=10000 \
  js/tests/telegram-message-receipt.test.js \
  js/tests/telegram-stickers.test.js \
  js/tests/telegram-send-as.test.js \
  js/tests/telegram-sticker-box.test.js \
  js/tests/telegram-sticker-search.test.js
```

Strict ESLint and Prettier pass for the affected source, tests and fixture helper.
Existing sticker/GIF tests now return actual matching receipt fixtures instead
of success-shaped empty responses. The regression also covers projection failure,
wrong random IDs, invalid message IDs, peer-kind collisions and missing receipts.

## Cached greeting sticker discovery

`telegram-greeting-stickers --refresh=true` explicitly reads old featured sets,
installed mask sets, recent stickers and favourites. It resolves set documents,
deduplicates IDs and identifies alternatives containing hi, hello or the waving
hand emoji. Running without refresh only reads the account's existing cache.
The CLI supports bounded set/document counts, filtering and result pages.
`SIGINT` and `SIGTERM` cancel the run, await owned work and close storage afterward.
Incomplete refreshes return a nonzero exit code and retain their coverage report.

The `greeting-stickers-refresh`, `greeting-stickers-status` and
`greeting-stickers-cancel` account routes work over readable and binary Lino.
They advertise the actual `greetingStickersRefresh` user-account capability.
Status returns summaries without access hashes or file references. Cache records
retain validated sendable documents, including binary references serialized as
base64, under the connected account ID. Cache age is explicit after ten minutes.
Failed or cancelled refreshes preserve the prior cache; partial reads merge usable
documents. A changed account cannot publish the former account's refresh.
Pagination, document/set counts and retained account caches are bounded. Shutdown
also waits for connections that have not yet produced a refresh job. A failed
initial persistence releases the busy state without making a provider request.

Selecting a cached greeting restores its document into the existing sender. An
expired file reference rereads its original set/recent/favourite source once,
retains the updated reference and still requires a positive message receipt.

The reference's mask read incorrectly treats `messages.AllStickers` as a document
list. Telegram documents a vector of sets: [method](https://core.telegram.org/method/messages.getMaskStickers),
[constructor](https://core.telegram.org/constructor/messages.allStickers).
`experiments/issue-56/telegram-mask-shape.mjs` verifies this without a connection
using installed teleproto 1.232.1, layer 232: one returned set produces zero
documents under the old fallback. The upstream report is
[konard/telegram-bot#16](https://github.com/konard/telegram-bot/issues/16).
No reference code is executed or copied.

Focused catalog verification adds 19 passing checks across
`telegram-greeting-stickers.test.js`, `telegram-greeting-stickers-cli.test.js`
and `telegram-greeting-stickers-api.test.js`. The API test uses the production
server, both Lino encodings and origin checks with SDK fakes. No live Telegram
requests or full local runtime/browser matrix is used. Chosen-target delivery,
bot startup and participant greeting acceptance criteria remain open.

The combined catalog and existing capability/account-action checks pass all
40 cases with concurrency one and a ten-second per-test timeout. Strict lint
passes for changed JavaScript, and the production web bundle builds successfully.

## Common catalog controls

The Stickers screen now exposes explicit refresh limits, cache age, greeting
filtering, pages and per-source coverage. Opening the panel reads the cache;
it does not start discovery or send anything. Running refreshes can be stopped.
Cancelled, failed and incomplete reads remain distinct, with the previous cache
available. The component is reusable in the upcoming recipient planner, including
greeting-only selection callbacks; that planner and sending controls are still
unfinished. Account changes remount the component. Unsupported accounts lose the
cached presentation and refresh controls, while a connection check can recover.
Late unmounted reads cannot replace a newer presentation or release its busy lock.
Cache dates follow the selected interface language. All four locales include
the new controls and recovery messages.

The model, existing Greetings and translation checks pass 44 focused cases.
The new production Chromium flow first fails on the preceding bundle because
`[data-catalog-panel] summary` is absent. After the change it passes against the
actual server and default readable Lino transport: 105 bounded fixture documents,
100-item pages, non-greeting filtering, invalid limits, partial cache merging,
cancellation during an active request, failed-source coverage, reload recovery,
unsupported-account gating and a 390-pixel viewport. No `SendMedia` call occurs.
The filter check awaits its completed read, since a failed read must preserve
the last successful filter. The deliberately held request is released in cleanup
even if an assertion fails. The test is registered in existing browser CI;
the full Chromium/WebKit matrix remains CI work.

```sh
node --test --test-concurrency=1 --test-timeout=10000 \
  js/tests/telegram-greeting-catalog-model.test.js \
  js/tests/i18n.test.js js/tests/greetings-web.test.js
RUN_BROWSER_E2E=1 npm run test:e2e:telegram-greeting-catalog
```

Independent Playwright MCP uses `experiments/issue-56/telegram-greeting-ui.mjs`,
an isolated production server and bounded SDK fixture. It confirms four usable
documents, complete coverage, explicit refresh and mobile layout without external
Telegram calls. External VK thumbnail requests receive a tiny fixture image.
The browser and fixture server are closed afterward. The tiles show document
emoji/identity summaries; they do not claim to display the actual sticker artwork.

Before, no account discovery controls:

![Before catalog controls](telegram-catalog-before.png)

After, explicit cache refresh and source coverage:

![After catalog controls](telegram-catalog-after.png)

Mobile controls and results:

![Mobile controls](telegram-catalog-mobile.png)

![Mobile cached results](telegram-catalog-mobile-results.png)
