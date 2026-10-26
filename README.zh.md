# meta-sovereign (languages: [en](README.md) • zh • [hi](README.hi.md) • [ru](README.ru.md))

**为您使用的每个网络提供同一个收件箱、同一本通讯录和同一套自动化——运行在您自己的电脑上。**

meta-sovereign 在网上**代表一个人或一个组织**。连接 Telegram、VK、WhatsApp、Facebook 和 Instagram、X、LinkedIn、电子邮件、GitHub、Upwork、PeoplePerHour 以及招聘网站（career.habr.com、hh.ru、superjob.ru 等），在一个应用中处理所有对话。本地优先、开源：您的消息、联系人和密钥保存在您自己的存储中，有加密备份，中间没有云。

### 适用对象

| 谁 / 什么    | meta-sovereign 如何帮助                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **个人**     | 所有聊天集中一处，重新联系久未联系的人，记住说过的话（事实），在每个招聘网站上保持同一份简历。                           |
| **销售**     | 来自每个网络的潜在客户汇入一个 CRM，按规则划分受众，大规模个性化外联（每条消息只发一次、礼貌有节奏），跟进，快速回复。   |
| **市场营销** | 向受众群发，在 Telegram 频道、LinkedIn 和 X 发帖，社区成员保持最新，每次自动发送都遵守退订名单。                         |
| **用户支持** | 所有来信进入一个 Operator 队列，以 VK 社区或 Telegram Business 账号回复，自动回复以安全草稿形式出现，事实构成知识库。    |
| **组织**     | 同样的工具服务于品牌、店铺或项目：它的账号、它的联系人、它的数据都在它自己的电脑上。团队模式（多名操作员）已列入路线图。 |

每个场景今天能用什么、哪些是部分支持、下一步做什么，请见路线图：[`docs/ROADMAP.zh.md`](docs/ROADMAP.zh.md)。

## 立即试用（无需安装）

在任意现代浏览器中打开 <https://link-foundation.github.io/meta-sovereign/>。Web 应用会立即启动，默认完全在浏览器中运行，并写入本地存储；除非你主动连接服务器，否则数据不会离开设备。

> 如果链接暂时还不可用，GitHub Pages 工作流（`.github/workflows/pages.yml`）会在下一次推送到 `main` 后发布。

没有服务器时，托管的 app 以 **browser-only mode** 运行：联系人、模式和群发使用浏览器存储工作，而导入、自动化、同步、简历同步和问候需要等待本地服务器。提示中会给出启动服务器的命令和 **Check again** 按钮。

## 桌面应用

从 <https://link-foundation.github.io/meta-sovereign/download/> 或 [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases) 下载适合你系统的安装包：Linux（AppImage、deb、tar.gz）、macOS（dmg、zip）和 Windows（安装版、便携版），均提供 x64 和 arm64。桌面应用内置服务器，因此无需自己启动服务器即可使用全部功能。未签名构建的首次启动步骤、校验和与更新说明见 [`docs/USER-GUIDE.zh.md` §4](docs/USER-GUIDE.zh.md#4-安装桌面或移动-app)。

## 运行本地服务器（推荐用于同步）

如果要在设备之间同步并使用完整功能，请在 SPA 旁边启动本地服务器。当前有两个后端，它们实现同一套 wire protocol（见 [`docs/SERVER-PARITY.zh.md`](docs/SERVER-PARITY.zh.md)）。

### Rust 服务器 — 单二进制，无运行时，但功能有限

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **Rust 服务器的限制。** 它只把 links 保存在**内存**中：不会写入磁盘，服务器停止后所有数据都会丢失。它**没有 source adapters**：不能从 Telegram、VK、GitHub、Upwork 等实时拉取，没有出站 HTTP/TLS 客户端（email 只能导入归档），也没有自动化、CV 同步、浏览器 auto-import、备份和 `/api/export-encrypted`。实际使用请选择 JS 服务器或桌面 app。逐条路由列表见 [`docs/SERVER-PARITY.zh.md`](docs/SERVER-PARITY.zh.md)。

### JavaScript 服务器 — 功能完整（Node/Bun/Deno），从源码运行

该包**尚未发布到 npm**（registry 返回 404），所以 `npx -y meta-sovereign serve` 目前无法使用。请从源码仓库运行服务器（需要 Node.js 和 npm）：

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

包发布到 npm 之后，`npx -y meta-sovereign serve`（或 `npm install -g meta-sovereign && meta-sovereign serve`）才会可用。在此之前，不想装工具链的话可以使用桌面 app（见上文）。

两个后端默认监听 <http://127.0.0.1:8787>。JS 服务器会对托管 app 的 origin（`https://link-foundation.github.io`）返回 CORS 头；其他 origin 可以用 `meta-sovereign serve --allow-origin=<origins>` 或 `MS_ALLOW_ORIGINS` 允许。Safari 不允许 `https` 页面访问 `http://127.0.0.1`，但允许访问 `https://127.0.0.1`；服务器现在也在同一端口上提供 HTTPS 服务，并使用专为 localhost 颁发的自签名证书。运行一次 `node js/bin/meta-sovereign.js trust`（macOS：将证书添加到 login keychain；其他系统：打印证书路径），或在 Safari 中打开 `https://127.0.0.1:8787/trust` 并按提示操作，之后托管 app 在 Safari 中即可直接连接服务器。信任之前，提示会显示服务器地址及 **信任服务器**（<https://127.0.0.1:8787/trust>）链接；仅当显式启用 localhost 界面时才显示其链接。`--tls=false` / `MS_TLS=off` 可关闭 HTTPS。Safari 通过受信任的本地 HTTPS API 使用托管应用；localhost 界面是可选的。托管的 SPA 会通过 `discoverServer()` 自动发现本地服务器（保存的覆盖值 → `127.0.0.1` 端口）。如果浏览器没有自动连接，请打开应用内 **Settings → Server**，粘贴服务器打印的 URL。

