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

| Project                                                     | What it is                                     | Repository                                                                                   | License    | Commit we read (date)                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Telegram Web K (tweb)                                       | Official Telegram web app (web.telegram.org/k) | [morethanwords/tweb](https://github.com/morethanwords/tweb)                                  | GPL-3.0    | [`579e559`](https://github.com/morethanwords/tweb/tree/579e5590d5db93e6ef39a5bbe1900257cb594cc2) (2026-10-16)       |
| Telegram Web A (telegram-tt)                                | Official Telegram web app (web.telegram.org/a) | [Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt)                                    | GPL-3.0    | [`f67a408`](https://github.com/Ajaxy/telegram-tt/tree/f67a40879a7d78c2683ec5a296cf55bc22417d56) (2026-10-16)        |
| TDLib                                                       | Telegram's own client library                  | [tdlib/td](https://github.com/tdlib/td)                                                      | BSL-1.0    | [`a94b83d`](https://github.com/tdlib/td/tree/a94b83d67ab4c8397c6245e541b31a4131ea2f79) (2026-10-14)                 |
| Telegram Desktop                                            | Official desktop app                           | [telegramdesktop/tdesktop](https://github.com/telegramdesktop/tdesktop)                      | GPL-3.0    | [`b16daff`](https://github.com/telegramdesktop/tdesktop/tree/b16daff6df63e8a812bc2b52a04ff243f67a7d3f) (2026-10-15) |
| Telegram for Android                                        | Official Android app (not read yet)            | [DrKLO/Telegram](https://github.com/DrKLO/Telegram)                                          | GPL-2.0    | [`f32ffee`](https://github.com/DrKLO/Telegram/tree/f32ffeec763f0bdbf4bec25b52d654f77bff733d) (2026-10-13)           |
| Signal Desktop                                              | Signal's desktop app                           | [signalapp/Signal-Desktop](https://github.com/signalapp/Signal-Desktop)                      | AGPL-3.0   | [`f3040f3`](https://github.com/signalapp/Signal-Desktop/tree/f3040f3e13b6dca5021c3db149320e0f7a771f0a) (2026-10-15) |
| Element Web                                                 | Matrix web client                              | [element-hq/element-web](https://github.com/element-hq/element-web)                          | AGPL-3.0   | [`fc4d45c`](https://github.com/element-hq/element-web/tree/fc4d45cce130f3dce0d824ecef87bd948bcef842) (2026-10-16)   |
| matrix-js-sdk                                               | Matrix client library behind Element           | [matrix-org/matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk)                      | Apache-2.0 | [`d0e8162`](https://github.com/matrix-org/matrix-js-sdk/tree/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488) (2026-10-16) |
| Teleproto (`teleproto` npm package; maintained GramJS fork) | The MTProto library our server uses            | [sanyok12345/teleproto](https://github.com/sanyok12345/teleproto) (`node_modules/teleproto`) | MIT        | version 1.232.0                                                                                                     |

## By topic

### Visual style and configurability: T3 Code

Our [product vision](PRODUCT-VISION.md) prefers T3 Code for styling and
configuration patterns, while Telegram remains the reference for core messaging
interactions. T3 Code is [pingdotgg/t3code](https://github.com/pingdotgg/t3code),
MIT licensed; source read at
[`08a463e`](https://github.com/pingdotgg/t3code/tree/08a463e29976617134de01e9341f898bc881d0eb)
on 2026-10-30. These are design lessons, not imported implementation:

- [AppearanceSettingsPanel](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/components/settings/AppearanceSettingsPanel.tsx): grouped/searchable appearance controls, contrast adjustment and explicit reset actions.
- [TypographySettings](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/components/settings/TypographySettings.tsx): separately configurable text roles and typography.
- [themePalette](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/themePalette.ts): semantic appearance tokens rather than unrelated hard-coded control colors.
- [sidebar primitives](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/components/ui/sidebar.tsx): reusable navigation controls and consistent layout states.

### Empty conversations and composer clearance

Reviewed at the pinned T3 Code and Telegram Web A commits on 2026-10-30:

- T3 Code's [empty-state primitives](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/components/ui/empty.tsx) group a centered title, muted description and compact optional icon with consistent spacing.
- T3 Code's [ChatView](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/components/ChatView.tsx) passes the reserved composer height to the empty placeholder and suppresses it during detail loading.
- Telegram Web A's [MessageListAccountInfo](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/MessageListAccountInfo.tsx) distinguishes loading, empty text and available account/bot information; its [styles](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/MessageListAccountInfo.module.scss) provide a dedicated conversation-area layout.

Our original implementation centers a quiet icon/title/helper group in the
available Chat/Operator pane above the measured composer. It keeps typing and
suggestions usable, uses the same region for loading, and preserves business
introductions. No reference implementation was copied.

### Context targeting, selection and message navigation

Telegram Web A source rechecked at
[`6002824`](https://github.com/Ajaxy/telegram-tt/tree/6002824b6532f3d913997ce496d9ab5f9b86bc22)
on 2026-10-30:

- [useContextMenuHandlers](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/hooks/useContextMenuHandlers.ts): a menu has an explicit open/close lifecycle and target.
- [MessageContextMenu](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/message/MessageContextMenu.tsx): ordinary message actions include an explicit Select action.
- [useFocusMessageListElement](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/message/hooks/useFocusMessageListElement.ts): coordinate focus with message-list updates.
- [MessageMeta.scss](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/message/MessageMeta.scss): keep timestamp and delivery metadata in a defined layout.

Our shared Chat/Operator implementation keeps a temporary context-target
background separate from persistent multi-selection, reserves message metadata
space without showing a second status icon, and confirms a navigation target
was shown before acknowledging an unread mark.

### Responsive directories and immediate send feedback

Source reviewed on 2026-10-31:

- Telegram Web A's [ChatList](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/left/main/ChatList.tsx#L192)
  renders `viewportIds` within the full ordered list, preserves total scroll
  height and memoizes the list component. Rendering work follows the viewport.
- Its [sendMessageLocal](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L375)
  publishes a local outgoing message before the network send. Acknowledgement
  later reconciles that local message with the provider's identity and state.

Our original implementation indexes profile records once, retains unchanged
chat summaries, measures viewport rows and headings, and keeps callbacks stable
for memoized rows. Pending sends update the directory preview immediately while
the durable outbox retains ordering and truthful delivery states. Focused checks
count record visits and mounted rows and hold a send acknowledgement; they do
not benchmark a live archive or run a local stress workload.

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
  (`node_modules/teleproto/client/updates/index.js`), so a GramJS app has to
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

The [official file-reference documentation](https://core.telegram.org/api/file-references)
was checked again on 2026-10-31: an expired reference is refreshed from its
source message. Our picture reader shares concurrent refreshes, reuses a newer
stored reference and gives opened media foreground priority without changing
request-rate limits.

### Deleted accounts and numeric identities

Telegram's [User schema](https://core.telegram.org/constructor/user) separates
`id`, `phone` and the explicit `deleted` flag (reviewed 2026-10-31). Missing names
and long-ago status alone do not establish account deletion. Our adapters retain
`deletedAccount` for safety; the same flag now drives a shared list/header/profile
identity. The raw numeric ID has a labeled, copyable profile row. Existing
messages remain available. This uses protocol facts and original UI code.

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
- Telegram Web A derives the message list's bottom reserve from the composer
  ([`MessageList.scss`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/MessageList.scss#L11)),
  and captures its opening unread boundary when messages first load
  ([`MessageList.tsx`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/MessageList.tsx#L487)).
  Telegram for macOS also captures that boundary once and omits it if the
  opening read index already reaches the last message
  ([`ChatController.swift`](https://github.com/TelegramMessenger/telegram-macos/blob/e18830989542a063dd66c5bdc4dbe6a70cbbd175/packages/ChatUI/Sources/ChatUI/ChatController.swift#L3488)).
  Reviewed 2026-10-30. These clients retain an opening marker independently of
  later reads; our requested behavior additionally retires it once the opening
  unread messages are confirmed read. Later live arrivals do not resurrect it.
  Our shared Chat/Operator clearance measures the floating composer rather
  than reserving a fixed oversized footer. No upstream implementation was copied.

### Full-width message selection and context-menu coverage (2026-10-28)

Read Telegram Web A at [`6002824`](https://github.com/Ajaxy/telegram-tt/tree/6002824b6532f3d913997ce496d9ab5f9b86bc22): [message container](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/message/Message.tsx), [outer interaction handlers](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/middle/message/hooks/useOuterHandlers.ts), and [context-menu handlers](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/hooks/useContextMenuHandlers.ts). The container owns selection-mode clicks; normal text/link interaction remains available outside selection, and touch context handling distinguishes taps and long presses. Our own row hit testing extends selection and right-click coverage outside the centered column. No upstream implementation was copied.

Operator’s read-only counter refresh follows Telegram’s [`messages.getPeerDialogs`](https://core.telegram.org/method/messages.getPeerDialogs) contract. It does not call history/mention/reaction read methods.

### Opening a specific conversation

- [Telegram deep links](https://core.telegram.org/api/links): normal clients use username/phone links, with an optional draft, or message links for private channels. Its ID-links section explicitly says `tg://user?id=` is a Bot API abstraction that normal clients ignore.
- [Telegram for macOS link parser](https://github.com/TelegramMessenger/telegram-macos/blob/e18830989542a063dd66c5bdc4dbe6a70cbbd175/packages/TelegramLinks/Sources/TelegramLinks/LinkParsing.swift): the handled schemes include `resolve` and `privatepost`, without a general external numeric-user chat scheme (read 2026-10-28).
- [Telegram Web A route parser](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/util/routing.ts#L103): signed numeric peer IDs identify the conversation in the URL fragment. We use this explicit Web fallback when no native-addressable identifier is available (read 2026-10-28). These references informed behavior; no upstream implementation was copied.
