# meta-sovereign (languages: [en](README.md) • zh • [hi](README.hi.md) • [ru](README.ru.md))

`meta-sovereign` 是个人 **meta profile sovereign** 系统：用户自己拥有的统一收件箱、CRM 和自动化平台。它优先本地运行，尊重隐私，汇总来自 VK、Telegram、X、WhatsApp、Facebook、LinkedIn、career.habr.com、hh.ru、superjob.ru 以及电子邮件提供商的联系人、聊天、邮件和模式数据。

## 立即试用（无需安装）

在任意现代浏览器中打开 <https://link-foundation.github.io/meta-sovereign/>。Web 应用会立即启动，默认完全在浏览器中运行，并写入本地存储；除非你主动连接服务器，否则数据不会离开设备。

> 如果链接暂时还不可用，GitHub Pages 工作流（`.github/workflows/pages.yml`）会在下一次推送到 `main` 后发布。

## 运行本地服务器（推荐用于同步）

如果要在设备之间同步、启用静态加密并使用完整功能，请在 SPA 旁边启动本地服务器。当前有两个后端，它们实现同一套 wire protocol（见 [`docs/SERVER-PARITY.zh.md`](docs/SERVER-PARITY.zh.md)）。

### Rust 服务器 — 首选（单二进制，无运行时）

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

### JavaScript 服务器 — 备用（Node/Bun/Deno）

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

两个后端默认监听 <http://127.0.0.1:8787>。托管的 SPA 会通过 `discoverServer()` 自动发现本地服务器（保存的覆盖值 → `127.0.0.1` 端口）。如果浏览器没有自动连接，请打开应用内 **Settings → Server**，粘贴服务器打印的 URL。

## 将 SPA 连接到服务器

SPA 按以下顺序选择服务器（[`js/src/web/discover.js`](js/src/web/discover.js)）：

1. **同源** — 当 SPA 直接由 JS 或 Rust 服务器提供时使用。
2. **保存的覆盖值** — `localStorage.metaServer`，由应用内 **Settings → Server** 设置。
3. **运行时 shell 候选项** — Electron 和 Capacitor 注入内置服务器 URL。
4. **`127.0.0.1` 端口** — 自动探测默认本地服务器端口。
5. **调用方提供的局域网候选项** — 由代码传入。

如果没有服务器响应，SPA 会进入 **离线模式**：写入本地浏览器存储（[`createBrowserStore`](js/src/storage/browser-store.js)：IndexedDB → localStorage → 内存），并在下一次发现服务器时由 [`OfflineClient`](js/src/web/client.js) 自动重放。

完整的用户流程（不安装、安装 Rust 服务器、安装 JS 服务器、安装桌面/移动应用、加密导出、故障排除）见 [`docs/USER-GUIDE.zh.md`](docs/USER-GUIDE.zh.md)。

## 功能概览

