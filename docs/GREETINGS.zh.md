# 问候：用一句 hi 或一张贴纸开启对话 (languages: [en](GREETINGS.md) • zh • [hi](GREETINGS.hi.md) • [ru](GREETINGS.ru.md))

开启对话是与人交流中最慢、最重复的部分。
[konard/vk-bot](https://github.com/konard/vk-bot) 在 VK 上解决了这个问题：
它向从未联系过的好友发送问候贴纸，并用贴纸回复 "Привет!"。这个子系统在
`meta-sovereign` 已经连接的每个即时通讯网络上做同样的事，让用户把注意力
放在第二条消息上，而不是第一条。

相关文档：[USER-GUIDE 第 10 节](USER-GUIDE.zh.md#10-用问候语或贴纸打招呼)、
[SERVER-PARITY](SERVER-PARITY.zh.md)、
[issue 35 案例研究](case-studies/issue-35/README.md)。

## 1. 分层

| 层       | 文件                                | 职责                                                                           |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Catalog  | `js/src/greetings/catalog.js`       | 各网络的能力、内置贴纸（id + 直链）、Telegram 贴纸集、问候文本。               |
| Detector | `js/src/greetings/detect.js`        | 判断收到的消息是否为问候，以及使用哪种语言。                                   |
| Planner  | `js/src/greetings/plan.js`          | `planGreetings` / `planFromStore`：问候谁、用什么问候。纯函数，可预览。        |
| Runner   | `js/src/greetings/index.js`         | `runGreetings`：在消息之间停顿着发送，并记录 `greeting:<net>:<chat>`。         |
| Adapters | `js/src/sources/{vk,telegram,…}.js` | 带 `sticker` 的 `live.post`、`listGreetingStickers`、Telegram 的 `fetchFile`。 |
| HTTP     | `js/src/server/routes-greetings.js` | `/api/greetings/*`，包括 Telegram 缩略图代理。                                 |
| CLI      | `js/src/cli/greetings-commands.js`  | `greetings-stickers`、`greetings-select`、`greetings-plan`、`greetings-send`。 |
| SPA      | `js/src/web/greetings-view.js`      | **问候** 页面：挑选贴纸、预览计划、发送。                                      |

## 2. 仓库中不存放任何图片

每张贴纸都以该网络自己的标识符加上由该网络自己提供的链接来保存：

- **VK** — `sticker_id`；预览地址为
  `https://vk.com/sticker/1-<id>-512`。43 个内置 id 来自 vk-bot 的
  `stickers/greeting.json`；其中 20 个标记为 `common`，即 vk-bot 用来问候
  的那一组，它们构成默认选择。vk-bot 的 `incomingGreetingStickersIds`
  只用于 _识别_ 收到的问候。
- **Telegram** — Bot API 的 `file_id` 只对各自的 bot 有效，因此无法预先
  收集。目录保存的是贴纸 **集名称**（`HotCherry`、`UtyaDuck`、…，每个都带
  `https://t.me/addstickers/<name>` 链接），adapter 通过 `getStickerSet`
  实时列出 emoji 为问候手势（👋 🖐 🖖 🙋 🤚 ✋ 🙌）的贴纸。预览经由用户自己
  server 上的 `GET /api/greetings/file?id=<thumbnail file_id>`，该接口调用
  `getFile` 并以流的方式返回图片，因此 bot token 永远不会到达浏览器。
- **Messenger** — 点赞贴纸 `369239263222822` 是每个 Page 都始终可以发送的
  贴纸；没有公开的贴纸目录 API。
- **WhatsApp** — 贴纸是一个已上传的 media id 或一个公开的 `.webp` 链接；
  由用户自行提供。

Content Security Policy 只允许来自 `'self'`、`data:`、`blob:` 和
`https://vk.com` 的图片。

## 3. 各网络允许的操作

| 网络     | 贴纸寻址方式         | 实时列出                    | 可以问候谁                                         |
| -------- | -------------------- | --------------------------- | -------------------------------------------------- |
| VK       | `sticker_id`         | `store.getStickersKeywords` | 任何已知聊天（若对方屏蔽消息则返回错误 901/902）。 |
| Telegram | `file_id` 或 `.webp` | `getStickerSet`             | 仅限回复：bot 无法主动开启对话。                   |
| WhatsApp | media id 或 `.webp`  | —                           | 对方最后一条消息后的 24 小时内。                   |
| Facebook | `sticker_id`         | —                           | 对方最后一条消息后的 24 小时内。                   |
| Zalo     | `attachment_id`      | —                           | 48 小时内（已收录目录；尚无 Zalo adapter）。       |
| X        | —（仅文字）          | —                           | 任何已知聊天。                                     |
| Email    | —（仅文字）          | —                           | 任何已知地址。                                     |

Planner 把这些规则转化为跳过原因，而不是让发送失败：
`outside-messaging-window`、`network-unsupported` 和
`no-greeting-available`（没有适用的贴纸，且所选内容中没有该语言的文本）。
不支持贴纸的网络，或偏好文字的用户，会改为收到所选问候文本之一。

## 4. 计划

`planGreetings({links, mode, selection, limit = 10, staleDays = 30})`
先按聊天汇总已存储的消息，然后：

- **`initiate`** — 从未发过消息的聊天排在最前，最后一条消息越早越靠前；
  其后是用户最后发言、但沉默时间超过 `staleDays` 的聊天。已经问候过的聊天
  （存在 `greeting:<network>:<chat>`）会被排除。
- **`reply`** — 最后一条消息是尚未回复的问候的聊天："Привет!"、"hi"、
  "你好"、"नमस्ते"、"xin chào"、单独的 👋，或已知的问候贴纸。文字问候会用
  其原本的语言回复；贴纸或单独的挥手则使用所选语言。

每个聊天都会成为一个 envelope `{network, chat, contact, language, kind,
sticker, text, lastMessageAt, skipped?}`。`limit` 只统计实际会发送的
envelope。Planner 把 `random` 和 `now` 作为参数接收，因此预览展示的正是
发送时会做的事。

## 5. 发送

`runGreetings(plan, {store, delayMs})` 通过各网络的 `live.post` 逐个发送
envelope，并在消息之间等待 `delayMs`（默认 30 秒，与 vk-bot 相同），这样
一批消息不会看起来像一阵垃圾信息。每次成功都会记录为
`greeting:<network>:<chat>` link，因此同一个聊天永远不会被问候两次。失败
（例如 VK 错误 901）会针对该聊天报告，运行继续进行。凭据从 sync 已经在用的
同一组 `secret:<network>:…` links 中读取。

## 6. 入口

```bash
meta-sovereign greetings-stickers                       # built-in catalogue
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --sets=UtyaDuck --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply --delay-ms=30000
```

| Method | Path                       | 用途                                                     |
| ------ | -------------------------- | -------------------------------------------------------- |
| GET    | `/api/greetings/catalogue` | 网络、内置贴纸、Telegram 贴纸集、问候文本。              |
| GET    | `/api/greetings/selection` | 已保存的选择（或默认选择）。                             |
| PUT    | `/api/greetings/selection` | 保存选择；未知网络会被丢弃。                             |
| POST   | `/api/greetings/stickers`  | 实时列出贴纸（`{networks}`）。                           |
| POST   | `/api/greetings/plan`      | 预览（`{mode, …}`）或发送（`run: 'queue'`、`delayMs`）。 |
| GET    | `/api/greetings/file?id=`  | Telegram 缩略图代理。                                    |

通过 HTTP 时，`delayMs` 上限为 60 000，避免请求挂起数小时。Rust server
目前还没有这些路由。没有这些路由时，SPA 会回退到本地 store 来获取目录、
选择和预览，并说明列出贴纸和发送需要 JS server。

**问候** 页面展示网络表格、贴纸网格（内置、实时列出和之前选过的贴纸，每张
只出现一次）、带 `t.me` 链接的 Telegram 贴纸集、语言和贴纸/文字偏好，以及
计划。在预览中至少有一个实际会被问候的聊天之前，**发送问候** 按钮一直处于
禁用状态。

## 7. 已知不足

- **Telegram 自带的空聊天贴纸。** Telegram 应用在空聊天中推荐贴纸时，会用
  表情 `👋⭐️` 调用 `messages.getStickers`（TDLib：`getGreetingStickers`）。
  这是 MTProto 的 _用户_ API 调用；Bot API 无法访问它，而且 bot 本来也无法
  开启聊天。页面会说明这一点，并改为提供贴纸集的实时列出。要支持它需要一个
  用户账号客户端（TDLib），那是另一项独立的集成。
- **Zalo** 已收录目录，但尚无 Zalo adapter。
- **X** 的私信不支持贴纸，因此对 X 只用文字问候。
