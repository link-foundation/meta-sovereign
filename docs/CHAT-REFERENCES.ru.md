# Справочник по чатам (languages: [en](CHAT-REFERENCES.md) • [zh](CHAT-REFERENCES.zh.md) • [hi](CHAT-REFERENCES.hi.md) • ru)

Как реальные чат-приложения решают те же задачи, что и наш экран Chat — со
ссылками, привязанными к конкретному коммиту, который мы читали. Если меняете
отправку, статус доставки, живые обновления, отметки о прочтении, индикатор
печати, черновики или список сообщений — сначала смотрите сюда и сравнивайте с
тем, как это сделано в этих клиентах.

Исследование, лежащее в основе этих ссылок, с полными заметками, находится в
[`case-studies/chat-reliability/`](case-studies/chat-reliability/README.md).

## Правила работы с источниками

- **Изучайте поведение, не копируйте код.** Этот проект находится в общественном
  достоянии (Unlicense). Большинство перечисленных ниже проектов распространяются
  под GPL или AGPL, поэтому их код нельзя вставлять сюда. Читайте их, чтобы
  понять _что_ делает реальный клиент и _почему_, затем пишите свой код.
- **Ссылки привязаны к коммиту** — номер строки продолжает указывать на читанный
  нами код даже после того, как проект продвинулся вперёд. Чтобы обновить тему,
  откройте проект в последнем коммите, найдите ту же функцию по имени и обновите
  коммит и строку.
- **Читайте, не собирайте и не запускайте** скачанные копии (держите их за
  пределами репозитория, например во временной папке).

## Проекты

