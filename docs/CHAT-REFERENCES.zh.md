# 聊天参考资料 (languages: [en](CHAT-REFERENCES.md) • zh • [hi](CHAT-REFERENCES.hi.md) • [ru](CHAT-REFERENCES.ru.md))

当真实聊天应用解决与我们聊天界面相同的问题时，链接会固定到我们阅读的精确提交。当你修改发送、投递状态、实时更新、已读回执、正在输入、草稿或消息列表时，请先查阅这里，并与这些客户端的处理方式进行比较。

这些链接背后的研究，包含完整笔记，位于
[`case-studies/chat-reliability/`](case-studies/chat-reliability/README.md)。

## 使用这些资料的规则

- **学习行为，不要复制代码。** 本项目是公共领域（Unlicense）。下面的大多数项目是
  GPL 或 AGPL，因此它们的代码不能粘贴到这里。阅读它们以理解真实客户端做了 _什么_
  以及 _为什么_，然后编写我们自己的代码。
- **链接固定到某个提交**，因此即使项目继续演进，行号仍然指向我们阅读的代码。要刷新
  某个主题，请在最新提交处打开项目，按名称找到相同的函数，并同时更新提交和行号。
- **只读，不构建或运行**下载的副本（将它们保存在仓库之外，例如临时文件夹中）。

## 项目

| 项目                            | 简介                                           | 仓库                                                                                  | 许可证     | 我们阅读的提交（日期）                                                                                              |
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

## 按主题

### 精确发送一次（每条消息一个 id，每次重试复用）

