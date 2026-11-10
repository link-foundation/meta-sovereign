# Telegram bot and group greeting audit (TG07–TG10)

Work remains in progress in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
Bot startup, sticker catalog discovery, participant planning and paced delivery
still need their shared CLI/API/UI implementation and verification.

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
