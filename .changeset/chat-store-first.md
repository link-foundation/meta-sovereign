---
'meta-sovereign': minor
---

Chat reads every network store first and by priority (R-Y24 .. R-Y33).
Every message ever loaded stays in the app folder's store, along with
everything Telegram said about it (`raw`), so it is never asked for
again and can be analysed offline. Requests go one at a time: the chat
on screen comes first, then the chat list, then a prefetch of the chats
visible in the list, then a slow background download of whole histories
(private chats, then groups; channels only on demand). Scrolling up
loads older messages two screens ahead and keeps the reading position.
The page holds only the chat list and pages of the open chat (the new
`/api/chat/heads` and `/api/chat/messages` endpoints), and `data.lino`
is now an append log, so whole histories stay fast. New tabs filter the
list by All, Private, Groups and Channels. The tutorial no longer comes
back once a service is connected. Working rules for people and AI agents
are now in CONTRIBUTING (four languages) and `CLAUDE.md`.