- **统一收件箱**：覆盖 VK、Telegram、X、WhatsApp、Facebook、LinkedIn、career.habr.com、hh.ru、superjob.ru 和电子邮件。
- **个人 CRM**：联系人、社区、群组成员、交集、批量个性化触达。
- **个人记忆**：自动从对话中抽取结构化 `question → answer` 事实。
- **对话自动化平台**：模式编辑器、回复变体编辑器、类似 n8n 的对话图。
- **可移植数据存储**：二进制 [Doublets](https://github.com/linksplatform/doublets-rs) + 文本 [Links Notation](https://github.com/link-foundation/links-notation) 双表示，自动备份，`.lino` 导入/导出。
- **本地优先运行时**：用户自有设备之间 WebRTC 同步，可选自托管个人云。
- **双技术栈**：JS + Rust/WebAssembly（默认）和纯 Rust 服务器/微服务变体。磁盘格式共享。

完整的需求到状态映射见 [`docs/REQUIREMENTS.zh.md`](docs/REQUIREMENTS.zh.md)；每个 issue 的案例研究在 [`docs/case-studies/`](docs/case-studies/)。

## 状态

issue #1 目标原型已实现并在 PR #2 中跟踪：

- **数据层（R-A\*）**：`DualStore` 让 Doublets 二进制和 Links Notation 文本保持同步，支持 AES-256-GCM 静态加密备份和 `secret:*` 链接加密。
- **服务连接器（R-E\*）**：VK、Telegram、X、WhatsApp、Facebook、LinkedIn、career.habr.com、hh.ru、superjob.ru 和 email 的归档解析器与可用 live API 连接器。
- **模式匹配和自动化（R-C\*）**：`inferRegex`、`simplifyRegex`、`compilePeg`、模糊回复变体抽取和 `createGraph` / `runGraph`。
- **CRM（R-D\*）**：联系人聚合、audience DSL、批量个性化触达、资料和简历同步 envelope。
- **分发（R-F\*）**：NPM 库、CLI、本地服务器、Electron shell、Capacitor 移动 shell、Docker web + WebRTC 微服务。
- **技术栈（R-G\*）**：默认 JS server + React SPA + Rust/WASM 重型任务；纯 Rust 服务器作为替代。
- **加固（R-K\*）**：默认软删除、AES-256-GCM 主密钥 vault、多种解锁方式、加密导出。
- **浏览器发布（R-L\*）**：GitHub Pages CI workflow、公开 SPA URL、面向用户的 README 和用户指南。

## 仓库结构

`meta-sovereign` 是多语言代码库，每个语言树都对应 link-foundation 的 AI-driven-development pipeline 模板：

- **JavaScript** 位于 `js/`：`js/src/`、`js/tests/`、`js/scripts/`、`js/bin/`、`js/electron/`、`js/examples/`、`js/experiments/`。
- **Rust** 位于 `rust/`：`rust/Cargo.toml`、`rust/Cargo.lock` 和 `rust/crates/` workspace。
- **原生 shell**：`js/electron/`、`mobile/` + `capacitor.config.json`、`docker/`。
- **运维**：`.github/workflows/`、`.changeset/`、`docs/`。

```
.
├── .changeset/           # Changeset 配置
├── .github/workflows/    # GitHub Actions CI/CD
├── docker/               # Web + WebRTC 微服务 Dockerfile
├── docs/                 # 需求、用户指南、服务器一致性、案例研究
├── js/                   # JavaScript 树
├── mobile/               # Capacitor 移动 shell
├── rust/                 # Rust workspace
└── package.json          # Node.js package manifest
```

---

## 开发者参考

以下内容面向贡献者，普通用户不必阅读。

### 快速开始

```bash
# 安装依赖
bun install

# 运行测试
bun test
npm test
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests

# 真实浏览器 e2e（可选，需要 Playwright + Chromium）
RUN_BROWSER_E2E=1 npm run test:e2e:browser

# Rust workspace 测试
cargo test --manifest-path rust/Cargo.toml --workspace

# 构建 SPA
npm run build:web

# 构建 GitHub Pages artifact
npm run build:pages

# Lint
bun run lint

# 格式化检查
bun run format:check
```

### CI/CD 和质量门禁

流水线包含快速检查、慢速矩阵测试、文档构建、链接检查和自动发布。所有 job 都设置了合理的 `timeout-minutes`，单个测试也通过 `node --test --test-timeout=30000` 和 `bun test --timeout 30000` 防止挂起。

每个 PR 必须保持：

- ESLint 与 Prettier 通过；
- `jscpd` 无重复代码；
- 没有泄露 secret；
- 代码和 workflow 文件低于行数限制；
- Node、Bun、Deno × Ubuntu、macOS、Windows 测试通过；
- 文档变更满足文档验证。

更多说明见 [`docs/BEST-PRACTICES.zh.md`](docs/BEST-PRACTICES.zh.md)。

### 常用脚本

| 脚本                   | 说明                         |
| ---------------------- | ---------------------------- |
| `bun test`             | 使用 Bun 运行测试            |
| `bun run lint`         | 使用 ESLint 检查代码         |
| `bun run lint:fix`     | 自动修复 ESLint 问题         |
| `bun run format`       | 用 Prettier 格式化代码       |
| `bun run format:check` | 只检查格式                   |
| `bun run check`        | 运行 lint、格式和重复检查    |
| `bun run changeset`    | 创建 changeset               |
| `bun run build:web`    | 构建生产 SPA bundle          |
| `bun run build:pages`  | 构建 `dist/pages/` artifact  |
| `bun run build:mobile` | 构建 Capacitor 移动端 bundle |

### 贡献

贡献指南见 [`docs/CONTRIBUTING.zh.md`](docs/CONTRIBUTING.zh.md)。基本流程是 fork、创建分支、修改、创建 changeset、提交、推送并打开 Pull Request。

## 许可证

[Unlicense](LICENSE) - 公共领域。
