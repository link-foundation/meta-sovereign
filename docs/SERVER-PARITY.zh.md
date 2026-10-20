# 服务器 parity 矩阵：JS server vs. Rust server (languages: [en](SERVER-PARITY.md) • zh • [hi](SERVER-PARITY.hi.md) • [ru](SERVER-PARITY.ru.md))

本页列出 JavaScript server（`js/src/server/index.js` 与 `routes-*.js`）
和纯 Rust server（`rust/crates/meta-sovereign-server/src/routes.rs` 与
`handlers.rs`）暴露的 HTTP route 与 transport surface，帮助用户在选择后
端时了解功能 parity。

Rust server 是首选本地后端：单文件二进制、无需运行时、冷启动最快。JS
server 是回退：今天功能更多，能在 Bun/Node/Deno 所在环境运行。

| 状态      | 含义                                    |
| --------- | --------------------------------------- |
| Parity    | 两个 server 提供同一路由和 wire shape。 |
| JS only   | 已在 JS server 实现，尚未移植到 Rust。  |
| Rust only | 已在 Rust server 实现，JS 没有。        |

## 1. Links 读写路由

`/links`、`/links/:id` 的 GET/PUT/DELETE 在两个 server 上 parity。
`?include=tombstones`、`?showDeleted=1`、`?purge=1&confirm=1` 的行为相
同。

## 2. Derived read routes

`/api/contacts`、`/api/status`、`/api/autocomplete`、`/api/audience`、
`/api/facts`、`/api/search`、`/api/health`、`/sources` 和 `/metrics`
在两个 server 上 parity。

## 3. Mutating CRUD routes

patterns、graphs、replies、profile、resume、broadcast 以及
`/api/email/pull`、`/api/email/send` 都保持 wire parity。Rust email
routes 接受与 JS 相同的 archive ingest envelope；live Gmail、Microsoft
Graph、JMAP 以及 raw IMAP/POP3/SMTP 仍是 JS server feature，因为 Rust
crate 保持 `std`-only。

## 4. Outreach、backups、hardening

`/api/outreach`、`/api/backups`、`/api/backups/restore`、
`/api/export-encrypted` 和 `/api/links/purge-tombstones` 目前是 JS only。
SPA 会在 Rust server 返回 `404` 时隐藏或回退相关功能；CLI 仍可在本地运行
JS implementation。

Browser auto-import（`/api/auto-import`、`/api/auto-import/jobs/:id`、
`/capture`、`/stop`）是 JS only：它通过 browser-commander（Node library）
驱动浏览器。连接 Rust server 时，Connections 面板会提示需要 JS server；
手动导入归档仍然可用。

## 5. 简历同步

`/api/cv/platforms`、`/api/cv/plan`、`/api/cv/stored`、`/api/cv/read`、
`/api/cv/compare`、`/api/cv/sync` 和 `/api/cv/telemetry`（R-V16）是 JS
only，原因是结构性的：`read` 和 `sync` 通过 `browser-commander` +
Playwright 驱动真实浏览器，而 Rust crate 只用 `std`，无法启动这样的进程。
其余四个路由不碰浏览器，是可移植的；在移植完成之前，SPA 的 CV 页面会明确
显示“需要 JS server”，而不是展示一张空表。详情见
[`docs/CV-SYNC.zh.md`](./CV-SYNC.zh.md)。

## 5a. 自动化、联系人、发送与建议

