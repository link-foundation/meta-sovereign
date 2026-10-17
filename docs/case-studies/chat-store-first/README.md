# Case study: chat that reads the store first, by priority

Requirements: R-Y24 – R-Y33 in [REQUIREMENTS.md](../../REQUIREMENTS.md).

## What was asked

1. The tutorial kept reopening ("Step 1 of 8: Connect your first
   service") even though Telegram was connected and its chats were
   loaded.
2. Every message ever loaded should be kept in the app folder's links
   store (text `data.lino` and binary `data.bin`), so no network's API
   is asked twice for it.
3. Loading should follow what the user does:
   - first what is on screen, and scrolling must never reach a stretch
     that is not loaded;
   - then the chat list and a little of every visible chat;
   - switching between private chats, groups and all of them should be
     one click, newest first.
4. Whole histories should still be downloaded slowly: all private chats,
   then all groups; channels only on demand.
5. Each message should keep everything known about it, for offline
   analysis and learning replies.
6. These requirements and the working rules behind them should live in
   the repository.

## Root causes

- **The tutorial.** A tutorial version bump cleared the stored "off"
  state, and the app opened the tour without looking at existing
  connections.
- **Asking Telegram again for what was stored:**
  - the chat list was re-read every 30 s;
  - a full sync re-read every listed chat's latest messages;
  - opening a chat always asked for its history.
- **Not scaling to whole histories:**
  - the browser loaded every link on each refresh;
  - the store rewrote all of `data.lino` and `data.bin` on every change.

## What changed

| Area       | Change                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage   | `history:telegram:<chat>` records the stored stretch of each chat, from `newest` to `oldest`, and whether it reaches the first message (`telegram-history.js`).                               |
| Plans      | `historyPlan` answers from the store whenever it can. Telegram is asked only for an older page, a chat never read, or (for channels, at most once a minute) what came after `newest`.         |
| Queue      | `createFetchQueue` sends one request at a time, in priority order `view` → `list` → `prefetch` → `background`. Repeated requests are merged, and `FLOOD_WAIT` holds the two lower priorities. |
| Raw data   | `rawMessage` turns the GramJS object into plain JSON and stores it on every message link as `raw`.                                                                                            |
| Pages      | `telegram-pages.js` reads one chat's history store-first and continues the chat list from a stored cursor.                                                                                    |
| Chat index | `chat-index.js` and `GET /api/chat/heads`, `GET /api/chat/messages` serve each chat's newest message and pages of a chat. History read ahead is `quiet`, so it stays off the live stream.     |
| Browser    | `chatLinks()` loads the links that are not messages, plus each chat's newest message. `useChatWindow` grows the open chat by page.                                                            |
| Scroll     | Older messages are requested two screens before the top. The distance to the bottom is kept when a page is added, and pages added above are not counted as new messages.                      |
| Prefetch   | Chats within one screen of view get 30 messages each, one chat at a time. The chat list's next page is read before its end shows.                                                             |
| Tabs       | All / Private / Groups / Channels; the choice is remembered.                                                                                                                                  |
| Background | `telegram-backfill.js` downloads the chat list, then private chats, then groups, taking turns, one request every 5 s. It yields to anything more urgent.                                      |
| Store      | `data.lino` is an append log, compacted when needed; `data.bin` is written at most every 5 s, and the two are reconciled on open.                                                             |
| Tutorial   | `tutorial-start.js` opens the tour by itself only for a new user. Once turned off, it stays off across versions.                                                                              |
| Rules      | The CONTRIBUTING "Working rules" section (four languages) and `CLAUDE.md`.                                                                                                                    |

## Still open (tracked in R-Y28, R-Y29)

- Chat search matches chat names and each chat's newest message only;
  searching every message needs a server-side query.
- Other screens (Contacts, Patterns, …) still load every link.
- The CLI does not reconcile `data.lino` and `data.bin` when it opens
  them, and the Rust core reads only the older indented lino format.
- Messages stored before this change get `raw` only when read again.
  Service messages without text (joins, pins) are not stored yet.
