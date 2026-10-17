# Case study: making Chat as reliable as a real messenger

**Requirements:** R-Y15 to R-Y23 ([`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md)).
**References:** [`docs/CHAT-REFERENCES.md`](../../CHAT-REFERENCES.md)
(pinned links to every line cited here).
**Research notes:** [`external-research.md`](external-research.md).

## What went wrong

While testing Chat with a real Telegram account, the user reported:

1. A message was **sent twice**.
2. **Nothing arrived live**: replies only showed up after a reload or
   the next poll.
3. Send was not locked while a message was going out, and there was
   **no delivery status**.

Their request was that Chat "works exactly like a real chat", following
the source code of Telegram and other open-source messengers, with the
edge cases handled up front. Later they asked why those sources had not
been read first, and asked to keep links to them for the future.

The first round (commit `5da048a`) fixed the three reports. It added a
`clientId` per message and Telegram's `random_id`, an ordered send
queue, delivery ticks, and a live update stream. This case study covers
the second round. Here we read how Telegram's own apps, TDLib, Signal
and Element handle the same problems. We then compared our code with
theirs and adopted what was missing.

## How the research was done

- Three research passes read, without building or running anything:
  - the two official Telegram web apps (tweb and telegram-tt);
  - TDLib and Telegram Desktop;
  - Signal Desktop and Element with matrix-js-sdk.
- Each claim was checked against the pinned commit before acting on it.
  Five were wrong or only inferred, and they are listed at the top of
  [`external-research.md`](external-research.md).
- The links worth keeping went into
  [`docs/CHAT-REFERENCES.md`](../../CHAT-REFERENCES.md), which is pinned
  to commits and available in all four languages. It is the first place
  to look the next time any of this changes.
- Most of these projects are GPL or AGPL, and this project is
  Unlicense. We took the behaviour and wrote our own code; no code was
  copied.

## What we adopted

| Topic                       | What the reference clients do                                                                                                                                      | What we do now                                                                                                                                                                                                                                                                                                                                        | Where                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Updates missed during a gap | TDLib, Web A and Web K keep the update number (`pts`). They wait 0.7 s for a missing update, then call `updates.getDifference`, and again after every reconnect.   | We do the same: `pts` is saved per account and survives a restart. On a gap, a reconnect or `updatesTooLong` we fetch the difference slice by slice and replay it through the live handler. A difference that is too long, or a channel gap, re-reads the dialogs. The answers to our own sends and reads move the number too.                        | `js/src/sources/telegram-catchup.js`                                    |
| Our own message coming back | Web K and Web A match the echo to the placeholder by `random_id`.                                                                                                  | GramJS does not expose `random_id` on messages, so while a send is in flight its text is matched to the `clientId`; the echo replaces the pending bubble instead of adding a copy. If `RANDOM_ID_DUPLICATE` comes back (an earlier try got through), it counts as sent and the catch-up fetches the message.                                          | `telegram-account-live.js` (`createOwnMessages`), `telegram-account.js` |
| Reading marks read          | TDLib reads only while the chat is open. Web A watches what is visible and not while the app is in the background. Element waits 500 ms and never moves backwards. | The newest incoming message that is at least half visible is marked read on Telegram (`messages.readHistory` / `channels.readHistory`). This happens only while the window is focused, 500 ms later, never backwards and never twice.                                                                                                                 | `chat-state.js` (`useReadMarker`), `chat-view.js` (`useSeen`)           |
| Unread counts and divider   | Telegram shows counts per chat. Element keeps the divider where it was when the room opened.                                                                       | Counts come from Telegram's dialog numbers plus newer incoming messages, and reset when the chat is read here or on another device (`updateReadHistoryInbox`). A chat opens at an "Unread messages" line, which stays put until the chat is opened again.                                                                                             | `chat-model.js` (`unreadCount`, `firstUnreadId`)                        |
| Cloud drafts                | TDLib saves 1 s after the last change and at once on close; Web K uses 2.5 s; Telegram clears the draft on send (`clear_draft`).                                   | A Telegram chat's draft is saved to Telegram 2.5 s after typing stops, and at once when leaving the chat or the page. A draft written on another device fills an empty box (what was typed here wins). Sending clears it.                                                                                                                             | `chat-live.js` (`useDraftBox`), `/api/telegram/draft`                   |
| Drafts survive a reload     | Element keeps drafts in `localStorage` and saves them before unload.                                                                                               | Every chat's draft is kept in `localStorage` (`metaSovereignDrafts`).                                                                                                                                                                                                                                                                                 | `chat-live.js`                                                          |
| Typing stops on send        | Telegram Desktop and TDLib cancel on send; Web K cancels when the box is emptied.                                                                                  | When sharing typing is on, sending or clearing the box sends `SendMessageCancelAction` at once.                                                                                                                                                                                                                                                       | `chat-state.js` (`useTypingOut`), `/api/typing` `{cancel}`              |
| Unsent messages survive     | TDLib logs every outgoing message and resends it after a restart with the same `random_id`. Signal stores jobs first.                                              | The outbox is kept in `localStorage` (`metaSovereignOutbox`). After a reload it resumes with the same `clientId`, and the server and Telegram drop the repeat. Checked end to end: a reload in the middle of a send still sends once.                                                                                                                 | `chat-outbox.js`, `chat-live.js` (`useOutbox`)                          |
| Retrying temporary failures | Signal waits for the network, then backs off. Matrix retries a rate limit after `retry_after`. TDLib records `try_resend_at` for FLOOD_WAIT.                       | Network errors and "no answer" are retried 1 s, 2 s, 4 s … up to 60 s, and at once when the browser is back online. FLOOD_WAIT waits exactly as long as Telegram asks (plus 1 s) with a countdown and "Try now". An unknown error gets 4 tries. A server that stopped answering mid-send now gives a retryable `network` failure instead of "stored". | `chat-outbox.js` (`afterFailure`), `dom.js`                             |
| Order after a failure       | Signal runs one job at a time per conversation. Matrix fails every later message once one fails.                                                                   | A temporary wait holds the rest of that chat's queue. A permanent failure (no right to write, unknown chat, too long) fails the messages queued behind it with "the message before it failed". "Resend all" sends them again in order.                                                                                                                | `chat-outbox.js` (`cascade`, `nextToSend`)                              |
| Many failed messages        | Element shows a bar with "Resend all" and "Delete all".                                                                                                            | The same bar appears under the chat header once two or more messages failed.                                                                                                                                                                                                                                                                          | `chat-view.js` (`FailedBar`)                                            |
| Connection state            | Element shows "connection lost". Matrix moves to an error state after failed syncs.                                                                                | A banner says "No connection", "Reconnecting to the local server…" (the event stream has been closed for more than 3 s) or "Telegram is reconnecting…" (from GramJS's connection state).                                                                                                                                                              | `chat-state.js` (`useConnectionBanner`)                                 |
| The clock icon              | Web A shows the clock only after 1 s.                                                                                                                              | Same: a send that finishes within a second never shows the clock.                                                                                                                                                                                                                                                                                     | `app.css` (`bubble-clock-in`)                                           |
| Splitting long text         | Web K splits by the server's `message_length_max`.                                                                                                                 | We split by `message_length_max` from `help.getConfig` (cached; 4096 if unknown), and never between the two halves of an emoji.                                                                                                                                                                                                                       | `telegram-send.js`                                                      |

## What we did not adopt, and why

- **Sharing "typing…" stays off by default.** Every Telegram app sends
  it. Here it is a write to another service that tells the other person
  something, so it stays opt-in under Settings → Privacy, as before.
- **Read receipts are on by default.** This departs from the old
  "everything in Privacy is off by default" rule. Reading a chat in any
  Telegram app marks it read, and with marking off the unread counts
  here and on the phone would never go down. It can be turned off in
  Settings → Privacy, and then nothing is sent.
- **No `invokeAfterMsg` chaining (Web K).** We send one message of a
  chat at a time and wait for its answer, which gives the same order
  without MTProto-level chaining.
- **Signal's day-long retry budget.** A messenger may keep trying for a
  day. Here a network failure is retried while the page is open (and
  resumed after a reload), and an unknown error gives up after 4 tries,
  so the user is not surprised by a much later send.
- **Flood waits over 5 minutes** are not waited out silently. The
  message fails with the wait time and the user decides.
- **Per-channel update numbers.** Channels and supergroups have their
  own `pts`. A gap there re-reads the dialogs instead of calling
  `updates.getChannelDifference` per channel. That is simpler and the
  poll already covers it, but it is slower for very busy channels.
- **Several open tabs** each keep their own outbox. If both resume the
  same message, the server's `clientId` check and Telegram's `random_id`
  still send it once.

## How it was checked

- `js/tests/chat-reliability.test.js` covers the update counter (gaps,
  repeats, the 0.7 s timer) and the catch-up (a new account, saved
  state, slices, "too long", another account, reconnect, our own
  sends). It also covers read and draft updates, emoji-safe splitting,
  the read and draft routes, every outbox rule (retry waits, flood
  waits, the cascade, order, restoring after a reload, blocked
  storage), unread counts and the new delivery states.
- An end-to-end run in Chromium used a fake Telegram account and
  scripted send outcomes. It checked:
  - unread badges and the divider;
  - marking read once, up to the right message;
  - the draft saved to Telegram and kept across a reload;
  - a flood wait counting down and then sending;
  - a permanent failure failing the queue behind it, then "Delete all";
  - a dropped request retried by itself;
  - a reload in the middle of a send, sending once;
  - the offline banner.

  It also found two layout bugs, both fixed:
  - the "not sent" bar sat inside the floating composer;
  - scrolling to the end left the last bubbles under the composer.
