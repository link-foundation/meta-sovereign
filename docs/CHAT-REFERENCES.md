# Chat References (languages: en • [zh](CHAT-REFERENCES.zh.md) • [hi](CHAT-REFERENCES.hi.md) • [ru](CHAT-REFERENCES.ru.md))

Where real chat apps solve the same problems as our Chat screen, with
links pinned to the exact commit we read. When you change sending,
delivery status, live updates, read receipts, typing, drafts or the
message list, look here first and compare with how these clients do it.

The research behind these links, with the full notes, is in
[`case-studies/chat-reliability/`](case-studies/chat-reliability/README.md).

## Rules for using these sources

- **Learn the behaviour, never copy the code.** This project is public
  domain (Unlicense). Most of the projects below are GPL or AGPL, so
  their code cannot be pasted here. Read them to understand _what_ a
  real client does and _why_, then write our own code.
- **Links are pinned to a commit**, so a line number keeps pointing at
  the code we read even after the project moves on. To refresh a
  topic, open the project at its latest commit, find the same function
  by name, and update both the commit and the line.
- **Read, never build or run**, downloaded copies (keep them outside
  the repository, for example in a temporary folder).

## Projects

| Project                         | What it is                                     | Repository                                                                            | License    | Commit we read (date)                                                                                               |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Telegram Web K (tweb)           | Official Telegram web app (web.telegram.org/k) | [morethanwords/tweb](https://github.com/morethanwords/tweb)                           | GPL-3.0    | [`579e559`](https://github.com/morethanwords/tweb/tree/579e5590d5db93e6ef39a5bbe1900257cb594cc2) (2026-10-16)       |
| Telegram Web A (telegram-tt)    | Official Telegram web app (web.telegram.org/a) | [Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt)                             | GPL-3.0    | [`f67a408`](https://github.com/Ajaxy/telegram-tt/tree/f67a40879a7d78c2683ec5a296cf55bc22417d56) (2026-10-16)        |
| TDLib                           | Telegram's own client library                  | [tdlib/td](https://github.com/tdlib/td)                                               | BSL-1.0    | [`a94b83d`](https://github.com/tdlib/td/tree/a94b83d67ab4c8397c6245e541b31a4131ea2f79) (2026-10-14)                 |
| Telegram Desktop                | Official desktop app                           | [telegramdesktop/tdesktop](https://github.com/telegramdesktop/tdesktop)               | GPL-3.0    | [`b16daff`](https://github.com/telegramdesktop/tdesktop/tree/b16daff6df63e8a812bc2b52a04ff243f67a7d3f) (2026-10-15) |
| Telegram for Android            | Official Android app (not read yet)            | [DrKLO/Telegram](https://github.com/DrKLO/Telegram)                                   | GPL-2.0    | [`f32ffee`](https://github.com/DrKLO/Telegram/tree/f32ffeec763f0bdbf4bec25b52d654f77bff733d) (2026-10-13)           |
| Signal Desktop                  | Signal's desktop app                           | [signalapp/Signal-Desktop](https://github.com/signalapp/Signal-Desktop)               | AGPL-3.0   | [`f3040f3`](https://github.com/signalapp/Signal-Desktop/tree/f3040f3e13b6dca5021c3db149320e0f7a771f0a) (2026-10-15) |
| Element Web                     | Matrix web client                              | [element-hq/element-web](https://github.com/element-hq/element-web)                   | AGPL-3.0   | [`fc4d45c`](https://github.com/element-hq/element-web/tree/fc4d45cce130f3dce0d824ecef87bd948bcef842) (2026-10-16)   |
| matrix-js-sdk                   | Matrix client library behind Element           | [matrix-org/matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk)               | Apache-2.0 | [`d0e8162`](https://github.com/matrix-org/matrix-js-sdk/tree/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488) (2026-10-16) |
| GramJS (`telegram` npm package) | The MTProto library our server uses            | [gram-js/gramjs](https://github.com/gram-js/gramjs) (we read `node_modules/telegram`) | MIT        | version 2.26.22                                                                                                     |

## By topic

### Sending exactly once (an id per message, reused on every retry)

- Telegram Web K makes a 64-bit random id per message:
  [`randomLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/helpers/random.ts#L14).
- Telegram Web A does the same with 8 secure random bytes:
  [`generateRandomBigInt`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/lib/gramjs/Helpers.ts#L132).
- TDLib retries until the id is non-zero and unused:
  [`secure_int64` loop](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L20786).
- Matrix sends a transaction id that the server deduplicates:
  [`makeTxnId`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/client.ts#L2863),
  and matches it on the echo:
  [`transaction_id`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2718).

### Matching our own sent message (no duplicate while it is in flight)

- Telegram Web K keeps two maps, random id → placeholder and real id →
  random id:
  [`pendingByRandomId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L693),
  [`onUpdateMessageId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L10788).
- Telegram Web A swaps the local id in place:
  [`handleLocalMessageUpdate`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L3047);
  its local ids are fractions above the last real id:
  [`getNextLocalMessageId`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/apiBuilders/messages.ts#L94).

### Order of messages in one chat

- Telegram Web K chains sends with MTProto `invokeAfterMsg`:
  [`pendingAfterMsgs`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L697).
- Signal runs one job at a time per conversation:
  [`PQueue({ concurrency: 1 })`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L76).
- Matrix marks every later message "not sent" once one fails, so order
  is kept:
  [`NOT_SENT` cascade](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2808).
- TDLib, by contrast, lets later text messages go out after a failure
  (no `invokeAfterMsg` for text).

### Failures, retries and rate limits

- TDLib records when a failed message may be resent (FLOOD_WAIT) and
  leaves the resend to the app:
  [`try_resend_at`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L28259).
- Signal waits until it is online, then backs off 0 ms, 190 ms, then ×1.9
  up to 15 minutes, for about a day:
  [`exponentialBackoff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/exponentialBackoff.std.ts#L7),
  [`waitForOnline`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/helpers/commonShouldJobContinue.preload.ts#L34),
  [`MAX_ATTEMPTS`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/conversationJobQueue.preload.ts#L340).
- Matrix retries a rate limit after the server's `retry_after`, and gives
  up on other client errors:
  [`calculateRetryBackoff`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/http-api/utils.ts#L186).
- Element offers "Resend all" and "Delete all", and a "connection lost"
  bar:
  [`RoomStatusBar`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L144),
  [`onResendAllClick`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L199).

### Unsent messages survive a restart

- TDLib writes each outgoing message to its log before sending and
  resends it, with the same random id, after a restart:
  [`binlog_add`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L21875),
  [replay](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L35842),
  [no error on shutdown](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L1259).
- Signal stores jobs in its database first:
  [`JobQueue.add`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L181),
  [`streamJobs`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L143).
- Matrix restores pending events as "not sent":
  [`getPendingEvents`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L517).

### Delivery status (clock, ✓, ✓✓, failed)

- Telegram Web K:
  [status](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L11224).
- Telegram Web A shows the clock only after 1 second:
  [`FAST_SEND_TIMEOUT`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L145).
- Matrix states:
  [`EventStatus`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/event-status.ts#L21);
  Signal states:
  [`SendStatus`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/messages/MessageSendState.std.ts#L29).

### Live updates and catching up after a gap

- TDLib waits up to 0.7 s for a missing update, then asks for the
  difference:
  [`MAX_UNFILLED_GAP_TIME`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.h#L167),
  [gap timer](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L3176),
  [`get_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L480),
  [backoff](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L1338).
- Telegram Web A asks for the difference on every ping and handles
  slices:
  [`setPingCallback`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/client.ts#L144),
  [`getDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L397).
- Telegram Web K:
  [gap → `getDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L187).
- Matrix moves to an error state after 3 failed syncs and probes the
  server:
  [`FAILED_SYNC_ERROR_THRESHOLD`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L78),
  [`startKeepAlives`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L1600).
  Signal reconnects with Fibonacci delays:
  [`BackOff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/BackOff.std.ts#L20).
- GramJS's own `catchUp()` is an empty TODO
  (`node_modules/telegram/client/updates.js`), so a GramJS app has to
  do this itself.

### Each channel's own catch-up (deletions in groups)

- A supergroup or channel numbers its updates on its own (`pts`); a
  skipped number or `updateChannelTooLong` means updates (deletions
  too) never came, and the apps ask that channel's difference: TDLib
  [`get_channel_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L34711), Telegram Web K [`getChannelDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L418) on
  [`updateChannelTooLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L632), Telegram Web A [`GetChannelDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L484).
  Ours: `js/src/sources/telegram-channels.js` (R-Y35).

### Pictures in messages

- A picture is downloaded by its stored location; an expired file
  reference (`FILE_REFERENCE_*`) re-reads the message, then retries:
  TDLib [`FILE_REFERENCE_`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/FileReferenceManager.cpp#L61), Telegram Web A [`downloadMedia`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/media.ts#L29).
  Ours: `js/src/sources/telegram-media.js` (R-Y36).

### Marking incoming messages as read

- TDLib reads only while the chat is open:
  [`view_messages`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16526),
  [`read_history_on_server`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L17634).
- Telegram Web A uses an IntersectionObserver throttled to 150 ms, and
  not while the app is in the background:
  [`useMessageObservers`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useMessageObservers.ts#L15),
  [`markMessageListRead`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L1689).
- Telegram Web K:
  [`readHistory` on view](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L3401).
- Element debounces 500 ms and never moves the receipt backwards:
  [`READ_RECEIPT_DEBOUNCE_MS`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L46),
  [`sendAutoReadReceipt`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L950).

### Typing ("typing…")

- Telegram Desktop resends every 5 s and cancels 5 s after the last key:
  [`api_send_progress.cpp`](https://github.com/telegramdesktop/tdesktop/blob/b16daff6df63e8a812bc2b52a04ff243f67a7d3f/Telegram/SourceFiles/api/api_send_progress.cpp#L21);
  TDLib cancels on send:
  [`cancel_dialog_action`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L26953).
- Telegram Web A throttles to 3 s:
  [`SEND_MESSAGE_ACTION_INTERVAL`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L171);
  Telegram Web K to 6 s and cancels on an empty box:
  [throttle](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3811),
  [cancel](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3790).
- Element: 10 s of no input stops typing, the server forgets after 30 s:
  [`TypingStore`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/stores/TypingStore.ts#L14).

### Drafts

- TDLib saves a draft to the cloud 1 s after the last change while the
  chat is open, at once when it closes:
  [`MIN_SAVE_DRAFT_DELAY`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.h#L1689),
  [timer](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16021).
- Telegram Web K waits 2.5 s:
  [`saveDraftDebounced`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L1755);
  Telegram Web A 10 s:
  [`DRAFT_DEBOUNCE`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L170).
- Element keeps drafts in `localStorage` and saves them before unload:
  [`EDITOR_STATE_STORAGE_PREFIX`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L74),
  [`beforeunload`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L180).

### Composer input (IME, length, empty text)

- Enter during IME composition must not send. Telegram Web A:
  [`!e.isComposing`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/composer/MessageInput.tsx#L604);
  Element also swallows Safari's key code 229:
  [`isComposing`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L297),
  [229](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L502).
- Length: TDLib's default is 4096
  ([`message_text_length_max`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/OptionManager.cpp#L218));
  Telegram Web K splits long text by the server's
  [`message_length_max`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L3222).
- Empty text: TDLib trims both ends and refuses what is left empty:
  [`fix_formatted_text`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessageEntity.cpp#L4561).

### Scrolling the message list

- Telegram Web A shows the "scroll down" button 50 px from the bottom:
  [`FAB_THRESHOLD`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useScrollHooks.ts#L20).
- Element keeps the unread divider fixed while the room is open
  ([`RoomTimelineViewModel`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L303)).
