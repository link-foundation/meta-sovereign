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

## 5. Real-time transports 与静态资源

`/ws` WebSocket sync 和 `/rtc` WebRTC signalling 在两个 server 上 parity。
`/`、`/index.html`、flat assets、`/storage/`、`/handlers/` 和 `/sync/`
mount 也都保持同样的静态资源服务行为，并拒绝 path traversal。

## 6. 摘要

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read + derived + meta          | 14     | 14     | 0       |
| Mutating CRUD                  | 15     | 15     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **40** | **34** | **6**   |

Rust server 当前达到 **85% route parity**。典型终端用户流程（打开 SPA、浏览
联系人、发送消息、自动化回复、设备间同步、导入 email archive）可以把 Rust
server 当作 JS server 的 drop-in replacement。