默认界面是托管的应用：`serve` 会打印其地址 <https://link-foundation.github.io/meta-sovereign/>，应用会自行在我们的端口 8787 上找到服务器（也会查看 8788、7001、7002 和 3000；若使用其他端口，`serve` 会提示在 **Settings → Server** 中设置），因此服务器无需自己托管网站。默认情况下，`/` 重定向到 GitHub Pages，服务器只提供 API、同步传输和连接辅助路由。如需离线使用 localhost 网页，请显式运行 `serve --local-ui=true`（或设置 `MS_LOCAL_UI=on`），随后可在 <http://127.0.0.1:8787> 访问该副本。桌面壳会显式启用其内置界面。`--ui-url=<url>`（或 `MS_UI_URL`）指定另一个托管副本（例如某个 fork 的 Pages），并允许其 origin。

在 macOS 交互式终端中，`serve` 会完成整个设置：使用 Secure Enclave 保护本次安装的 TLS 私钥，检测证书是否已受信任，仅在需要时请求信任，并打开 GitHub Pages 应用。无交互终端时可运行 `node js/bin/meta-sovereign.js serve --trust=true --open=true`。`--trust=false` 和 `--open=false` 可关闭相应操作。Swift 辅助程序需要 macOS Command Line Tools；不支持的 Mac 可显式使用 `--hardware-key=false` 选择文件密钥。硬件保护针对磁盘上的密钥；Node 在内存中使用密钥。详见[本地服务器设置与安全](docs/LOCAL-SERVER-SECURITY.md)。

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

- **统一收件箱**：覆盖 VK、Telegram、X、WhatsApp、Facebook、Instagram、LinkedIn、电子邮件、GitHub、Upwork、PeoplePerHour 和招聘网站；网络允许时实时更新（Telegram、VK Long Poll、增量 IMAP、GitHub），其余可导入任意大小的存档。
- **像 Telegram 官方应用一样的聊天**：每条消息只发送一次，送达对勾，实时更新与断线后补齐，已读标记，云端草稿，刷新后仍保留的重试（[`docs/CHAT-REFERENCES.zh.md`](docs/CHAT-REFERENCES.zh.md)）。
- **CRM**：一个视图看到联系人的全部信息，跨网络识别同一个人，社区与成员关系，搜索，按规则定义受众（`friends:vk & chat:vk:… - list:blocked`）。
- **外联、群发与自动化**：给谁发、何时发、在什么条件下发、发什么内容；预览谁会收到什么；默认生成安全草稿，或按节奏自动发送，并有安静时段、每个聊天的冷却期、每日上限和退订名单。每次自动发送都经过同一个发件箱：最多发送一次，结果不明时不会自行重试（[`docs/USER-GUIDE.zh.md`](docs/USER-GUIDE.zh.md) 第 11 节）。
- **Operator 队列与回复**：逐个聊天处理未读消息，根据您以往的回答给出回复建议（按 Tab 采用），模式与回复变体，对匹配消息自动回复。
- **企业与社区账号**：VK 社区令牌运行 Bots Long Poll；Telegram Business 的快捷回复、问候与离开消息、营业时间和聊天机器人。
- **记忆**：从对话中提取结构化的 `问题 → 答案` 事实，并可在聊天中核对。
- **问候**：像 [konard/vk-bot](https://github.com/konard/vk-bot) 一样，在 VK、Telegram、WhatsApp、Messenger、X 和电子邮件中用一句“你好”或问候贴纸开启对话（[`docs/GREETINGS.zh.md`](docs/GREETINGS.zh.md)）。
- **简历同步**：通过您自己的浏览器在 LinkedIn、hh.ru、Habr Career、Naukri、VietnamWorks、TopCV 和 SuperJob 之间逐字段同步（[`docs/CV-SYNC.zh.md`](docs/CV-SYNC.zh.md)）。
- **数据安全**：抗崩溃的本地存储（[Doublets](https://github.com/linksplatform/doublets-rs) + [Links Notation](https://github.com/link-foundation/links-notation)），自动数据结构迁移（[`docs/DATA-MIGRATIONS.zh.md`](docs/DATA-MIGRATIONS.zh.md)），流式加密备份，磁盘写满时的处理，加密的密钥，拒绝其他网站访问的本地服务器。
- **随处可用**：网页应用、内置服务器的桌面应用、移动外壳、设备间 WebRTC 同步、离线写入稍后补发；纯 Rust 服务器使用相同的磁盘格式。
- **四种语言**：应用和所有文档都有英文、俄文、印地文和中文版本。

逐个网络的每项功能——已支持、部分支持或不支持，以及是否可通过 API 或网页应用实现：[`docs/FEATURES.zh.md`](docs/FEATURES.zh.md)。每条需求及其证据：[`docs/REQUIREMENTS.zh.md`](docs/REQUIREMENTS.zh.md)。

## 状态

需求 R-A 至 R-Z24 均已完成，并在 CI 中于 Linux、macOS 和 Windows 上用 Node、Bun 和 Deno 检查，另有 Chromium 浏览器端到端测试。测试使用模拟服务：测试中不会从真实账号发送任何内容，只有 Telegram 的消息显示另外在真实存储上核对过。各场景的状态与下一步（真实账号验证、OAuth 登录、团队模式、销售管道、活动结果）见 [`docs/ROADMAP.zh.md`](docs/ROADMAP.zh.md)。

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
