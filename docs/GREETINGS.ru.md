# Приветствия: начинать диалоги с привета или стикера (languages: [en](GREETINGS.md) • [zh](GREETINGS.zh.md) • [hi](GREETINGS.hi.md) • ru)

Начать разговор — самая медленная и однообразная часть общения с
людьми. [konard/vk-bot](https://github.com/konard/vk-bot) решал это во
VK: отправлял приветственный стикер друзьям, которым ещё никогда не
писал, и отвечал стикером на «Привет!». Эта подсистема делает то же
самое во всех messaging networks, к которым `meta-sovereign` уже
подключён, чтобы внимание пользователя уходило на второе сообщение, а не
на первое.

Смежные документы: [USER-GUIDE, раздел 10](USER-GUIDE.ru.md#10-начать-диалог-с-привета-или-стикера),
[SERVER-PARITY](SERVER-PARITY.ru.md),
[case study по issue 35](case-studies/issue-35/README.md).

## 1. Слои

| Слой     | Файл                                | Ответственность                                                                       |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Catalog  | `js/src/greetings/catalog.js`       | Возможности сетей, встроенные стикеры (ids + прямые ссылки), Telegram sets, тексты.   |
| Detector | `js/src/greetings/detect.js`        | Является ли входящее сообщение приветствием и на каком языке.                         |
| Planner  | `js/src/greetings/plan.js`          | `planGreetings` / `planFromStore`: кого приветствовать и чем. Чистый, с preview.      |
| Runner   | `js/src/greetings/index.js`         | `runGreetings`: отправляет с паузой между сообщениями, пишет `greeting:<net>:<chat>`. |
| Adapters | `js/src/sources/{vk,telegram,…}.js` | `live.post` со `sticker`, `listGreetingStickers`, Telegram `fetchFile`.               |
| HTTP     | `js/src/server/routes-greetings.js` | `/api/greetings/*`, включая proxy для Telegram thumbnails.                            |
| CLI      | `js/src/cli/greetings-commands.js`  | `greetings-stickers`, `greetings-select`, `greetings-plan`, `greetings-send`.         |
| SPA      | `js/src/web/greetings-view.js`      | Экран **Приветствия**: выбрать стикеры, посмотреть preview плана, отправить.          |

## 2. Никаких картинок в репозитории

Каждый стикер хранится как собственный идентификатор сети плюс ссылка,
которую сеть отдаёт сама:

- **VK** — `sticker_id`; preview —
  `https://vk.com/sticker/1-<id>-512`. 43 встроенных id взяты из
  `stickers/greeting.json` в vk-bot; 20 из них помечены `common` — это
  набор, которым приветствует vk-bot, и он же образует выбор по
  умолчанию. `incomingGreetingStickersIds` из vk-bot используются только
  для того, чтобы _распознать_ входящее приветствие.
- **Telegram** — `file_id` в Bot API свои у каждого бота, поэтому
  собрать их заранее нельзя. Каталог хранит **имена sticker sets**
  (`HotCherry`, `UtyaDuck`, …, у каждого ссылка
  `https://t.me/addstickers/<name>`), а adapter вживую, через
  `getStickerSet`, получает стикеры, чей emoji — жест приветствия
  (👋 🖐 🖖 🙋 🤚 ✋ 🙌). Preview идут через
  `GET /api/greetings/file?id=<thumbnail file_id>` на собственном server
  пользователя: он вызывает `getFile` и стримит картинку, так что bot
  token никогда не попадает в браузер.
- **Messenger** — thumbs-up `369239263222822` — единственный стикер,
  который любая Page может отправить всегда; публичного API каталога
  нет.
- **WhatsApp** — стикер — это id загруженного media или публичная ссылка
  на `.webp`; пользователь указывает свои.

Content Security Policy разрешает картинки только из `'self'`, `data:`,
`blob:` и `https://vk.com`.

## 3. Что разрешает каждая сеть

| Сеть     | Стикер задаётся через | Получение вживую            | Кого можно приветствовать                                     |
| -------- | --------------------- | --------------------------- | ------------------------------------------------------------- |
| VK       | `sticker_id`          | `store.getStickersKeywords` | Любой известный чат (ошибка 901/902, если сообщения закрыты). |
| Telegram | `file_id` или `.webp` | `getStickerSet`             | Только ответы: бот не может начать диалог.                    |
| WhatsApp | media id или `.webp`  | —                           | В течение 24 ч после последнего сообщения контакта.           |
| Facebook | `sticker_id`          | —                           | В течение 24 ч после последнего сообщения контакта.           |
| Zalo     | `attachment_id`       | —                           | В течение 48 ч (есть в каталоге; adapter для Zalo пока нет).  |
| X        | — (только текст)      | —                           | Любой известный чат.                                          |
| Email    | — (только текст)      | —                           | Любой известный адрес.                                        |

Planner превращает эти правила в причины пропуска, а не в неудачные
отправки: `outside-messaging-window`, `network-unsupported` и
`no-greeting-available` (ни один стикер не подходит, а в выборе нет
текста для этого языка). Сеть без стикеров или пользователь, который
предпочитает текст, получает вместо стикера один из выбранных текстов
приветствия.

## 4. Планирование

`planGreetings({links, mode, selection, limit = 10, staleDays = 30})`
сводит сохранённые сообщения по чатам, а затем:

- **`initiate`** — первыми идут чаты, в которые никто никогда не писал,
  начиная с самого старого последнего сообщения; после них — чаты, где
  последним писал пользователь, но которые молчат дольше `staleDays`.
  Чаты, которые уже поприветствовали (есть `greeting:<network>:<chat>`),
  пропускаются.
- **`reply`** — чаты, где последнее сообщение — неотвеченное
  приветствие: «Привет!», "hi", "你好", "नमस्ते", "xin chào", одиночный
  👋 или известный приветственный стикер. На текстовые приветствия
  отвечают на том языке, на котором они написаны; на стикер или
  одиночный взмах — на выбранном языке.

Каждый чат превращается в envelope `{network, chat, contact, language, kind,
sticker, text, lastMessageAt, skipped?}`. `limit` считает только те
envelopes, которые действительно будут отправлены. Planner получает
`random` и `now` как аргументы, поэтому preview показывает ровно то, что
сделает отправка.

## 5. Отправка

`runGreetings(plan, {store, delayMs})` отправляет envelopes по одному
через `live.post` каждой сети и ждёт `delayMs` между сообщениями
(по умолчанию 30 с, как в vk-bot), чтобы пачка не выглядела как всплеск
спама. Каждая успешная отправка записывается как link
`greeting:<network>:<chat>`, так что один и тот же чат никогда не
приветствуется дважды. Ошибка (например, VK error 901) попадает в отчёт
по этому чату, а запуск продолжается. Credentials читаются из тех же
links `secret:<network>:…`, которые уже использует sync.

## 6. Интерфейсы

```bash
meta-sovereign greetings-stickers                       # built-in catalogue
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --sets=UtyaDuck --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply --delay-ms=30000
```

| Method | Path                       | Назначение                                                      |
| ------ | -------------------------- | --------------------------------------------------------------- |
| GET    | `/api/greetings/catalogue` | Сети, встроенные стикеры, Telegram sets, тексты.                |
| GET    | `/api/greetings/selection` | Сохранённый выбор (или выбор по умолчанию).                     |
| PUT    | `/api/greetings/selection` | Сохранить выбор; неизвестные сети отбрасываются.                |
| POST   | `/api/greetings/stickers`  | Получить стикеры вживую (`{networks}`).                         |
| POST   | `/api/greetings/plan`      | Preview (`{mode, …}`) или отправка (`run: 'queue'`, `delayMs`). |
| GET    | `/api/greetings/file?id=`  | Proxy для Telegram thumbnails.                                  |

По HTTP `delayMs` ограничен значением 60 000, чтобы запрос не мог
висеть часами. В Rust server этих маршрутов пока нет. Без них SPA берёт
каталог, выбор и preview из локального store и сообщает, что для
получения стикеров и отправки нужен JS server.

Экран **Приветствия** показывает таблицу сетей, сетку стикеров
(встроенные, полученные вживую и выбранные ранее — каждый по одному
разу), Telegram sets с их ссылками `t.me`, язык и предпочтение «стикер
или текст», а также план. Кнопка **Отправить приветствия** остаётся
неактивной, пока в preview нет хотя бы одного чата, который действительно
получит приветствие.

## 7. Известные ограничения

- **Собственные стикеры Telegram для пустого чата.** Приложения Telegram
  предлагают стикеры в пустом чате, вызывая `messages.getStickers` с
  emoticon `👋⭐️` (TDLib: `getGreetingStickers`). Это вызов MTProto
  _user_ API; Bot API до него не дотягивается, да и бот в любом случае не
  может начать чат. Экран прямо об этом говорит и вместо этого
  предлагает получение sets вживую. Для поддержки понадобился бы клиент
  от имени пользовательского аккаунта (TDLib), а это отдельная
  интеграция.
- **Zalo** есть в каталоге, но adapter для Zalo пока нет.
- **X** DMs не поддерживают стикеры, поэтому в X приветствие отправляется
  только текстом.
