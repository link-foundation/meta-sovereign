# External research: how real chat apps send, sync and show messages

Collected on 2026-10-16/17 while hardening the Chat screen (see
[README](README.md)). Three research passes read the source of
Telegram's official clients, TDLib, Signal Desktop and Element /
matrix-js-sdk. The commits they read, and pinned links to every cited
line, are in [`docs/CHAT-REFERENCES.md`](../../CHAT-REFERENCES.md).
Line numbers below refer to those commits.

The notes are kept as the researchers wrote them, so they can be
re-checked later. Where a note turned out to be wrong when we checked
it against the code (theirs or ours), the correction is listed first.

## Corrections after checking

- **"IME composition guard missing" (Telegram web report, P4)** — not
  true for our code: the composer already ignores Enter while
  `event.nativeEvent.isComposing` or `keyCode === 229`
  (`js/src/web/chat-view.js`).
- **"Link previews always disabled" (TDLib report, gap 10)** — not
  true: we call `messages.SendMessage` without `noWebpage`, so Telegram
  shows previews by default, like TDLib and Telegram Desktop.
- **tweb line numbers** — `beforeMessageSending` is at line 4917 (not
  4989); `pendingByRandomId` is declared at 693 and filled at 10720;
  the split uses `config.message_length_max` at 3222–3223.
