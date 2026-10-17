---
'meta-sovereign': minor
---

Chat now behaves like Telegram's own apps when the connection is
unreliable, following the open-source clients pinned in
`docs/CHAT-REFERENCES.md`: updates missed while offline are fetched with
`updates.getDifference`, reading a chat marks it read on Telegram (can
be turned off in Settings → Privacy) with unread counts and an "Unread
messages" line, drafts are kept across reloads and synced with
Telegram's cloud drafts, the outbox survives a reload and still sends
each message once, temporary failures and flood waits are retried by
themselves, a lasting failure stops the chat's queue with Resend all /
Delete all, and a banner shows when Chat is not connected.