| Route                                           | Method           | JS server                             | Rust server | Status      |
| ----------------------------------------------- | ---------------- | ------------------------------------- | ----------- | ----------- |
| `/api/automations`                              | GET, PUT         | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/<id>`                         | DELETE           | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/presets`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/plan`                         | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/run`                          | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts`                       | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts/{send,form,mark,skip}` | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/history`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/send`                                     | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/typing`                                   | GET, POST        | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/client-log`                               | POST             | `js/src/server/routes-client-log.js`  | _missing_   | **JS only** |
| `/api/people/learned`                           | GET              | `js/src/server/routes-learned.js`     | _missing_   | **JS only** |
| `/api/telegram/unread-marks`                    | GET              | `js/src/server/routes-telegram.js`    | _missing_   | **JS only** |
| `/api/telegram/read-marks`                      | POST             | `js/src/server/routes-telegram.js`    | _missing_   | **JS only** |
| `/api/people`, `/api/people/xref`               | GET              | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences`, `/api/lists`                  | GET, PUT, DELETE | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences/resolve`                        | POST             | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/suggest`, `/api/suggest/stats`            | GET              | `js/src/server/routes-suggest.js`     | _missing_   | **JS only** |

这些路由（issue #31 和 PR #34，R-X6..R-X18）只是 `js/src/automation/`、
`js/src/crm/people.js` 和 `js/src/replies/` 的一层薄封装。SPA 先请求服务器，
因为服务器保存了所有导入的归档和 adapters 的凭据；否则就在浏览器已有的
links 上运行同一份代码（`js/src/web/automation-api.js`）：离线时它仍然可以
列出、编辑和预览自动化，把安全模式的草稿保留在各自的聊天中，搜索联系人，
解析受众并建议回复。只有真正投递消息需要服务器；没有服务器时，在聊天输入框
中输入的消息会保存在浏览器里，直到某个服务器把它同步出去。CLI 的
`automations` 命令完全不需要服务器。

**写入其他服务需要确认。** 所有会在其他服务上发送、发布或修改内容的
路由——`/api/send`、`/api/automations/run`（auto 模式）、
`/api/automations/drafts/send`、`/api/email/send`、
`/api/github/post-comment`、`/api/upwork/post-message`、
`/api/peopleperhour/post-message`、`/api/broadcast`、`/api/outreach`
（`mode: "queue"`）、`/api/greetings/plan`（`run: "queue"`）、
`/api/cv/sync`（`dryRun: false`）、`/api/profile/sync` 和
`/api/resume/sync`——都会先返回 `428 Precondition Required` 以及
`{ needsConfirmation, action, preview, confirm: { token, expiresAt } }`，
不做任何操作。客户端展示预览后，用 `confirmToken` 重复完全相同的请求体；
令牌只能使用一次、绑定该请求体、五分钟内有效，服务器只执行预览过的计划
（`js/src/server/confirmations.js`）。简历的试运行已附带应用其计划的令牌。
`PUT /api/profile` 和 `PUT /api/resume` 只保存；存储或同步 `broadcast:*`、
`outreach:*`、`profile:*`、`resume:*` 链接不会发送任何内容。`/ws` 和
`/rtc` 会拒绝来自 CORS 允许列表之外来源的 WebSocket 升级。Rust 服务器
没有这些路由，因此 SPA 在那里会提示需要服务器。

## 6. 问候

`/api/greetings/catalogue`、`/api/greetings/selection`（GET 与 PUT）、
`/api/greetings/stickers`、`/api/greetings/plan` 和 `/api/greetings/file`
（issue #35）是 JS only，它们支撑
[`docs/GREETINGS.zh.md`](./GREETINGS.zh.md) 中的“问候”页面。`catalogue`、
`selection` 和 `plan` 预览只依赖目录与 store，可以移植；`stickers`、排队发送的
`plan` 和 `file` 通过 JS source adapters 调用 VK、Telegram、WhatsApp 和
Messenger API。缺少这些路由时，SPA 仍显示内置目录和预览，发送可改用
`meta-sovereign greetings-*` CLI。两个 server 发送相同的 CSP：`img-src` 允许
`https://vk.com` 以直接加载 VK 贴纸预览；Telegram 缩略图的下载 URL 含有
bot token，因此经由 `/api/greetings/file` 代理。

## 7. Real-time transports 与静态资源

`/ws` WebSocket sync 和 `/rtc` WebRTC signalling 在两个 server 上 parity。
`/`、`/index.html`、flat assets、`/storage/`、`/handlers/` 和 `/sync/`
mount 也都保持同样的静态资源服务行为，并拒绝 path traversal。

## 8. 摘要

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read + derived + meta          | 14     | 14     | 0       |
| Mutating CRUD                  | 15     | 15     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| 简历同步                       | 7      | 0      | 7       |
| 问候                           | 6      | 0      | 6       |
| 自动化、联系人、建议           | 14     | 0      | 14      |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **67** | **34** | **33**  |

Rust server 当前达到 **51% route parity**。典型终端用户流程（打开 SPA、浏览
联系人、发送消息、自动化回复、设备间同步、导入 email archive）可以把 Rust
server 当作 JS server 的 drop-in replacement。
