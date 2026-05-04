# 用户指南 (languages: [en](USER-GUIDE.md) • zh • [hi](USER-GUIDE.hi.md) • [ru](USER-GUIDE.ru.md))

本页把 `meta-sovereign` 的用户流程集中在一起。流程从“什么都不安装”到“安装完整环境”排序，你可以在满足需求时停止阅读。

> **TL;DR:** 打开 <https://link-foundation.github.io/meta-sovereign/>。这就是完整 web app。可选地启动本地 Rust server（或 JS server），让 app 在设备之间同步数据。

## 1. 不安装任何东西 — 打开 web app

1. 在 Chrome、Firefox、Safari 或 Edge 中打开 <https://link-foundation.github.io/meta-sovereign/>。
2. App 立即启动。没有注册、没有 telemetry；在你指定 server 之前，数据不会离开浏览器。
3. 数据保存在浏览器本地存储中（[`createBrowserStore`](../js/src/storage/browser-store.js)：IndexedDB → localStorage → memory）。你可以：
   - 浏览和搜索导入的联系人；
   - 创建聊天模式和回复变体；
   - 编写 broadcast 和 outreach plan；
   - 使用 operator UI 处理聊天。

如果只在一台设备上使用，这已经足够。

## 2. 添加本地 Rust server（首选）

Rust server 是单二进制、无 runtime、冷启动最快。它暴露与 JS server 相同的 wire protocol（见 [`docs/SERVER-PARITY.zh.md`](./SERVER-PARITY.zh.md)）。

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

Server 默认监听 <http://127.0.0.1:8787>。GitHub Pages 上的 SPA 会自动探测保存的 override（`localStorage` 中的 `metaServer`）和一组 `127.0.0.1` 端口。

如果没有自动连接，请打开应用内 **Settings → Server**，粘贴 Rust binary 打印的 URL。

## 3. 添加本地 JS server（备用）

如果没有 Rust toolchain，或需要 Rust server 尚未完全覆盖的额外 routes（`/api/backups`、`/api/export-encrypted`、`/api/links/purge-tombstones`、`/api/outreach`），可以使用 JS server。

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

或者使用 Bun：

```bash
bunx meta-sovereign serve
```

JS server 使用同一端口和 wire protocol；SPA 不需要关心另一端是哪种 backend。

## 4. 安装桌面或移动 app

桌面和移动 app 把 GitHub Pages 上的同一个 SPA 加上内置 server，封装到 native shell 中。需要无浏览器标签页的离线模式时使用它们。

| 平台     | 构建命令                                        |
| -------- | ----------------------------------------------- |
| Electron | `npm run electron`                              |
| iOS      | `npm run mobile:ios`（打开 Xcode）              |
| Android  | `npm run mobile:android`（打开 Android Studio） |

Electron 和 Capacitor shell 复用 `js/src/web/`。安装 optional peer dependency 后，desktop shell 还会启用 `electron-updater` auto-update。

## 5. 将 SPA 连接到 server

[`discoverServer()`](../js/src/web/discover.js) 的选择顺序：

1. **Same origin** — 当 SPA 由 JS 或 Rust server 直接提供时。
2. **Saved override** — `localStorage.metaServer = "https://my-server"`，由 **Settings → Server** 设置。
3. **Runtime shell candidates** — Electron 和 Capacitor 注入内置 server URL。
4. **`127.0.0.1` ports** — 自动探测默认端口。
5. **Caller-supplied LAN candidates** — 可以传入列表。

如果都无响应，SPA 保持 **offline mode** 并写入本地 browser store。以后 server 出现时，[`OfflineClient`](../js/src/web/client.js) 会重放排队写入。

## 6. 在设备之间同步（WebRTC）

当设备共享同一 server（Rust 或 JS）后，它们通过 server 的 `/rtc` signaling endpoint 使用 WebRTC 同步（[`webrtc-sync.js`](../js/src/web/webrtc-sync.js)）。实际流量是 peer-to-peer；server 只负责初始握手。对称 NAT 场景请见 [`docs/WEBRTC-TURN.zh.md`](./WEBRTC-TURN.zh.md)。

## 7. 加密备份和导出

数据默认静态加密（[`vault.js`](../js/src/storage/vault.js)，AES-256-GCM，master key + passphrase、PIN、passkey、TOTP recovery code）。

从 CLI 导出加密 snapshot：

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

也可以从 JS-server-backed SPA 调用 `POST /api/export-encrypted`。Rust server 尚未暴露该 route；此时使用 CLI。

## 8. 导入数据

把 archive 放入 `~/.meta-sovereign/imports/`（可配置），然后运行：

```bash
meta-sovereign import
```

支持 email（`.eml`/mbox）、VK、Telegram Desktop、X、WhatsApp、Facebook、LinkedIn、career.habr.com、hh.ru、superjob.ru。完整列表见 [`docs/REQUIREMENTS.zh.md`](./REQUIREMENTS.zh.md) 的 E 节。

Live email 可使用 `source-pull --source=email --protocol=gmail`、`microsoft-graph`、`jmap`、`imap` 或 `pop3`。原始 IMAP/POP3/SMTP 还需要 `--host`、`--username`、`--password`，除非设置了等价的 `EMAIL_*` 环境变量。

## 9. 故障排除

| 现象                           | 处理方式                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| SPA 卡在 loading spinner。     | 打开 dev tools → Application → IndexedDB，确认存在 `meta-sovereign` 数据库；否则浏览器可能禁用了存储。 |
| SPA 无法访问本地 server。      | 在 app 中打开 **Settings → Server**，粘贴准确 URL。                                                    |
| Server 报告 `EADDRINUSE`。     | 传入 `--port=NNNN` 给 `meta-sovereign serve` 或 Rust `serve --port=NNNN`。                             |
| WebRTC 跨网络停止同步。        | 配置 TURN server，见 [`docs/WEBRTC-TURN.zh.md`](./WEBRTC-TURN.zh.md)。                                 |
| `cargo build` 出现 linker 错。 | 安装 C toolchain（Debian/Ubuntu 为 `build-essential`，macOS 为 Xcode CLI tools）。                     |

## 10. 下一步

- [`README.zh.md`](../README.zh.md) — 项目概览和开发者说明。
- [`docs/REQUIREMENTS.zh.md`](./REQUIREMENTS.zh.md) — canonical requirement list。
- [`docs/SERVER-PARITY.zh.md`](./SERVER-PARITY.zh.md) — JS 与 Rust server routes。
- [`docs/UI-DESIGN-AUDIT.zh.md`](./UI-DESIGN-AUDIT.zh.md) — accessibility 与 HIG/Material/Fluent audit。
- [`docs/case-studies/`](./case-studies/) — 每个 issue 的完整案例研究。
