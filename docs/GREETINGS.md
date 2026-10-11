# Greetings: open dialogs with a hi or a sticker (languages: en • [zh](GREETINGS.zh.md) • [hi](GREETINGS.hi.md) • [ru](GREETINGS.ru.md))

Starting a conversation is the slow, repetitive part of talking to
people. [konard/vk-bot](https://github.com/konard/vk-bot) solved it on
VK by sending a greeting sticker to friends it had never written to, and
by answering "Привет!" with a sticker. This subsystem does the same
across every messaging network `meta-sovereign` already connects to, so
the user spends their attention on the second message, not the first.

Related documents: [USER-GUIDE section 10](USER-GUIDE.md#10-greet-people-with-a-hi-or-a-sticker),
[SERVER-PARITY](SERVER-PARITY.md), the
[issue 35 case study](case-studies/issue-35/README.md).

## 1. Layers

| Layer    | File                                | Responsibility                                                                        |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Catalog  | `js/src/greetings/catalog.js`       | Network capabilities, built-in stickers (ids + direct links), Telegram sets, texts.   |
| Detector | `js/src/greetings/detect.js`        | Is an incoming message a greeting, and in which language.                             |
| Planner  | `js/src/greetings/plan.js`          | `planGreetings` / `planFromStore`: who to greet and with what. Pure and previewable.  |
| Runner   | `js/src/greetings/index.js`         | `runGreetings`: sends with a pause between messages, records `greeting:<net>:<chat>`. |
| Adapters | `js/src/sources/{vk,telegram,…}.js` | `live.post` with a `sticker`, `listGreetingStickers`, Telegram `fetchFile`.           |
| HTTP     | `js/src/server/routes-greetings.js` | `/api/greetings/*`, including the Telegram thumbnail proxy.                           |
| CLI      | `js/src/cli/greetings-commands.js`  | `greetings-stickers`, `greetings-select`, `greetings-plan`, `greetings-send`.         |
| SPA      | `js/src/web/greetings-view.js`      | The **Greetings** screen: pick stickers, preview the plan, send.                      |

## 2. No artwork in the repository

Every sticker is stored as the network's own identifier plus a link the
network serves itself:

- **VK** — `sticker_id`; the preview is
  `https://vk.com/sticker/1-<id>-512`. The 43 built-in ids come from
  vk-bot's `stickers/greeting.json`; 20 of them are marked `common`, the
  set vk-bot greets with, and form the default selection. vk-bot's
  `incomingGreetingStickersIds` are used only to _recognise_ an
  incoming greeting.
- **Telegram** — Bot API `file_id`s are specific to each bot, so they
  cannot be collected in advance. The catalogue stores sticker **set
  names** (`HotCherry`, `UtyaDuck`, …, each with its
  `https://t.me/addstickers/<name>` link) and the adapter lists the
  stickers whose emoji is a greeting gesture (👋 🖐 🖖 🙋 🤚 ✋ 🙌) live
  with `getStickerSet`. Previews go through
  `GET /api/greetings/file?id=<thumbnail file_id>` on the user's own
  server, which calls `getFile` and streams the image, so the bot token
  never reaches the browser.
- **Messenger** — the thumbs-up `369239263222822` is the one sticker
  every Page can always send; there is no public catalogue API.
- **WhatsApp** — a sticker is an uploaded media id or a public `.webp`
  link; the user supplies their own.

The Content Security Policy allows images from `'self'`, `data:`,
`blob:` and `https://vk.com` only.

## 3. What each network allows

| Network  | Sticker addressed by | Live listing                | Who can be greeted                                      |
| -------- | -------------------- | --------------------------- | ------------------------------------------------------- |
| VK       | `sticker_id`         | `store.getStickersKeywords` | Any known chat (error 901/902 if they block messages).  |
| Telegram | `file_id` or `.webp` | `getStickerSet`             | Replies only: a bot cannot open a conversation.         |
| WhatsApp | media id or `.webp`  | —                           | Within 24 h of the contact's last message.              |
| Facebook | `sticker_id`         | —                           | Within 24 h of the contact's last message.              |
| Zalo     | `attachment_id`      | —                           | Within 48 h (catalogued; there is no Zalo adapter yet). |
| X        | — (text only)        | —                           | Any known chat.                                         |
| Email    | — (text only)        | —                           | Any known address.                                      |

The planner turns these rules into skip reasons rather than failed
sends: `outside-messaging-window`, `network-unsupported` and
`no-greeting-available` (no sticker applies and the selection holds no
text for the language). A network without stickers, or a user who
prefers text, gets one of the selected greeting texts instead.

## 4. Planning

`planGreetings({links, mode, selection, limit = 10, staleDays = 30})`
summarises the stored messages per chat, then:

- **`initiate`** — chats never written to come first, oldest last
  message first; after them, chats where the user wrote last but that
  have been silent longer than `staleDays`. Chats already greeted
  (`greeting:<network>:<chat>` exists) are left out.
- **`reply`** — chats whose last message is an unanswered greeting:
  "Привет!", "hi", "你好", "नमस्ते", "xin chào", a bare 👋, or a known
  greeting sticker. Text greetings are answered in the language they
  were written in; a sticker or a bare wave uses the selected language.

Each chat becomes an envelope `{network, chat, contact, language, kind,
sticker, text, lastMessageAt, skipped?}`. `limit` counts only envelopes
that will actually be sent. The planner takes `random` and `now` as
arguments, so a preview shows exactly what a send will do.

## 5. Sending

`runGreetings(plan, {store, delayMs})` sends the envelopes one by one
through each network's `live.post` and waits `delayMs` between messages
(30 s by default, as in vk-bot) so a batch does not look like a burst of
spam. Each success is recorded as a `greeting:<network>:<chat>` link, so
the same chat is never greeted twice. A failure (for example VK error 901) is reported for that chat and the run continues. Credentials are
read from the same `secret:<network>:…` links the sync already uses.

## 6. Surfaces

```bash
meta-sovereign greetings-stickers                       # built-in catalogue
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --sets=UtyaDuck --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply --delay-ms=30000
```

| Method | Path                       | Purpose                                                    |
| ------ | -------------------------- | ---------------------------------------------------------- |
| GET    | `/api/greetings/catalogue` | Networks, built-in stickers, Telegram sets, texts.         |
| GET    | `/api/greetings/selection` | The saved selection (or the default one).                  |
| PUT    | `/api/greetings/selection` | Save a selection; unknown networks are dropped.            |
| POST   | `/api/greetings/stickers`  | List stickers live (`{networks}`).                         |
| POST   | `/api/greetings/plan`      | Preview (`{mode, …}`) or send (`run: 'queue'`, `delayMs`). |
| GET    | `/api/greetings/file?id=`  | Telegram thumbnail proxy.                                  |

Over HTTP, `delayMs` is capped at 60 000 so a request cannot hang for
hours. The Rust server does not have these routes yet. Without them the
SPA falls back to the local store for the catalogue, the selection and the
preview, and states that listing and sending need the JS server.

The **Greetings** screen shows the networks table, the sticker grid
(built-in, live and previously picked stickers, each once), the
Telegram sets with their `t.me` links, the language and
sticker-or-text preference, and the plan. **Send** stays disabled until
the preview contains at least one chat that will actually be greeted.

## 7. Known gaps

- **Telegram's own empty-chat stickers.** Telegram apps suggest
  stickers on an empty chat by calling `messages.getStickers` with the
  emoticon `👋⭐️` (TDLib: `getGreetingStickers`). That is an MTProto
  _user_ API call; the Bot API cannot reach it, and a bot cannot start
  a chat anyway. The screen says so, and offers the live set listing
  instead. Supporting it would need a user-account client (TDLib),
  which is a separate integration.
- **Zalo** is catalogued, but there is no Zalo adapter yet.
- **X** DMs carry no stickers, so X is greeted with text only.
