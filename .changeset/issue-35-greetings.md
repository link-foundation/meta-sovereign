---
'meta-sovereign': minor
---

Greetings (issue #35): open dialogs with a "hi" or a greeting sticker
the way [konard/vk-bot](https://github.com/konard/vk-bot) does, across
VK, Telegram, WhatsApp, Messenger, X and email. A new
`js/src/greetings/` subsystem holds a catalogue of what each network
allows (stickers, live listing, who can be greeted), detects incoming
greetings in en/ru/zh/hi/vi (the Russian pattern is vk-bot's), plans
who to greet — never-written chats first, or unanswered greetings in
`reply` mode — and sends with a pause between messages (30 s by
default), recording `greeting:<network>:<chat>` so nobody is greeted
twice. Messaging-window rules (WhatsApp and Messenger 24 h, Telegram
bots reply-only) become skip reasons in the preview, not failed sends.

No artwork is added to the repository. VK stickers are referenced by id
with direct `https://vk.com/sticker/1-<id>-512` previews (43 from
vk-bot's catalogue). Telegram sets are listed live with `getStickerSet`,
and their thumbnails are proxied through `GET /api/greetings/file` so
the bot token never reaches the browser. VK keyword stickers are listed
live with `store.getStickersKeywords`. The VK, Telegram, WhatsApp and
Messenger adapters can now send stickers and parse incoming ones.

The feature is exposed in three places: six `/api/greetings/*` routes,
four CLI commands (`greetings-stickers`, `greetings-select`,
`greetings-plan`, `greetings-send`), and a **Greetings** screen in the
SPA (en/ru/zh/hi) where the user picks stickers, previews the plan and
sends it. Telegram's own empty-chat suggestions (`messages.getStickers`
"👋⭐️") need the MTProto user API, which bots cannot call; the screen
says so. Documented in `docs/GREETINGS.md` (+ ru/zh/hi), USER-GUIDE
section 10 and `docs/case-studies/issue-35/`.
