# Issue 35 Case Study: greeting stickers

Issue: https://github.com/link-foundation/meta-sovereign/issues/35

Prepared on 2026-10-11 UTC for PR 36.

## Summary

Issue 35 asks for a way to greet people with a "hi"/"hello" or a
greeting sticker, the way [konard/vk-bot](https://github.com/konard/vk-bot)
does on VK. Opening a dialog is one of the most time-consuming parts of
outreach, and automating it gives the user a fast start and a way to
test their next conversation strategy. The issue asks for:

| #   | Requirement                                                            | Where it is met                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Greet with hi/hello or greeting stickers, like vk-bot                  | `planGreetings` (`initiate` = vk-bot's "greet friends", `reply` = its greeting trigger) (`js/src/greetings/plan.js`) and `runGreetings` (`index.js`) |
| R2  | VK, Telegram and the other networks already supported                  | Sticker sending and parsing in the VK, Telegram, WhatsApp and Messenger adapters. X and email greet with text.                                       |
| R3  | Try X, WhatsApp, Zalo and others                                       | `greetingNetworks` in `js/src/greetings/catalog.js` records what each allows; X and Zalo were researched (below)                                     |
| R4  | Telegram: the default stickers shown on an empty dialog                | Researched: they need the MTProto user API. Documented as a known gap; the UI explains it (see "Known gap")                                          |
| R5  | Other greeting stickers the user can select and see in the UI          | **Greetings** screen, `js/src/web/greetings-view.js`                                                                                                 |
| R6  | No graphics in the repository, direct links only                       | VK previews are `https://vk.com/sticker/1-<id>-512` links, Telegram thumbnails come through `GET /api/greetings/file`, and there are no image files  |
| R7  | List stickers through the API when they cannot be collected in advance | `listGreetingStickers`: VK `store.getStickersKeywords`, Telegram `getStickerSet`                                                                     |

## Local artifacts

- `data/issue-35.json`, `data/issue-35-comments.json` (no comments)
- `data/pr-36-*.json` — PR 36 conversation, review comments and reviews
  (empty while this was implemented)
- `verification-logs/` — final local runs of the test suite, lint,
  formatting, duplication check and the browser end-to-end run
- [`../../screenshots/issue-35/greetings.png`](../../screenshots/issue-35/greetings.png)
  — the Greetings screen in a real Chromium instance, after a live
  listing and a send

## Research

### konard/vk-bot

vk-bot (public domain) greets in two ways:

- `greet-friends` sends a random sticker from the `common` list in
  `stickers/greeting.json` to friends it has never written to, ten per
  run, with a 30 s pause between messages.
- `triggers/greeting.js` answers an incoming greeting, either text that
  matches `greetingRegex` or a sticker from `incomingGreetingStickersIds`,
  with a greeting sticker.

Ported as data, not code: the 43 sticker ids (20 `common`), the incoming
sticker ids, and the Russian regex, unchanged
(`js/src/greetings/detect.js`). The ten-per-run limit and the 30 s pause
are the defaults of `planGreetings` and `greetings-send`.

### VK

- [`messages.send`](https://dev.vk.com/method/messages.send) takes a
  `sticker_id`. Errors 901/902 mean the user does not accept messages
  from this account.
- [`store.getStickersKeywords`](https://dev.vk.com/method/store.getStickersKeywords)
  returns stickers per keyword, so greeting words ("привет", "hi", 👋)
  find greeting stickers live. `is_allowed` says whether the user owns
  the pack, and therefore whether the sticker can be sent.
- `https://vk.com/sticker/1-<id>-512` serves a PNG for any sticker id.
  It was checked from this environment (HTTP 200, `image/png`), so
  previews need no stored artwork.

### Telegram

- Bot API [`sendSticker`](https://core.telegram.org/bots/api#sendsticker)
  takes a `file_id` or an HTTP `.webp` URL.
  [`getStickerSet`](https://core.telegram.org/bots/api#getstickerset)
  lists a set by name. [`getFile`](https://core.telegram.org/bots/api#getfile)
  gives a download path whose URL contains the bot token, which is why
  thumbnails are proxied by the user's own server.
- `file_id`s are specific to each bot, so they cannot be collected in
  advance. The catalogue stores set names, and their 👋 stickers are
  listed live.
- The stickers Telegram suggests on an empty chat come from
  `messages.getStickers` with the emoticon `👋⭐️`
  ([Telegram Android `MediaDataController`](https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/messenger/MediaDataController.java),
  [Telegram Desktop `api_premium.cpp`](https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/api/api_premium.cpp)),
  and from TDLib's `getGreetingStickers`
  ([`td_api.tl`](https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl)).
  These are MTProto _user_ API calls. Bots cannot make them, and bots
  cannot start a conversation in the first place.

### WhatsApp, Messenger, X, Zalo

- **WhatsApp Cloud API**: a `type: "sticker"` message carries a media
  `id` or a public `.webp` `link`. Outside the 24-hour customer-service
  window only approved templates can be sent.
- **Messenger Send API**: the thumbs-up sticker `369239263222822` can
  always be sent, within the 24-hour messaging window.
- **X API v2** [`POST /2/dm_conversations/with/{participant_id}/messages`](https://docs.x.com/x-api/direct-messages/create-dm-message-by-participant-id)
  accepts `text` and media `attachments`, and has no sticker type.
- **Zalo Official Account**
  [consultation message with a sticker](https://developers.zalo.me/docs/official-account/tin-nhan/tin-tu-van/gui-tin-tu-van-kem-sticker)
  uses an `attachment_id` from `stickers.zaloapp.com`. The
  [sending conditions](https://developers.zalo.me/docs/official-account/tin-nhan/tin-tu-van/dieu-kien-gui-tin-tu-van)
  limit free-form messages to a window after the user's last
  interaction. The catalogue records Zalo, but there is no Zalo adapter
  to send through yet.

## Design

```text
links in the store ──► summarizeChats ──► planGreetings ──► envelopes ──► runGreetings ──► live.post
                                             ▲                                    │
                       selection (stickers,  │                                    ▼
                       sets, texts, language)┘                   greeting:<network>:<chat> links
```

- **The planner is pure.** `random` and `now` are parameters, so the
  preview in the UI is exactly what a send would do. Network rules become
  skip reasons (`outside-messaging-window`, `network-unsupported`,
  `no-greeting-available`), not failed requests.
- **Nobody is greeted twice.** Each send stores a
  `greeting:<network>:<chat>` link, and `initiate` skips those chats.
- **Tokens stay on the server.** The browser never sees a Telegram file
  URL, only `/api/greetings/file?id=…`. The CSP `img-src` adds
  `https://vk.com` and nothing else.
- **Offline-first SPA.** Without a server, the catalogue, the selection
  and the plan preview come from the local store. Listing and sending say
  `server-required`.

## Verification

- `js/tests/greetings.test.js` — catalogue, detection in five languages,
  planning, sending, adapters (sticker payloads and live listing).
- `js/tests/greetings-server.test.js` — the six routes, the thumbnail
  proxy, and the CSP.
- `js/tests/greetings-cli.test.js` — the four commands.
- `js/tests/greetings-web.test.js` — the screen rendered in every locale.
- `RUN_BROWSER_E2E=1 npm run test:e2e:greetings`
  (`js/tests/e2e-greetings-browser.mjs`) drives the screen in headless
  Chromium against a real server with fake adapters:
  1. live listing with proxied Telegram thumbnails;
  2. pick a sticker, change the language, save;
  3. preview with a skipped WhatsApp chat;
  4. send, and assert the exact posts and the recorded greeting links.

### A regression the browser run caught

The first real-browser run found the SPA showing only its static
fallback navigation. The page threw `EvalError` under the CSP
(`script-src 'self' 'wasm-unsafe-eval'`). The cause:

- `js/src/web/dom.js` imported `js/src/greetings/index.js`;
- that module imports `js/src/sources/index.js`, so every network adapter was bundled;
- `github.js` and `upwork.js` run `new Function('id', 'return import(id)')` when they load.

On `main` that code sits in a lazily initialised chunk, so it never
ran in the browser.

The fix splits the browser-safe half into `js/src/greetings/plan.js`
(catalogue, detection, selection, planner). `index.js` keeps the
sending, the live listing and the credentials, and re-exports
`plan.js`. The SSR tests could not see the problem. A new test in
`js/tests/greetings-web.test.js` imports every screen under
`node --disallow-code-generation-from-strings`, which applies the same
rule as the CSP. It fails with the old import and passes with the
split.

## Known gap

Telegram's own empty-chat suggestions (R4) cannot be listed with a bot
token. Supporting them would mean adding a user-account client (TDLib
or MTProto) as a new source, which is a larger, separate integration
with its own login flow. Until then, the Greetings screen names the API
call involved and lists greeting stickers from known sets instead.
