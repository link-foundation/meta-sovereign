# चैट संदर्भ (languages: [en](CHAT-REFERENCES.md) • [zh](CHAT-REFERENCES.zh.md) • hi • [ru](CHAT-REFERENCES.ru.md))

जहाँ real chat apps हमारे Chat screen जैसी ही समस्याओं को solve करते हैं, उन
links के साथ जो exact commit पर pinned हैं जो हमने पढ़ी। जब आप sending,
delivery status, live updates, read receipts, typing, drafts या message list
बदलते हैं, तो पहले यहाँ देखें और compare करें कि ये clients इसे कैसे करते हैं।

इन links के पीछे की research, full notes के साथ,
[`case-studies/chat-reliability/`](case-studies/chat-reliability/README.md)
में है।

## इन sources को उपयोग करने के नियम

- **व्यवहार सीखें, code कभी copy न करें।** यह project public domain
  (Unlicense) है। नीचे दिए गए अधिकांश projects GPL या AGPL हैं, इसलिए
  उनका code यहाँ paste नहीं किया जा सकता। उन्हें पढ़कर समझें कि एक real
  client _क्या_ करता है और _क्यों_, फिर अपना खुद का code लिखें।
- **Links एक commit पर pinned हैं**, इसलिए एक line number तब भी उस code
  की ओर इशारा करती रहती है जिसे हमने पढ़ा, भले ही project आगे बढ़ जाए।
  किसी topic को refresh करने के लिए, project को उसकी latest commit पर खोलें,
  उसी function को नाम से खोजें, और commit तथा line दोनों को update करें।
- **पढ़ें, कभी build या run न करें**, downloaded copies (उन्हें repository के
  बाहर रखें, उदाहरण के लिए एक temporary folder में)।

## Projects