- **TDLib `view_messages`** is at 16526 and `read_history_on_server` at
  17634 (the report's 16944 is a different function).
- **"RANDOM_ID_DUPLICATE is never returned, the server answers with
  the old message" (TDLib report, Q1)** — an inference, not something
  the code shows. Telegram documents `RANDOM_ID_DUPLICATE` as an error
  of `messages.sendMessage`; we keep treating it as "already sent".
- **"Our typing interval is 4 s" / "typing is opt-in"** — both true;
  sharing typing stays opt-in on purpose (it tells the other person
  something), see the README.

## 1. Telegram web clients (Telegram Web K / tweb, Telegram Web A / telegram-tt)

### File references used

- tweb: `src/lib/appManagers/appMessagesManager.ts` (16031 lines), `src/helpers/random.ts`, `src/components/chat/input.ts`, `src/components/chat/bubbles.ts`, `src/lib/appManagers/apiUpdatesManager.ts`
- telegram-tt: `src/api/gramjs/methods/messages.ts` (3460 lines), `src/api/gramjs/apiBuilders/messages.ts`, `src/api/gramjs/updates/updateManager.ts`, `src/components/middle/hooks/useMessageObservers.ts`, `src/hooks/useSendMessageAction.ts`, `src/components/middle/composer/hooks/useDraft.ts`, `src/config.ts`, `src/components/middle/message/MessageMeta.tsx`

---

#### Q1. Sending: random_id, temp id, pending state, UpdateMessageID, duplicate avoidance

**tweb**

`randomLong()` in `helpers/random.ts:14-15`:

```ts
return '' + nextRandomUint(32) + (nextRandomUint(32) % 0xffffff);
```

Two 32-bit `crypto.getRandomValues` calls concatenated as a string (64-bit equivalent). The value is passed directly as `message.random_id` in the API call (`appMessagesManager.ts:1385`).

Temp ID: `beforeMessageSending` at line 4989 registers `pendingByRandomId[randomId] = { peerId, tempId: messageId, threadId, storage, sequential }`. The `tempId` (a negative integer allocated by the local message store) is the placeholder that appears in the UI. The `pendingByMessageId` map (line 696) goes the other way: real mid → randomId.

`onUpdateMessageId` handler (line 10788):

```ts
private onUpdateMessageId = (update: Update.updateMessageID) => {
  const randomId = update.random_id;
  const pendingData = this.pendingByRandomId[randomId];
  if (!pendingData) return;
  const mid = this.appMessagesIdsManager.generateMessageId(update.id, channelId);
  this.pendingByMessageId[mid] = randomId;
};
```

When the real `updateNewMessage` arrives later, `checkPendingMessage` looks up `pendingByMessageId[mid]` to know it replaces a temp. If the `updateNewMessage` arrives before the `UpdateMessageID`, the check fires when the update is finally processed. Dedup: both maps together prevent double-display.

For `updateShortSentMessage` (RPC direct reply), the manager reads it from the RPC resolve callback (line 3336) and calls `processUpdateMessage`, which routes it through the same `onUpdateMessageId` path.

**telegram-tt**

`generateRandomBigInt()` in `lib/gramjs/Helpers.ts:132`:

```ts
return readBigIntFromBuffer(generateRandomBytes(8), true, true);
```

True 8-byte secure random. Stored per-send as a plain `GramJs.long`.

Local message ID via `getNextLocalMessageId` at `api/gramjs/apiBuilders/messages.ts:94-96`:

```ts
function getNextLocalMessageId(lastMessageId = 0) {
  return lastMessageId + ++localMessageCounter / LOCAL_MESSAGES_LIMIT;
}
```

A fractional increment above the last known server ID (never negative, always less than next real integer). `buildLocalMessage` sets `sendingState` to nothing initially; the API layer sets it to `messageSendingStatePending` after `FAST_SEND_TIMEOUT = 1000ms` (messages.ts:145,457) if the server hasn't confirmed yet.

`handleLocalMessageUpdate` at messages.ts:3049 handles both `UpdateShortSentMessage` and `UpdateMessageID` and updates the local message's id in place. `handleMultipleLocalMessagesUpdate` at 3010 processes batches. Dedup: `localMessages[randomId.toString()]` map per send, keyed by randomId string.

---

#### Q2. Send queue: sequential vs parallel, invokeAfterMsg

**tweb**

Strictly sequential per chat via `pendingAfterMsgs[peerId]` chain (`appMessagesManager.ts:696-698, 3262-3263`):

```ts
if (this.pendingAfterMsgs[peerId]) {
  sentRequestOptions.afterMessageId = this.pendingAfterMsgs[peerId].messageId;
}
// ...
this.pendingAfterMsgs[peerId] = sentRequestOptions;
```

Each call to `invokeApiAfter('messages.sendMessage', ..., sentRequestOptions)` passes the previous request's id as the MTProto `invokeAfterMsg` container. `beforeMessageSending` is called with `sequential: true` (lines 3405, 4774). This is true MTProto-level sequencing.

**telegram-tt**

For media uploads, a single module-level `mediaQueue = Promise.resolve()` chain is used (messages.ts:373, 927-928, 945, 956) — each upload awaits `prevMediaQueue`. For plain text messages there is no explicit per-chat sequential queue at the JS level; GramJS handles delivery. No `invokeAfterMsg` usage found for text sends.

---

#### Q3. Failures, FLOOD_WAIT, disconnect, persistence

**tweb**

On RPC error (appMessagesManager.ts ~3383): `toggleError(error)` marks the bubble with `message.error`; `cancelPendingMessage` is called, which dispatches `updateDeleteMessages` locally to remove the temp bubble, then removes it from `pendingByRandomId`. Status shows as `'error'` in `bubbles.ts:11224`. No auto-retry for FLOOD_WAIT on message sends found. On network disconnect the in-memory pending map is lost; pending messages are not persisted to IndexedDB.

**telegram-tt**

`sendingState: 'messageSendingStateFailed'` set on message on failure (`ActionMessage.tsx:583`). FloodWaitError auto-retry is present for file downloads only (`downloadFile.ts:289`); no auto-retry for message sends. Pending messages are in-memory only, lost on reload.

---

#### Q4. Composer

**tweb**

- Draft debounce: `debounce(..., 2500)` at `input.ts:1755` → `messages.saveDraft` on each keystroke lull (2.5 s).
- Splitting: `splitStringByLength(text, config.message_length_max)` (`appMessagesManager.ts:3222`); max length from server config (not hardcoded 4096). Each part is a separate `sendText` call with `sequential: true`.
- Entities: full `parseMarkdown` + `parseEntities` + `mergeEntities` pipeline.
- IME: no explicit `isComposing` guard found in input.ts Enter handler; typing action checks `isUserInput = !!(e?.isTrusted || e?.chatInputEditorUserInput)` (line ~3808) so programmatic changes don't fire typing.
- Typing throttle: `(time - this.lastTimeType) >= 6000` (input.ts line ~3812) — fires at most once every 6 s.

**telegram-tt**

- Draft debounce: `DRAFT_DEBOUNCE = 10000` ms (config.ts:170), saved by `useDraft.ts:84` on richMessage change.
- IME Enter guard: `MessageInput.tsx:604`: `if (!e.isComposing && isSendShortcut(e))` — Enter during IME composition is explicitly ignored.
- Typing throttle: `SEND_MESSAGE_ACTION_INTERVAL = 3000` ms (config.ts:171); `useSendMessageAction` wraps it in `throttle(...)` (hooks/useSendMessageAction.ts).
- Cancel typing: `sendMessageAction({ type: 'cancel' })` on empty input (Composer.tsx:965).

---

#### Q5. Delivery status

**tweb**

`bubbles.ts:11224-11227`:

```ts
if (message.error) status = 'error';
else if (context.isOutgoing) status = 'sending';
else if (isEphemeral) status = 'sent';
else
  status =
    message.pFlags.unread || message.pFlags.is_scheduled ? 'sent' : 'read';
```

`pFlags.unread` is set true on outgoing messages until the server sends `UpdateReadHistoryOutbox` for the dialog. `unreadOut` set tracks which outgoing mids are still unread.

**telegram-tt**

`messageSendingStatePending` (clock icon) and `messageSendingStateFailed` (error icon) from `ApiMessage.sendingState`. Read status: message is "read" if `message.id <= chat.lastReadOutboxMessageId`. Updated by incoming `updateReadHistoryOutbox`.

---

#### Q6. Updates: gap handling, reconnect, dedup, typing, deletions

**tweb**

`apiUpdatesManager.ts` maintains `pts`, `seq` per-channel. Gap detection: when `nextSeq !== state.seq + 1`, defers and calls `getDifference()` (line 187). `getDifference` calls `updates.getDifference` with current `pts/date/qts`; `getChannelDifference` for channels. Reconnect: tweb reconnects via the MTProto layer which triggers pending updates to be flushed; gaps trigger `getDifference`. `UpdateDeleteMessages` processed by `onUpdateDeleteMessages`.

**telegram-tt**

`updateManager.ts:397`: full `getDifference` with `pts/date/qts`. `scheduleGetDifference` (line 375) debounces calls on seq gap. `client.setPingCallback(getDifference)` (client.ts:144) — on every TCP ping (which fires on reconnect), `getDifference` is called automatically. `DifferenceSlice` is handled recursively until complete (lines 437-439).

---

#### Q7. Marking incoming as read

**tweb**

`bubbles.ts:3401`: `readHistory({peerId, maxId, ...})` called when unread messages scroll into view (intersection callback updates `unreaded` map). `onScrolledAllDown` (line 6646) calls `readHistory` with `historyMaxId`. Uses `messages.readHistory` / `channels.readHistory` server calls.

**telegram-tt**

`useMessageObservers.ts`: `IntersectionObserver` with `INTERSECTION_THROTTLE_FOR_READING = 150ms` (line 16). Guard at line 58: `if (type !== 'thread' || isBackgroundModeActive()) return;` — read marking is frozen when window is backgrounded. When the highest intersecting unread message id >= `memoFirstUnreadId`, dispatches `markMessageListRead({ maxId })`. That calls `markMessageListRead` in messages.ts which invokes `channels.ReadHistory` or `messages.ReadHistory`.

---

#### Q8. Scrolling

**tweb**

New outgoing messages: `dispatchEvent('history_append', ...)` which the bubbles component handles to scroll if at bottom.

**telegram-tt**

`useScrollHooks.ts:20-21`: `FAB_THRESHOLD = 50px` (scroll-down button visible), `NOTCH_THRESHOLD = 1px` (truly at bottom). `MessageList.tsx:1045`: `isAtBottom = bottomOffset <= BOTTOM_THRESHOLD`. When `wasMessageAdded && isAtBottom` (line 1062), auto-scrolls. When `isUnread`, FAB shows when `!isAtBottom` (50px threshold); otherwise shows when not within `FAB_THRESHOLD` (50px). Older messages: paginated by `offset_id`.

---

#### Q9. Typing-out throttle and cancel

**tweb**

Throttle: 6000 ms (`input.ts:~3812`). Cancel: `sendMessageCancelAction` when input is empty (`input.ts:3790`). Only fires on real user input (`isTrusted`).

**telegram-tt**

Throttle: 3000 ms (`SEND_MESSAGE_ACTION_INTERVAL`, config.ts:171). Cancel: `{ type: 'cancel' }` action on record stop or empty (Composer.tsx:965). Fires through `useSendMessageAction` throttle wrapper.

---

#### Q10. Other notable practices

- **tweb** uses `splitStringByLength(text, config.message_length_max)` where `message_length_max` comes from the server config, not hardcoded. Entity slices are re-aligned per part (`sliceMessageEntities`).
- **telegram-tt** shows no pending clock for sends completing under 1 second (`FAST_SEND_TIMEOUT = 1000ms`), reducing visual noise on fast connections.
- Both clients use `IntersectionObserver` for read tracking, not polling or element position math.
- **telegram-tt** explicitly guards `isComposing` on Enter — Korean, Japanese, Chinese IMEs cannot accidentally send.
- Both clients support full entity/parse-mode pipelines; neither sends plain-text-only.
- **tweb** uses MTProto-level `invokeAfterMsg` for true server-side sequencing; telegram-tt uses a JS promise queue for media only.

---

### Gaps in our implementation vs. these clients

Priority order (highest impact first):

**P1 — No getDifference / reconnect catch-up (Q6)**
Both clients call `getDifference(pts, date, qts)` on reconnect (telegram-tt does it on every ping; tweb on gaps). Our 30-second poll of changed dialogs will miss messages, edits, and deletions that arrive during a disconnect window. Recommended: implement `updates.getDifference` on WebSocket reconnect, storing and advancing `pts`/`qts`/`seq` state.

**P2 — Never mark incoming messages as read (Q7)**
Neither client sends `messages.readHistory` on our behalf; we never send it at all. This means the sender never sees double-check marks, and unread counts never clear on the server. Recommended: implement IntersectionObserver on incoming message bubbles + `isBackgroundModeActive()` guard, debounced, calling `messages.readHistory` / `channels.readHistory` with `maxId`.

**P3 — No server-side draft save (Q4)**
Both clients call `messages.saveDraft` (tweb: 2.5 s debounce; telegram-tt: 10 s debounce). Recommended: add a debounced `messages.saveDraft` call on input change (2.5–10 s); call it immediately on chat switch / page unload.

**P4 — IME composition guard missing (Q4)**
telegram-tt explicitly checks `!e.isComposing` before processing Enter as Send. Our composer must guard `if (e.isComposing) return;` before the Enter-to-send handler, otherwise CJK input users will accidentally send partial syllables.

**P5 — Hardcoded 4096 split vs. server config (Q4 / Q10)**
tweb uses `config.message_length_max` from the server. The limit may differ for premium accounts or future API changes. Recommended: read `message_length_max` from `help.getConfig` at startup and use that instead.

**P6 — Typing throttle interval (Q9)**
We throttle to 4 s; telegram-tt uses 3 s, tweb uses 6 s. Our 4 s is fine and within range; no change required. The more important gap is that our typing is opt-in — both reference clients always send typing actions. Recommended: make typing notifications always-on (not opt-in), matching standard UX.

**P7 — FAST_SEND_TIMEOUT clock suppression (Q1 / Q5)**
telegram-tt suppresses the pending-clock icon for sends confirmed within 1 second. We always show the clock immediately. Recommended: delay showing the clock icon by ~800–1000 ms for cleaner UX on fast connections.

**P8 — No UpdateMessageID dedup guard (Q1)**
Both clients maintain a `pendingByRandomId` + `pendingByMessageId` double-map to handle the race between the RPC response and the pushed `updateNewMessage`. Our server-side clientId dedup is good, but if the GramJS update fires before the RPC resolves, we may briefly show a duplicate. Recommended: maintain a `randomId → localId` map and skip inserting a message whose real ID already replaced its local placeholder.

**P9 — No invokeAfterMsg MTProto sequencing (Q2)**
tweb uses `invokeAfterMsg` at the MTProto level to guarantee server ordering. We use a JS promise chain (same conceptual approach). This is a minor gap; the JS queue works for most cases. If we ever bypass GramJS MTProto serialization, add `invokeAfterMsg`.

**P10 — Scroll-down FAB threshold (Q8)**
We use 80 px; telegram-tt uses 50 px. Minor cosmetic difference, not critical.

## 2. TDLib and Telegram Desktop

**Sources checked (all shallow sparse clones, read-only):**

- TDLib: `td/telegram/MessagesManager.cpp` (36 814 lines), `UpdatesManager.cpp` (5 195 lines), `MessageEntity.cpp`, `InputMessageText.cpp`, `OptionManager.cpp`, `MessagesManager.h`, `SequenceDispatcher.h`, `misc.cpp`
- Telegram Desktop: `Telegram/SourceFiles/api/api_sending.cpp` (1 339 lines), `api_send_progress.cpp`
- Android not checked (large Java repo; the TDLib + tdesktop evidence is sufficient for all 10 questions)

---

#### Q1 – random_id: generation, persistence, restart behaviour, updateMessageID, RANDOM_ID_DUPLICATE

**Generation.** TDLib generates the random_id with a `do-while` that calls `Random::secure_int64()` and retries until the value is neither 0 nor already in `being_sent_messages_`:

```cpp
// MessagesManager.cpp:20786-20788
random_id = Random::secure_int64();
} while (random_id == 0 || being_sent_messages_.count(random_id) > 0 ||
         d->random_id_to_message_id.count(random_id) > 0);
```

Tdesktop uses `base::RandomValue<uint64>()` (api_sending.cpp:103, 209, 466), a cryptographically-secure random integer with no retry; collisions are treated as impossible at 64 bits.

**Persistence.** TDLib stores every outgoing message to the binlog before firing the network query:

```cpp
// MessagesManager.cpp:21874-21875
m->send_message_log_event_id =
    binlog_add(G()->td_db()->get_binlog(), LogEvent::HandlerType::SendMessage, get_log_event_storer(log_event));
```

This is conditional on `G()->use_message_database()`. On a clean restart the `HandlerType::SendMessage` log events are replayed at line 35842, loading the same `Message` object — including its original `random_id` — and calling `continue_send_message` → `do_send_message`. So **yes: pending messages are re-sent on restart with the identical random_id.**

**Mapping.** `on_update_message_id(random_id, new_message_id)` at line 25531 records `update_message_ids_.set(dialog_id, new_message_id, old_local_id)`. Until that fires, `being_sent_messages_[random_id]` holds the local `MessageFullId`.

**RANDOM_ID_DUPLICATE.** There is no explicit string-match for `"RANDOM_ID_DUPLICATE"` in either client codebase. The server's intended behaviour is to return a normal `updateSentMessage` / `updateMessageID` with the original message's server id when it sees a duplicate random_id, which the client handles transparently via `on_update_message_id`. The duplicate is therefore silently treated as a successful send.

---

#### Q2 – Ordering: sequential sending, invokeAfterMsg, failure propagation

TDLib does **not** use `invokeAfterMsg` for regular outgoing text messages. `on_text_message_ready_to_send` (MessagesManager.cpp:22630) fires `SendMessageQuery` directly with no dependency chain. There is a TODO comment at line 16414: `// TODO do not send two queries simultaneously or use InvokeAfter`, referencing notification-settings updates — it has not been implemented for messages.

Media messages that share a queue type use a per-`(dialog, content-type)` `yet_unsent_media_queues_` keyed by `ChainId(dialog_id, content_type).get()` (MessagesManager.cpp:21326), so that multiple concurrent photo uploads go out in order when `G()->keep_media_order()` is true (MessagesManager.cpp:22694). When a message is removed from the queue (whether because it succeeded or failed), `on_yet_unsent_media_queue_updated` fires for the next entry (MessagesManager.cpp:21342), so **a failure does not block later messages in the queue.**

There is no cross-type or cross-chat sequencing. Text messages are fully independent of each other.

---

#### Q3 – Error handling: FLOOD_WAIT, network errors, failed state, resend

**FLOOD_WAIT (error 420/429).** `process_send_message_fail_error` (MessagesManager.cpp:27990) normalises error 420 to 429 and then `on_send_message_fail` calls `fail_send_message`. Inside `fail_send_message` (line 28265-28271):

```cpp
message->is_failed_to_send = true;
message->send_error_code = error_code;
message->try_resend_at = 0.0;
auto retry_after = Global::get_retry_after(error_code, error_message);
if (retry_after > 0) {
    message->try_resend_at = Time::now() + retry_after;
}
```

TDLib records the retry-after timestamp on the failed message but **does not auto-retry.** `updateMessageSendFailed` is sent to the client app. The app must call `resendMessages` explicitly, which respects `try_resend_at`.

**Network disconnect / clean shutdown.** `SendMessageQuery::on_error` (MessagesManager.cpp:1258-1262):

```cpp
if (G()->close_flag() && G()->use_message_database()) {
    // do not send error, message will be re-sent after restart
    return;
}
```

On reconnect, the persisted log event causes automatic resend (see Q1). No user action required.

**Failed state.** `fail_send_message` assigns a new local `MessageId` (`old_id.get_next_message_id(MessageType::Local)`, line 28232), re-inserts the message with `is_failed_to_send = true`, and fires `updateMessageSendFailed`. To resend, the app calls `resendMessages`; to discard, it calls `deleteMessages`.

---

#### Q4 – Message length: 4096 limit, splitting, empty text, trimming

**4096 limit.** TDLib's `OptionManager.cpp:218`:

```cpp
set_default_integer_option("message_text_length_max", 4096);
```

This is UTF-16 code units. It is the server-enforced limit; the server returns `MESSAGE_TOO_LONG` if exceeded (handled in `process_send_message_fail_error` at line 28000). Neither TDLib nor tdesktop implement client-side splitting of overlong text. There is no splitting-at-last-space logic in either codebase. The 4096 figure is a soft cap per option, not a hard-coded branch.

**Empty / whitespace-only text.** `fix_formatted_text` (MessageEntity.cpp:4561) fully trims leading spaces/newlines (`ltrim`, lines 4619-4635) and trailing whitespace (`rtrim`, lines 4606-4617). If the resulting string is empty and `allow_empty` is false, it returns `Status::Error(400, "Text must be non-empty")`.

**Trimming behaviour.** Both leading and trailing space/newline characters are stripped. The `skip_trim` parameter can suppress this (used for drafts: `process_input_message_text` passes `for_draft` as `skip_trim`, InputMessageText.cpp:61-62).

---

#### Q5 – Updates & gaps: pts/qts/seq, getDifference, gap timing, deduplication

**Constants** (UpdatesManager.h:165-168):

```cpp
static constexpr int32 GAP_TIMEOUT_UPDATE_COUNT = 20;
static constexpr double MIN_UNFILLED_GAP_TIME = 0.05;
static constexpr double MAX_UNFILLED_GAP_TIME = 0.7;
static constexpr double MAX_PTS_SAVE_DELAY = 0.05;
```

**Gap detection.** When a pts update arrives out-of-order, `add_pending_pts_update` sets:

```cpp
// UpdatesManager.cpp:3176
set_pts_gap_timeout(max(receive_time + MAX_UNFILLED_GAP_TIME - Time::now(), 0.001));
```

Normally this fires within 0.7 s of receiving the first out-of-order update. For seq gaps the same `MAX_UNFILLED_GAP_TIME` is used (line 2846). When the timer fires, `repair_pts_gap` → `fill_pts_gap` first tries to fetch the specific missing update; if that also fails, `schedule_get_difference` is called.

**getDifference scheduling.** `schedule_get_difference` uses an exponential-backoff `retry_time_`, doubling per call up to a random 60-80 s ceiling (UpdatesManager.cpp:1338-1360). On successful reconnect, `get_difference` (line 480) is called unconditionally.

**Deduplication.** If `new_pts <= old_pts`, the update goes to `skip_old_pending_pts_update` (UpdatesManager.cpp:3098); duplicate updates received after getDifference (source `AFTER_GET_DIFFERENCE_SOURCE`) are also dropped.

---

#### Q6 – Read state: outbox "read" check, readHistory trigger, window-active gating

**Outbox "read" (double-tick).** When `updateReadHistoryOutbox` arrives, `read_history_outbox` is called (MessagesManager.cpp:5758), which calls `set_dialog_last_read_outbox_message_id(d, max_message_id)` (line 9529). A sent message is shown as read when its server_message_id ≤ `d->last_read_outbox_message_id`.

**readHistory trigger.** `view_messages` (MessagesManager.cpp:16526) sets `need_read = force_read || is_dialog_history` (line 16541). `is_dialog_history` is true only when `source` is `DialogHistory`, `MessageThreadHistory`, `ForumTopicHistory`, or `MonoforumHistory`. The source auto-selects `DialogHistory` only when `d->open_count > 0` (line 16534). So **readHistory is only sent when the dialog is open** (i.e., the user has the chat visible). After building the max read message id locally, `read_history_on_server` (line 16944) sends `messages.readHistory` or `channels.readHistory` to the server (MessagesManager.cpp:663, 709).

---

#### Q7 – Typing: SetTyping cadence, cancel, incoming timeout

**tdesktop** (api_send_progress.cpp):

```cpp
constexpr auto kCancelTypingActionTimeout = crl::time(5000);   // line 21
constexpr auto kSendMySpeakingInterval   = 3 * crl::time(1000); // line 22
constexpr auto kSendMyTypingInterval     = 5 * crl::time(1000); // line 23
```

`updated()` (line 85-108) only returns `true` (i.e., actually sends) when `sendEach` = 5 000 ms has elapsed since the last send. The action is re-sent every 5 s while the user continues typing. Not sent to broadcast channels (line 70).

**Cancel.** `cancelTyping()` (line 50) is called by a `_stopTypingTimer` that fires 5 s after the last keystroke. On message send, `cancel_dialog_action` (MessagesManager.cpp:26953, 31443) fires immediately.

**TDLib** manages text typing through `DialogActionManager`; MessagesManager only has a 4 s periodic ping for media-upload actions (line 29807: `pending_send_dialog_action_timeout_.add_timeout_in(dialog_id.get(), 4.0)`). Incoming typing expires after approximately 6 s in the action manager (not inspected directly but consistent with Telegram protocol documentation).

---

#### Q8 – Drafts: local drafts, saveDraft debounce, clear_draft on send

**Debounce.** When a dialog is open (`open_count > 0`), `pending_draft_message_timeout_` is set to `MIN_SAVE_DRAFT_DELAY = 1` second (MessagesManager.cpp:16021, MessagesManager.h:1689):

```cpp
pending_draft_message_timeout_.set_timeout_in(
    d->dialog_id.get(), d->open_count > 0 ? MIN_SAVE_DRAFT_DELAY : 0);
```

When the dialog is closed, the draft is saved immediately (timeout = 0), triggering `messages.saveDraft`.

**clear_draft on send.** The `clear_draft` flag is passed in from `td_api::inputMessageText::clear_draft_` (InputMessageText.cpp:68) and stored as a field on `InputMessageText`. It is sent as part of `SendMessage` flags. Tdesktop always sets `clear_draft = true` when sending.

---

#### Q9 – Deletions and edits

**updateDeleteMessages.** `delete_messages_from_updates(message_ids, is_permanent)` (MessagesManager.cpp:7851) iterates each message_id and looks it up in `message_random_id_to_dialog_id_` (for yet-unsent) and then in known dialogs. This resolves the "no peer" case by searching across all dialogs. If the message is not found locally, it is silently ignored.

**Edit display.** `updateEditMessage` / `updateEditChannelMessage` arrive with the full new message content; TDLib replaces the local message and fires `updateMessageEdited`.

---

#### Q10 – Link previews, no_webpage default, silent, other flags

**no_webpage default.** `disable_web_page_preview` defaults to `false` in `process_input_message_text` (InputMessageText.cpp:35). It is only set to `true` if the caller passes `link_preview_options.is_disabled_ = true` (line 42). Tdesktop's api_sending.cpp has no unconditional `no_webpage` override — previews are enabled by default.

**silent.** Set by `ShouldSendSilent(peer, action.options)` (api_sending.cpp:111); `InnerFillMessagePostFlags` copies it to `MTPmessages_SendMedia::Flag::f_silent` (line 114). Default: not silent.

**clear_draft.** Passed per-message from the composer (see Q8).

**Other flags normally set.** `get_message_flags(m)` in TDLib includes `f_reply_to`, `f_schedule_date`, `f_entities`, `f_send_as` as appropriate. No `f_no_webpage` unless explicitly requested.

---

### Prioritised gaps in the meta-sovereign implementation

#### Critical

**1. Pending messages not persisted across reload.**
TDLib persists every pending message to a binlog before sending and replays on restart with the same random_id. Our pending messages live only in browser/server memory and are lost on reload. Users see "sending" that never resolves. Recommendation: persist pending messages (with their random_id and clientId) to a durable store (IndexedDB client-side or Postgres server-side) and replay on reconnect.

**2. No getDifference / updates gap recovery.**
We poll dialogs every 30 s but never call `getDifference` on reconnect or when pts gaps are detected. TDLib fires `get_difference` unconditionally on reconnect, and triggers `repair_pts_gap` within 0.7 s of detecting an out-of-order pts value. We can silently miss messages when the GramJS raw update stream drops updates. Recommendation: on every reconnect call `updates.getDifference`; track the last known pts and detect gaps.

**3. readHistory never called.**
TDLib calls `messages.readHistory` whenever the dialog is open and new messages are viewed. We never call it, so the server never updates the remote read pointer and the sender never sees double-tick. Recommendation: call `readHistory` (throttled, e.g., at most once per 500 ms) for the highest visible message id whenever the chat is open and in the foreground.

#### High

**4. FLOOD_WAIT → failed + user retry is correct, but retry_after is not surfaced.**
TDLib records `try_resend_at = Time::now() + retry_after` on the failed message. We expose "wait N s" as a static label, which is correct, but we do not auto-retry after the countdown. TDLib also does not auto-retry, so this matches — but showing a countdown timer and auto-triggering resend after it expires would match standard client UX. Recommendation: start a countdown and auto-retry after `retry_after` seconds elapses.

**5. RANDOM_ID_DUPLICATE silently treated as success.**
Neither TDLib nor tdesktop have explicit RANDOM_ID_DUPLICATE handling; the server returns a normal `updateMessageID` carrying the existing server id, which the client processes as a successful send. Our implementation already does this (duplicate treated as already sent via clientId dedup), which is correct. However our dedup window is 10 min in memory; on server restart dedup state is lost. Recommendation: persist the random_id → server_message_id mapping to disk (or reuse clientId persistence from gap 1 above).

**6. Text trimming is incomplete.**
TDLib's `fix_formatted_text` strips both leading and trailing spaces and newlines. We trim leading/trailing whitespace, which covers spaces but may not handle all Unicode whitespace (e.g. `\u00A0`, `\r`). Recommendation: apply Unicode-aware trim and reject empty-after-trim text with a clear validation error before sending.

#### Medium

**7. Outgoing message ordering: no invokeAfterMsg.**
TDLib does not use `invokeAfterMsg` for text messages either (there is only a TODO comment for it). Our per-chat sequential queue is therefore at the same level as TDLib's behaviour for text. However TDLib's media queue ensures order when `keep_media_order` is set, while our queue does not differentiate by content type. This is low risk for text-only use, but worth noting if media is added later.

**8. Draft cloud sync not implemented.**
TDLib debounces `messages.saveDraft` at 1 s while the dialog is open. We never call saveDraft, so drafts are browser-local only. Users lose draft text on different devices or after page reload. Recommendation: call `messages.saveDraft` with a 1 s debounce on composer changes; call with empty content on send to clear the cloud draft.

**9. Typing cadence mismatch.**
Our composer sends a typing action every 4 s (opt-in). tdesktop sends every 5 s. The difference is minor; 4 s is within tolerance. The cancel-on-send behaviour is consistent with TDLib. The incoming 6 s TTL is correctly implemented.

**10. Link previews always disabled.**
We pass plain text with no link-preview options. TDLib default is `disable_web_page_preview = false` (previews on). While disabling previews is a valid product choice, it deviates from the official default. Recommendation: decide explicitly; if previews are wanted, pass a `link_preview_options` object without `is_disabled`.

## 3. Signal Desktop, Element Web and matrix-js-sdk

---

#### 1. Idempotency / Retries

**Matrix:** Client generates a `txnId` (UUID) in `sendCompleteEvent` (`client.ts:2863`: `const txnId = params.txnId || this.makeTxnId()`). The local event gets `event_id: "~" + roomId + ":" + txnId` and the HTTP call becomes `PUT /send/{txnId}`. On `/sync` echo, the server echoes back `unsigned.transaction_id = txnId`; `room.ts:2718` matches it to swap out the local echo. Server guarantees at-most-once delivery by idempotency key.

**Signal:** The job data carries `messageId` (a UUID) and uses the Protobuf-level `timestamp` (`sendNormalMessage.preload.ts:322`: `timestamp: targetTimestamp`) as the on-wire identifier. The Signal server deduplicates by timestamp+sender. On retry the same timestamp is reused, making the send idempotent.

---

#### 2. Local Echo / Pending Event States

**Matrix** (`event-status.ts:20-46`):

```
ENCRYPTING → SENDING → QUEUED → SENT
                ↓               ↓
             NOT_SENT        CANCELLED
```

The echo is replaced when `room.ts:2928` calls `txnToEvent.delete(remoteEvent.getUnsigned().transaction_id)` and `updatePendingEvent` patches the `event_id`. Pending-event ordering: `Chronological` (default, inline in timeline) or `Detached` (separate list via `getPendingEvents()`, shown below the live timeline) (`room.ts:96-100`).  
Cascade block: `room.ts:2808-2810` — if any queued event is `NOT_SENT`, new `addPendingEvent` calls immediately set the new event to `NOT_SENT` too, preserving order.

**Signal** (`MessageSendState.std.ts`): Per-recipient `SendStatus.Pending/Sent/Delivered/Read/Viewed/Failed/Skipped`. Failed state is stored in the DB per-recipient.

---

#### 3. Queueing

**Matrix — `MatrixScheduler`** (`scheduler.ts:56-68`): `QUEUE_MESSAGES` puts every `m.room.message` and relation/redaction into a single `"message"` named queue per client (not per room). Queue is FIFO. On send failure the retry algorithm is called; if it returns `-1` (> 4 attempts, or 4xx non-429), `clearQueue` rejects all remaining items (`scheduler.ts`). This is a global single queue, not per-room.

**Signal — `ConversationJobQueue`** (`conversationJobQueue.preload.ts:463`, `JobQueue.std.ts`): Uses `PQueue({ concurrency: 1 })` per conversation (via `InMemoryQueues`). Each conversation is strictly serialized. Jobs are persisted to DB before the call returns (`JobQueue.std.ts:add`). `commonShouldJobContinue.preload.ts` waits for `waitForOnline()` before each attempt, then sleeps `exponentialBackoffSleepTime(attempt)` — first two attempts: `[0ms, 190ms]`, then 1.9× factor capped at 15 min — before retrying. Max attempts = `exponentialBackoffMaxAttempts(DAY)` (~111 attempts over 24h) (`conversationJobQueue.preload.ts:339-341`).

---

#### 4. Persistence

**Matrix:** When `pendingEventOrdering === Detached`, `room.ts:517` calls `client.store.getPendingEvents(roomId)` on init and restores events as `NOT_SENT`. Element uses Detached ordering, so events survive page reloads.

**Signal:** All jobs are written to the DB before queuing (`JobQueue.std.ts:add → store.insert`). On startup, `streamJobs` re-reads the DB and re-enqueues all saved jobs. Unsent messages fully survive process restarts.

**Element drafts:** `SendMessageComposer.tsx:74`: `EDITOR_STATE_STORAGE_PREFIX = "mx_cider_state_"`. Draft saved to `localStorage` on `componentWillUnmount` and `beforeunload` (`line:572-575`); restored in `componentDidMount` (`line:187`). Per-room and per-thread (key suffix `_<threadEventId>`).

---

#### 5. Failure UI

**Element:** `RoomStatusBarView.tsx` exposes states `ConnectionLost`, `UnsentMessages` (with `onResendAllClick` / `onDeleteAllClick` buttons), `NeedsConsent`, `ResourceLimited`. "Resend all" calls `client.resendEvent()` (`client.ts:2560`), which sets status back to `SENDING`.

**Rate limiting:** `http-api/errors.ts:148-152` — `MatrixError.getRetryAfterMs()` reads `retry_after_ms` from `M_LIMIT_EXCEEDED` body (legacy) or the `Retry-After` HTTP header. `calculateRetryBackoff` (`http-api/utils.ts:186-211`): returns `-1` (give up) after >4 attempts or any 4xx except 429; for 429 returns `safeGetRetryAfterMs(err, 2^attempts * 1000ms)`. The scheduler then `setTimeout(processQueue, waitTimeMs)` — fully automatic.

**Signal:** `Failed` send state rendered per-message. No "resend all" global action found; retry is per-message.

---

#### 6. Composer

**IME (Element):** `BasicMessageComposer.tsx:125` — `isIMEComposing: boolean` toggled by `compositionstart` / `compositionend` listeners. `isComposing(event)` (`line:297-304`): `return !!(this.isIMEComposing || event.nativeEvent.isComposing)`. Safari extra keyDown: `line:502` — swallow `event.which == 229`. Chrome async compositionend fix: `line:282-294` — model update is `setTimeout`-deferred post-`compositionend` to avoid Chrome IME cursor bug. SendMessageComposer checks `this.editorRef.current?.isComposing(event)` first in `onKeyDown` (`line:208`).

**Clear after send:** `model.reset([])` + `clearStoredEditorState()` after `sendMessage` resolves (`line:437-440`). Draft localStorage entry removed immediately on successful send.

**Double-submit prevention:** `model.isEmpty` check at top of `sendMessage` (`line:354`). No additional debounce found; the `async sendMessage` itself is the guard.

---

#### 7. Read Receipts & Delivery Indicators

**Element:** `RoomTimelineViewModel.ts:46` — `READ_RECEIPT_DEBOUNCE_MS = 500`. `scheduleReadReceipt()` (`line:931`) debounces 500ms from each `onVisibleRangeChanged` call. `sendAutoReadReceipt()` (`line:939`) only advances (never rewinds), skips events not yet sent (`line:922-928`), and sends either `m.read` or `m.read.private` based on user setting. Fully-read marker (`m.fully_read`) is advanced once on `dispose` to avoid unread divider jumping.

**Signal:** `SendStatus.Sent/Delivered/Read/Viewed` per-recipient (`MessageSendState.std.ts`). Display condition: clock (Pending), single-check (Sent to server), double-check (Delivered), double-check filled (Read/Viewed).

---

#### 8. Typing Notifications

**Element outgoing:** `TypingStore.ts:15-16` — `TYPING_USER_TIMEOUT = 10000ms`, `TYPING_SERVER_TIMEOUT = 30000ms`. `setSelfTyping(roomId, isTyping)` sends `client.sendTyping(roomId, isTyping, 30000)`. `userTimer` auto-fires `setSelfTyping(false)` after 10s of no input. `serverTimer` runs 30s (the server-side expiry) — no explicit stop needed on expiry, server clears it.

**Element incoming:** `WhoIsTypingTile.tsx` listens to `RoomMemberEvent.Typing`; hides with a small delay timer on `RoomEvent.Timeline` so the "is typing" indicator co-hides with the arriving message.

---

#### 9. Timeline Scroll

**Element:** `RoomView.tsx:249` — `atEndOfLiveTimeline` boolean. `JumpToBottomButton.tsx` shown with `numUnreadMessages` badge. `RoomTimelineViewModel` tracks `visibleStartArrayIndex/visibleEndArrayIndex` for read receipt and unread count. Unread divider (`frozenMarkerEventId`) frozen mid-session, advanced only on dispose.

---

#### 10. Live Connection

**Matrix sync:** `sync.ts:75-78` — after `FAILED_SYNC_ERROR_THRESHOLD = 3` consecutive sync failures, transitions from `SyncState.Reconnecting` to `SyncState.Error`. `startKeepAlives()` (`sync.ts:1600`) polls `/_matrix/client/versions` with initial delay `2000 + random(0-5000)ms`, retry every `5000 + random(0-5000)ms`. On recovery emits `SyncState.Catchup`. Element maps `Error/Reconnecting` → `RoomStatusBarState.ConnectionLost` banner.

**Signal:** `BackOff` with `EXTENDED_FIBONACCI_TIMEOUTS` (`BackOff.std.ts`): `[1s, 2s, 3s, 5s, 8s, 13s, 21s, 34s, 55s, 89s, 144s, 233s, 377s, 610s, 987s, ~26min]`.

---

### Prioritized Gaps in meta-sovereign

**P1 — Unsent messages not persisted (data-loss risk).** Signal persists every job to the DB before returning; Matrix restores `NOT_SENT` events from store on init. We drop all pending messages on reload. Fix: write each in-flight clientId + message content to `localStorage`/`IndexedDB` before the network call, mark as `NOT_SENT` on next load and offer "You have X unsent messages" with a Resend-all action.

**P2 — No auto-retry on reconnect.** Both references automatically retry: Matrix's scheduler does exponential backoff up to 4× (with `M_LIMIT_EXCEEDED` respecting `retry_after_ms`); Signal retries for up to 24h with fibonacci-exponential backoff, waiting for `waitForOnline()` before each attempt. We require manual Retry clicks for every failure (FLOOD_WAIT included). Fix: after a transient error (5xx, timeout, network failure), schedule automatic retry: attempt 1 immediately, attempt 2 after 190ms, then ×1.9 up to 15min, for ~12h total. Respect `FLOOD_WAIT` delay automatically without requiring user action.

**P3 — No connection-lost banner.** Element shows a persistent `"Server connectivity lost"` banner (`RoomStatusBarState.ConnectionLost`) whenever the sync state is `Reconnecting` or `Error`. We silently auto-reconnect SSE. Fix: track consecutive `EventSource` `onerror` events (threshold ≥ 3); show a top-of-room "Reconnecting…" banner; dismiss immediately on the first successful SSE event.

**P4 — Per-chat drafts lost on reload (medium friction).** Element saves to `localStorage` at `mx_cider_state_<roomId>` on every `beforeunload` and on room-switch (unmount). We keep drafts in React state only. Fix: debounced `localStorage` write on each keystroke (or at minimum on `beforeunload` and chat-switch), restore on mount.

**P5 — No "Resend all / Delete all" banner.** Element's `RoomStatusBarView` surfaces a room-level banner with both actions when ≥1 message is `NOT_SENT`. We only offer per-message Retry/Delete. Fix: when ≥1 bubble is in `failed` state, show a sticky bottom-of-composer banner with "Resend all" (re-queues all failed messages in order) and "Delete all" actions.

**P6 — Queue does not block on failure.** Our per-chat sequential queue lets later messages go through even if an earlier one failed. Both Matrix (`room.ts:2808-2810`, cascades `NOT_SENT`) and Signal (FIFO job queue, blocked until retry) preserve order. If message B is delivered before message A that failed, recipients see out-of-order messages. Fix: when a message transitions to `failed`, mark all subsequent in-flight messages as `blocked`; unblock them in order when the failed message is retried or deleted.

**P7 — Automatic FLOOD_WAIT/rate-limit backoff.** Matrix reads `retry_after_ms` from the error body and delays the retry automatically. We display "wait N s" and require a click. Fix: on `FLOOD_WAIT N`, set a `setTimeout(retry, N * 1000)` and show a countdown in the bubble, replacing the manual Retry button.