| Проект                          | Что это                                                  | Репозиторий                                                                           | Лицензия   | Читаемый коммит (дата)                                                                                              |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Telegram Web K (tweb)           | Официальное веб-приложение Telegram (web.telegram.org/k) | [morethanwords/tweb](https://github.com/morethanwords/tweb)                           | GPL-3.0    | [`579e559`](https://github.com/morethanwords/tweb/tree/579e5590d5db93e6ef39a5bbe1900257cb594cc2) (2026-10-16)       |
| Telegram Web A (telegram-tt)    | Официальное веб-приложение Telegram (web.telegram.org/a) | [Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt)                             | GPL-3.0    | [`f67a408`](https://github.com/Ajaxy/telegram-tt/tree/f67a40879a7d78c2683ec5a296cf55bc22417d56) (2026-10-16)        |
| TDLib                           | Собственная клиентская библиотека Telegram               | [tdlib/td](https://github.com/tdlib/td)                                               | BSL-1.0    | [`a94b83d`](https://github.com/tdlib/td/tree/a94b83d67ab4c8397c6245e541b31a4131ea2f79) (2026-10-14)                 |
| Telegram Desktop                | Официальное десктопное приложение                        | [telegramdesktop/tdesktop](https://github.com/telegramdesktop/tdesktop)               | GPL-3.0    | [`b16daff`](https://github.com/telegramdesktop/tdesktop/tree/b16daff6df63e8a812bc2b52a04ff243f67a7d3f) (2026-10-15) |
| Telegram for Android            | Официальное Android-приложение (ещё не читали)           | [DrKLO/Telegram](https://github.com/DrKLO/Telegram)                                   | GPL-2.0    | [`f32ffee`](https://github.com/DrKLO/Telegram/tree/f32ffeec763f0bdbf4bec25b52d654f77bff733d) (2026-10-13)           |
| Signal Desktop                  | Десктопное приложение Signal                             | [signalapp/Signal-Desktop](https://github.com/signalapp/Signal-Desktop)               | AGPL-3.0   | [`f3040f3`](https://github.com/signalapp/Signal-Desktop/tree/f3040f3e13b6dca5021c3db149320e0f7a771f0a) (2026-10-15) |
| Element Web                     | Веб-клиент Matrix                                        | [element-hq/element-web](https://github.com/element-hq/element-web)                   | AGPL-3.0   | [`fc4d45c`](https://github.com/element-hq/element-web/tree/fc4d45cce130f3dce0d824ecef87bd948bcef842) (2026-10-16)   |
| matrix-js-sdk                   | Клиентская библиотека Matrix в основе Element            | [matrix-org/matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk)               | Apache-2.0 | [`d0e8162`](https://github.com/matrix-org/matrix-js-sdk/tree/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488) (2026-10-16) |
| GramJS (`telegram` npm package) | Библиотека MTProto, используемая нашим сервером          | [gram-js/gramjs](https://github.com/gram-js/gramjs) (we read `node_modules/telegram`) | MIT        | version 2.26.22                                                                                                     |

## По темам

### Отправка ровно один раз (id на каждое сообщение, повторно используемый при каждой попытке)

- Telegram Web K создаёт 64-битный случайный id для каждого сообщения:
  [`randomLong`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/helpers/random.ts#L14).
- Telegram Web A делает то же самое через 8 криптографически случайных байт:
  [`generateRandomBigInt`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/lib/gramjs/Helpers.ts#L132).
- TDLib повторяет попытки, пока id не станет ненулевым и неиспользованным:
  [`secure_int64` loop](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L20786).
- Matrix отправляет transaction id, который сервер дедуплицирует:
  [`makeTxnId`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/client.ts#L2863),
  и сопоставляет его при эхе:
  [`transaction_id`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2718).

### Сопоставление своего отправленного сообщения (без дублей, пока оно в пути)

- Telegram Web K хранит две карты: random id → заглушка и real id → random id:
  [`pendingByRandomId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L693),
  [`onUpdateMessageId`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L10788).
- Telegram Web A заменяет локальный id на месте:
  [`handleLocalMessageUpdate`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L3047);
  его локальные id — дробные числа выше последнего реального id:
  [`getNextLocalMessageId`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/apiBuilders/messages.ts#L94).

### Порядок сообщений в одном чате

- Telegram Web K выстраивает отправки в цепочку через MTProto `invokeAfterMsg`:
  [`pendingAfterMsgs`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L697).
- Signal выполняет одно задание за раз для каждого чата:
  [`PQueue({ concurrency: 1 })`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L76).
- Matrix помечает все последующие сообщения как «не отправлено», если одно не
  прошло, — порядок сохраняется:
  [`NOT_SENT` cascade](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L2808).
- TDLib, напротив, позволяет последующим текстовым сообщениям уйти после сбоя
  (нет `invokeAfterMsg` для текста).

### Сбои, повторные попытки и ограничения скорости

- TDLib записывает, когда сбойное сообщение можно повторно отправить (FLOOD_WAIT),
  и оставляет повторную отправку приложению:
  [`try_resend_at`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L28259).
- Signal ждёт подключения к сети, затем делает задержки 0 мс, 190 мс, затем ×1,9
  до 15 минут — около суток:
  [`exponentialBackoff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/exponentialBackoff.std.ts#L7),
  [`waitForOnline`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/helpers/commonShouldJobContinue.preload.ts#L34),
  [`MAX_ATTEMPTS`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/conversationJobQueue.preload.ts#L340).
- Matrix повторяет попытку после ограничения скорости согласно `retry_after`
  сервера и прекращает при других клиентских ошибках:
  [`calculateRetryBackoff`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/http-api/utils.ts#L186).
- Element предлагает «Повторить всё» и «Удалить всё», а также панель «соединение
  потеряно»:
  [`RoomStatusBar`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L144),
  [`onResendAllClick`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/RoomStatusBar.ts#L199).

### Неотправленные сообщения сохраняются при перезапуске

- TDLib записывает каждое исходящее сообщение в лог до отправки и повторно
  отправляет его с тем же random id после перезапуска:
  [`binlog_add`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L21875),
  [воспроизведение](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L35842),
  [нет ошибки при завершении](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L1259).
- Signal сначала сохраняет задания в свою базу данных:
  [`JobQueue.add`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L181),
  [`streamJobs`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/jobs/JobQueue.std.ts#L143).
- Matrix восстанавливает ожидающие события как «не отправлено»:
  [`getPendingEvents`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/room.ts#L517).

### Статус доставки (часы, ✓, ✓✓, сбой)

- Telegram Web K:
  [статус](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L11224).
- Telegram Web A показывает часы только через 1 секунду:
  [`FAST_SEND_TIMEOUT`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L145).
- Matrix состояния:
  [`EventStatus`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/models/event-status.ts#L21);
  Signal состояния:
  [`SendStatus`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/messages/MessageSendState.std.ts#L29).

### Живые обновления и наверстывание после разрыва

- TDLib ждёт до 0,7 с пропущенного обновления, затем запрашивает разницу:
  [`MAX_UNFILLED_GAP_TIME`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.h#L167),
  [таймер разрыва](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L3176),
  [`get_difference`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L480),
  [задержка](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/UpdatesManager.cpp#L1338).
- Telegram Web A запрашивает разницу при каждом пинге и обрабатывает срезы:
  [`setPingCallback`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/client.ts#L144),
  [`getDifference`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/updates/updateManager.ts#L397).
- Telegram Web K:
  [разрыв → `getDifference`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/apiUpdatesManager.ts#L187).
- Matrix переходит в состояние ошибки после 3 неудачных синхронизаций и опрашивает
  сервер:
  [`FAILED_SYNC_ERROR_THRESHOLD`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L78),
  [`startKeepAlives`](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/sync.ts#L1600).
  Signal переподключается с задержками Фибоначчи:
  [`BackOff`](https://github.com/signalapp/Signal-Desktop/blob/f3040f3e13b6dca5021c3db149320e0f7a771f0a/ts/util/BackOff.std.ts#L20).
- Собственный `catchUp()` в GramJS — пустой TODO
  (`node_modules/telegram/client/updates.js`), поэтому приложение на GramJS должно
  делать это самостоятельно.

### Отметка входящих сообщений как прочитанных

- TDLib читает только пока чат открыт:
  [`view_messages`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16526),
  [`read_history_on_server`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L17634).
- Telegram Web A использует IntersectionObserver с троттлингом 150 мс — и не
  работает, пока приложение в фоне:
  [`useMessageObservers`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useMessageObservers.ts#L15),
  [`markMessageListRead`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L1689).
- Telegram Web K:
  [`readHistory` при просмотре](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/bubbles.ts#L3401).
- Element делает debounce 500 мс и никогда не сдвигает отметку прочтения назад:
  [`READ_RECEIPT_DEBOUNCE_MS`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L46),
  [`sendAutoReadReceipt`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L950).

### Индикатор печати («печатает…»)

- Telegram Desktop повторяет отправку каждые 5 с и отменяет через 5 с после
  последней клавиши:
  [`api_send_progress.cpp`](https://github.com/telegramdesktop/tdesktop/blob/b16daff6df63e8a812bc2b52a04ff243f67a7d3f/Telegram/SourceFiles/api/api_send_progress.cpp#L21);
  TDLib отменяет при отправке:
  [`cancel_dialog_action`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L26953).
- Telegram Web A ограничивает до 3 с:
  [`SEND_MESSAGE_ACTION_INTERVAL`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L171);
  Telegram Web K — до 6 с, отменяет при пустом поле:
  [дросселирование](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3811),
  [отмена](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L3790).
- Element: 10 с без ввода останавливают индикатор, сервер забывает через 30 с:
  [`TypingStore`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/stores/TypingStore.ts#L14).

### Черновики

- TDLib сохраняет черновик в облако через 1 с после последнего изменения, пока
  чат открыт, и немедленно при закрытии:
  [`MIN_SAVE_DRAFT_DELAY`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.h#L1689),
  [таймер](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessagesManager.cpp#L16021).
- Telegram Web K ждёт 2,5 с:
  [`saveDraftDebounced`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/components/chat/input.ts#L1755);
  Telegram Web A — 10 с:
  [`DRAFT_DEBOUNCE`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/config.ts#L170).
- Element хранит черновики в `localStorage` и сохраняет их перед выгрузкой:
  [`EDITOR_STATE_STORAGE_PREFIX`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L74),
  [`beforeunload`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/SendMessageComposer.tsx#L180).

### Ввод в поле сообщения (IME, длина, пустой текст)

- Enter во время IME-ввода не должен отправлять сообщение. Telegram Web A:
  [`!e.isComposing`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/composer/MessageInput.tsx#L604);
  Element также поглощает код клавиши 229 в Safari:
  [`isComposing`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L297),
  [229](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/components/views/rooms/BasicMessageComposer.tsx#L502).
- Длина: по умолчанию в TDLib — 4096
  ([`message_text_length_max`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/OptionManager.cpp#L218));
  Telegram Web K разбивает длинный текст по серверному
  [`message_length_max`](https://github.com/morethanwords/tweb/blob/579e5590d5db93e6ef39a5bbe1900257cb594cc2/src/lib/appManagers/appMessagesManager.ts#L3222).
- Пустой текст: TDLib обрезает оба конца и отклоняет то, что осталось пустым:
  [`fix_formatted_text`](https://github.com/tdlib/td/blob/a94b83d67ab4c8397c6245e541b31a4131ea2f79/td/telegram/MessageEntity.cpp#L4561).

### Прокрутка списка сообщений

- Telegram Web A показывает кнопку «прокрутить вниз» за 50 пикс. от нижнего края:
  [`FAB_THRESHOLD`](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/components/middle/hooks/useScrollHooks.ts#L20).
- Element удерживает разделитель непрочитанных на месте, пока комната открыта
  ([`RoomTimelineViewModel`](https://github.com/element-hq/element-web/blob/fc4d45cce130f3dce0d824ecef87bd948bcef842/apps/web/src/viewmodels/room/timeline/RoomTimelineViewModel.ts#L303)).