| Project                         | यह क्या है                                     | Repository                                                                            | License    | जो commit हमने पढ़ी (तारीख)                                                                                         |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Telegram Web K (tweb)           | Official Telegram web app (web.telegram.org/k) | [morethanwords/tweb](https://github.com/morethanwords/tweb)                           | GPL-3.0    | [`579e559`](https://github.com/morethanwords/tweb/tree/579e5590d5db93e6ef39a5bbe1900257cb594cc2) (2026-10-16)       |
| Telegram Web A (telegram-tt)    | Official Telegram web app (web.telegram.org/a) | [Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt)                             | GPL-3.0    | [`f67a408`](https://github.com/Ajaxy/telegram-tt/tree/f67a40879a7d78c2683ec5a296cf55bc22417d56) (2026-10-16)        |
| TDLib                           | Telegram की खुद की client library              | [tdlib/td](https://github.com/tdlib/td)                                               | BSL-1.0    | [`a94b83d`](https://github.com/tdlib/td/tree/a94b83d67ab4c8397c6245e541b31a4131ea2f79) (2026-10-14)                 |
| Telegram Desktop                | Official desktop app                           | [telegramdesktop/tdesktop](https://github.com/telegramdesktop/tdesktop)               | GPL-3.0    | [`b16daff`](https://github.com/telegramdesktop/tdesktop/tree/b16daff6df63e8a812bc2b52a04ff243f67a7d3f) (2026-10-15) |
| Telegram for Android            | Official Android app (अभी तक नहीं पढ़ी)        | [DrKLO/Telegram](https://github.com/DrKLO/Telegram)                                   | GPL-2.0    | [`f32ffee`](https://github.com/DrKLO/Telegram/tree/f32ffeec763f0bdbf4bec25b52d654f77bff733d) (2026-10-13)           |
| Signal Desktop                  | Signal का desktop app                          | [signalapp/Signal-Desktop](https://github.com/signalapp/Signal-Desktop)               | AGPL-3.0   | [`f3040f3`](https://github.com/signalapp/Signal-Desktop/tree/f3040f3e13b6dca5021c3db149320e0f7a771f0a) (2026-10-15) |
| Element Web                     | Matrix web client                              | [element-hq/element-web](https://github.com/element-hq/element-web)                   | AGPL-3.0   | [`fc4d45c`](https://github.com/element-hq/element-web/tree/fc4d45cce130f3dce0d824ecef87bd948bcef842) (2026-10-16)   |
| matrix-js-sdk                   | Element के पीछे Matrix client library          | [matrix-org/matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk)               | Apache-2.0 | [`d0e8162`](https://github.com/matrix-org/matrix-js-sdk/tree/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488) (2026-10-16) |
| GramJS (`telegram` npm package) | MTProto library जो हमारा server उपयोग करता है  | [gram-js/gramjs](https://github.com/gram-js/gramjs) (we read `node_modules/telegram`) | MIT        | version 2.26.22                                                                                                     |

## विषय के अनुसार

### बिल्कुल एक बार भेजना (प्रति message एक id, हर retry पर reuse)

- Telegram Web K प्रति message एक 64-bit random id बनाता है:
  [`randomLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/helpers/random.ts#L14)।
- Telegram Web A भी यही 8 secure random bytes के साथ करता है:
  [`generateRandomBigInt`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/lib/gramjs/Helpers.ts#L132)।
- TDLib तब तक retry करता है जब तक id non-zero और unused न हो:
  [`secure_int64` loop](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L20786)।
- Matrix एक transaction id भेजता है जिसे server deduplicate करता है:
  [`makeTxnId`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/client.ts#L2863),
  और echo पर उसे match करता है:
  [`transaction_id`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2718)।

### अपना भेजा हुआ message match करना (उड़ान में रहते हुए कोई duplicate नहीं)

- Telegram Web K दो maps रखता है, random id → placeholder और real id →
  random id:
  [`pendingByRandomId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L693),
  [`onUpdateMessageId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L10788)।
- Telegram Web A local id को in-place swap करता है:
  [`handleLocalMessageUpdate`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L3047);
  उसके local ids last real id से ऊपर के fractions हैं:
  [`getNextLocalMessageId`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/apiBuilders/messages.ts#L94)।

### एक chat में messages का क्रम

- Telegram Web K sends को MTProto `invokeAfterMsg` से chain करता है:
  [`pendingAfterMsgs`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L697)।
- Signal प्रति conversation एक बार में एक job चलाता है:
  [`PQueue({ concurrency: 1 })`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L76)।
- Matrix हर बाद के message को "not sent" mark करता है एक के fail होने पर,
  ताकि क्रम बना रहे:
  [`NOT_SENT` cascade](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2808)।
- TDLib, इसके विपरीत, failure के बाद बाद के text messages को जाने देता है
  (text के लिए कोई `invokeAfterMsg` नहीं)।

### Failures, retries और rate limits

- TDLib record करता है कि एक failed message कब resent हो सकती है (FLOOD_WAIT)
  और resend को app पर छोड़ देता है:
  [`try_resend_at`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L28259)।
- Signal online होने तक wait करता है, फिर 0 ms, 190 ms, फिर ×1.9 तक 15
  minutes तक, लगभग एक दिन के लिए back off करता है:
  [`exponentialBackoff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/exponentialBackoff.std.ts#L7),
  [`waitForOnline`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/helpers/commonShouldJobContinue.preload.ts#L34),
  [`MAX_ATTEMPTS`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/conversationJobQueue.preload.ts#L340)।
- Matrix server के `retry_after` के बाद rate limit retry करता है, और अन्य
  client errors पर छोड़ देता है:
  [`calculateRetryBackoff`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/http-api/utils.ts#L186)।
- Element "Resend all" और "Delete all", और एक "connection lost" bar offer
  करता है:
  [`RoomStatusBar`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L144),
  [`onResendAllClick`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L199)।

### Unsent messages एक restart से बचती हैं

- TDLib भेजने से पहले हर outgoing message को अपने log में लिखता है और
  restart के बाद उसी random id के साथ उसे resend करता है:
  [`binlog_add`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L21875),
  [पुनः चलाएं](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L35842),
  [shutdown पर कोई error नहीं](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L1259)।
- Signal पहले अपने database में jobs store करता है:
  [`JobQueue.add`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L181),
  [`streamJobs`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L143)।
- Matrix pending events को "not sent" के रूप में restore करता है:
  [`getPendingEvents`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L517)।

### Delivery status (clock, ✓, ✓✓, failed)

- Telegram Web K:
  [स्थिति](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L11224)।
- Telegram Web A 1 second के बाद ही clock दिखाता है:
  [`FAST_SEND_TIMEOUT`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L145)।
- Matrix states:
  [`EventStatus`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/event-status.ts#L21);
  Signal states:
  [`SendStatus`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/messages/MessageSendState.std.ts#L29)।

### Live updates और gap के बाद catch up करना

- TDLib एक missing update के लिए 0.7 s तक wait करता है, फिर difference
  माँगता है:
  [`MAX_UNFILLED_GAP_TIME`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.h#L167),
  [gap timer](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L3176),
  [`get_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L480),
  [पीछे हटना](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L1338)।
- Telegram Web A हर ping पर difference माँगता है और slices handle करता है:
  [`setPingCallback`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/client.ts#L144),
  [`getDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L397)।
- Telegram Web K:
  [gap → `getDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L187)।
- Matrix 3 failed syncs के बाद error state में चला जाता है और server को
  probe करता है:
  [`FAILED_SYNC_ERROR_THRESHOLD`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L78),
  [`startKeepAlives`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L1600)।
  Signal Fibonacci delays के साथ reconnect करता है:
  [`BackOff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/BackOff.std.ts#L20)।
- GramJS का खुद का `catchUp()` एक empty TODO है
  (`node_modules/telegram/client/updates.js`), इसलिए एक GramJS app को यह
  खुद करना होगा।

### हर channel का अपना catch-up (groups में deletions)

- Supergroup या channel अपने updates खुद गिनता है (`pts`); छूटा number
  या `updateChannelTooLong` का मतलब है updates (deletions भी) नहीं आए,
  और apps उस channel का difference माँगते हैं: TDLib
  [`get_channel_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L34711), Telegram Web K [`getChannelDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L418),
  [`updateChannelTooLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L632) पर, Telegram Web A [`GetChannelDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L484).
  हमारा: `js/src/sources/telegram-channels.js` (R-Y35).

### Messages में तस्वीरें

- तस्वीर उसकी stored location से download होती है; expired file
  reference (`FILE_REFERENCE_*`) पर message दोबारा पढ़ा जाता है, फिर retry:
  TDLib [`FILE_REFERENCE_`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/FileReferenceManager.cpp#L61), Telegram Web A [`downloadMedia`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/media.ts#L29).
  हमारा: `js/src/sources/telegram-media.js` (R-Y36).

### आने वाले messages को पढ़ा हुआ mark करना

- TDLib केवल तब पढ़ता है जब chat खुली हो:
  [`view_messages`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16526),
  [`read_history_on_server`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L17634)।
- Telegram Web A एक IntersectionObserver का उपयोग करता है जो 150 ms पर
  throttle है, और app के background में रहने पर नहीं:
  [`useMessageObservers`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useMessageObservers.ts#L15),
  [`markMessageListRead`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L1689)।
- Telegram Web K:
  [view पर `readHistory`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L3401)।
- Element 500 ms debounce करता है और receipt कभी पीछे नहीं ले जाता:
  [`READ_RECEIPT_DEBOUNCE_MS`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L46),
  [`sendAutoReadReceipt`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L950)।

### Typing ("typing…")

- Telegram Desktop हर 5 s पर resend करता है और last key के 5 s बाद cancel
  करता है:
  [`api_send_progress.cpp`](https://github.com/telegramdesktop/tdesktop/blob/b16daff6df63e8a812bc2b52a04ff243f67a7d3f/Telegram/SourceFiles/api/api_send_progress.cpp#L21);
  TDLib send पर cancel करता है:
  [`cancel_dialog_action`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L26953)।
- Telegram Web A 3 s पर throttle करता है:
  [`SEND_MESSAGE_ACTION_INTERVAL`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L171);
  Telegram Web K 6 s पर और empty box पर cancel करता है:
  [थ्रॉटल](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3811),
  [रद्द करें](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3790)।
- Element: 10 s की कोई input नहीं तो typing रुकती है, server 30 s बाद भूल
  जाता है:
  [`TypingStore`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/stores/TypingStore.ts#L14)।

### Drafts

- TDLib chat खुली रहने पर last change के 1 s बाद draft को cloud में save
  करता है, और बंद होने पर तुरंत:
  [`MIN_SAVE_DRAFT_DELAY`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.h#L1689),
  [टाइमर](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16021)।
- Telegram Web K 2.5 s wait करता है:
  [`saveDraftDebounced`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L1755);
  Telegram Web A 10 s:
  [`DRAFT_DEBOUNCE`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L170)।
- Element drafts को `localStorage` में रखता है और unload से पहले save करता
  है:
  [`EDITOR_STATE_STORAGE_PREFIX`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L74),
  [`beforeunload`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L180)।

### Composer input (IME, length, empty text)

- IME composition के दौरान Enter भेजना नहीं चाहिए। Telegram Web A:
  [`!e.isComposing`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/composer/MessageInput.tsx#L604);
  Element Safari के key code 229 को भी swallow करता है:
  [`isComposing`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L297),
  [229](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L502)।
- Length: TDLib का default 4096 है
  ([`message_text_length_max`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/OptionManager.cpp#L218));
  Telegram Web K long text को server के
  [`message_length_max`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L3222)
  से split करता है।
- Empty text: TDLib दोनों ends trim करता है और जो empty रह जाए उसे refuse
  करता है:
  [`fix_formatted_text`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessageEntity.cpp#L4561)।

### Message list को scroll करना

- Telegram Web A "scroll down" button bottom से 50 px पर दिखाता है:
  [`FAB_THRESHOLD`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useScrollHooks.ts#L20)।
- Element unread divider को room खुले रहने तक fixed रखता है
  ([`RoomTimelineViewModel`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L303))।