- Telegram Web K 为每条消息生成 64 位随机 id：
  [`randomLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/helpers/random.ts#L14)。
- Telegram Web A 用 8 个安全随机字节做同样的事：
  [`generateRandomBigInt`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/lib/gramjs/Helpers.ts#L132)。
- TDLib 重试直到 id 非零且未使用：
  [`secure_int64` loop](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L20786)。
- Matrix 发送一个服务器去重的事务 id：
  [`makeTxnId`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/client.ts#L2863)，
  并在回显时匹配它：
  [`transaction_id`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2718)。

### 匹配我们自己发出的消息（发送途中不重复）

- Telegram Web K 维护两个映射，随机 id → 占位符，真实 id → 随机 id：
  [`pendingByRandomId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L693)，
  [`onUpdateMessageId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L10788)。
- Telegram Web A 就地替换本地 id：
  [`handleLocalMessageUpdate`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L3047)；
  其本地 id 是比上一个真实 id 稍大的小数：
  [`getNextLocalMessageId`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/apiBuilders/messages.ts#L94)。

### 同一聊天中消息的顺序

- Telegram Web K 用 MTProto `invokeAfterMsg` 链式发送：
  [`pendingAfterMsgs`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L697)。
- Signal 每个会话同时只运行一个任务：
  [`PQueue({ concurrency: 1 })`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L76)。
- Matrix 一旦某条消息失败，就将之后的所有消息标记为"未发送"，从而保持顺序：
  [`NOT_SENT` cascade](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2808)。
- TDLib 则相反，允许后续文本消息在失败后继续发送（文本消息不使用
  `invokeAfterMsg`）。

### 失败、重试与速率限制

- TDLib 记录失败消息何时可以重发（FLOOD_WAIT），并将重发交给应用层：
  [`try_resend_at`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L28259)。
- Signal 等到联网后，以 0 ms、190 ms 为起点，以 ×1.9 倍增，最长退避 15 分钟，持续约一天：
  [`exponentialBackoff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/exponentialBackoff.std.ts#L7)，
  [`waitForOnline`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/helpers/commonShouldJobContinue.preload.ts#L34)，
  [`MAX_ATTEMPTS`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/conversationJobQueue.preload.ts#L340)。
- Matrix 在服务器的 `retry_after` 后重试速率限制错误，其他客户端错误则放弃：
  [`calculateRetryBackoff`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/http-api/utils.ts#L186)。
- Element 提供"全部重发"和"全部删除"选项，以及"连接断开"提示条：
  [`RoomStatusBar`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L144)，
  [`onResendAllClick`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L199)。

### 未发送消息在重启后保留

- TDLib 在发送前将每条发出消息写入日志，并在重启后用相同的随机 id 重发：
  [`binlog_add`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L21875)，
  [重放](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L35842)，
  [关闭时不报错](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L1259)。
- Signal 首先将任务存储到数据库：
  [`JobQueue.add`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L181)，
  [`streamJobs`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L143)。
- Matrix 将待处理事件恢复为"未发送"状态：
  [`getPendingEvents`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L517)。

### 投递状态（时钟、✓、✓✓、失败）

- Telegram Web K：
  [状态](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L11224)。
- Telegram Web A 仅在 1 秒后显示时钟图标：
  [`FAST_SEND_TIMEOUT`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L145)。
- Matrix 状态：
  [`EventStatus`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/event-status.ts#L21)；
  Signal 状态：
  [`SendStatus`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/messages/MessageSendState.std.ts#L29)。

### 实时更新与补齐间隔

- TDLib 等待缺失更新最多 0.7 秒，然后请求差异：
  [`MAX_UNFILLED_GAP_TIME`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.h#L167)，
  [间隔计时器](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L3176)，
  [`get_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L480)，
  [退避](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L1338)。
- Telegram Web A 在每次 ping 时请求差异并处理切片：
  [`setPingCallback`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/client.ts#L144)，
  [`getDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L397)。
- Telegram Web K：
  [间隔 → `getDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L187)。
- Matrix 在 3 次同步失败后进入错误状态并探测服务器：
  [`FAILED_SYNC_ERROR_THRESHOLD`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L78)，
  [`startKeepAlives`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L1600)。
  Signal 以斐波那契间隔重连：
  [`BackOff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/BackOff.std.ts#L20)。
- GramJS 自身的 `catchUp()` 是个空的 TODO
  （`node_modules/telegram/client/updates.js`），因此 GramJS 应用需要自行实现这一功能。

### 每个频道各自补齐（群组中的删除）

- 超级群组或频道自行为其更新编号（`pts`）；编号跳跃或 `updateChannelTooLong`
  表示有更新（包括删除）没有到达，各应用会请求该频道的 difference：TDLib
  [`get_channel_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L34711)，Telegram Web K [`getChannelDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L418)（处理
  [`updateChannelTooLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L632)），Telegram Web A [`GetChannelDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L484)。
  我们的实现：`js/src/sources/telegram-channels.js`（R-Y35）。

### 消息中的图片

- 图片按已保存的位置下载；文件引用过期（`FILE_REFERENCE_*`）时重新读取消息后重试：
  TDLib [`FILE_REFERENCE_`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/FileReferenceManager.cpp#L61)，Telegram Web A [`downloadMedia`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/media.ts#L29)。
  我们的实现：`js/src/sources/telegram-media.js`（R-Y36）。

### 将收到的消息标记为已读

- TDLib 仅在聊天打开时标记已读：
  [`view_messages`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16526)，
  [`read_history_on_server`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L17634)。
- Telegram Web A 使用节流为 150 ms 的 IntersectionObserver，且应用在后台时不标记已读：
  [`useMessageObservers`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useMessageObservers.ts#L15)，
  [`markMessageListRead`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L1689)。
- Telegram Web K：
  [`readHistory` 在视图时](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L3401)。
- Element 防抖 500 ms，且不会倒退已读位置：
  [`READ_RECEIPT_DEBOUNCE_MS`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L46)，
  [`sendAutoReadReceipt`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L950)。

### 正在输入（"typing…"）

- Telegram Desktop 每 5 秒重发一次，并在最后一次按键后 5 秒取消：
  [`api_send_progress.cpp`](https://github.com/telegramdesktop/tdesktop/blob/b16daff6df63e8a812bc2b52a04ff243f67a7d3f/Telegram/SourceFiles/api/api_send_progress.cpp#L21)；
  TDLib 在发送时取消：
  [`cancel_dialog_action`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L26953)。
- Telegram Web A 节流至 3 秒：
  [`SEND_MESSAGE_ACTION_INTERVAL`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L171)；
  Telegram Web K 节流至 6 秒，输入框为空时取消：
  [节流](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3811)，
  [取消](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3790)。
- Element：10 秒无输入停止正在输入，服务器 30 秒后遗忘：
  [`TypingStore`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/stores/TypingStore.ts#L14)。

### 草稿

- TDLib 在聊天打开时于最后一次修改后 1 秒将草稿保存到云端，聊天关闭时立即保存：
  [`MIN_SAVE_DRAFT_DELAY`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.h#L1689)，
  [计时器](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16021)。
- Telegram Web K 等待 2.5 秒：
  [`saveDraftDebounced`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L1755)；
  Telegram Web A 等待 10 秒：
  [`DRAFT_DEBOUNCE`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L170)。
- Element 将草稿保存在 `localStorage` 中，并在卸载前保存：
  [`EDITOR_STATE_STORAGE_PREFIX`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L74)，
  [`beforeunload`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L180)。

### 输入框（IME、长度、空文本）

- IME 输入过程中按 Enter 不得发送消息。Telegram Web A：
  [`!e.isComposing`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/composer/MessageInput.tsx#L604)；
  Element 还吞掉 Safari 的键码 229：
  [`isComposing`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L297)，
  [229](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L502)。
- 长度：TDLib 的默认值为 4096
  （[`message_text_length_max`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/OptionManager.cpp#L218)）；
  Telegram Web K 按服务器的
  [`message_length_max`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L3222)
  拆分长文本。
- 空文本：TDLib 修剪两端并拒绝修剪后为空的内容：
  [`fix_formatted_text`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessageEntity.cpp#L4561)。

### 滚动消息列表

- Telegram Web A 在距底部 50 px 时显示"向下滚动"按钮：
  [`FAB_THRESHOLD`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useScrollHooks.ts#L20)。
- Element 在房间打开期间保持未读分隔线固定
  （[`RoomTimelineViewModel`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L303)）。
