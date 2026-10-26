# 用户指南 (languages: [en](USER-GUIDE.md) • zh • [hi](USER-GUIDE.hi.md) • [ru](USER-GUIDE.ru.md))

本页把 `meta-sovereign` 的用户流程集中在一起。流程从“什么都不安装”到“安装完整环境”排序，你可以在满足需求时停止阅读。

meta-sovereign 在网上代表一个人或一个组织：为个人使用、销售、市场营销和用户支持提供同一个收件箱、CRM 和自动化。各场景目前能做什么，见 [`ROADMAP.zh.md`](./ROADMAP.zh.md)。

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

## 2. 添加本地 Rust server（轻量，功能有限）

Rust server 是单二进制、无 runtime、冷启动最快。它暴露与 JS server 相同的 wire protocol（见 [`docs/SERVER-PARITY.zh.md`](./SERVER-PARITY.zh.md)）。

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **选择之前请先了解限制。** Rust server 只把 links 保存在**内存**中：不会写入磁盘，停止后所有数据都会丢失。它**没有 source adapters**：不能从 Telegram、VK、GitHub、Upwork 等实时拉取，没有出站 HTTP/TLS 客户端（email 只能导入归档），也没有自动化、CV 同步、浏览器 auto-import、备份和 `/api/export-encrypted`。实际使用请选择 JS server（第 3 节）或桌面 app（第 4 节）。逐条路由列表见 [`docs/SERVER-PARITY.zh.md`](./SERVER-PARITY.zh.md)。

Server 默认监听 <http://127.0.0.1:8787>。GitHub Pages 上的 SPA 会自动探测保存的 override（`localStorage` 中的 `metaServer`）和一组 `127.0.0.1` 端口。

如果没有自动连接，请打开应用内 **Settings → Server**，粘贴 Rust binary 打印的 URL。

## 3. 添加本地 JS server（功能完整）

如果没有 Rust toolchain，或需要 Rust server 尚未完全覆盖的额外 routes（`/api/backups`、`/api/export-encrypted`、`/api/links/purge-tombstones`、`/api/outreach`），可以使用 JS server。

该包**尚未发布到 npm**（registry 返回 404），请从源码仓库运行 server（需要 Node.js 和 npm）：

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

JS server 监听同一个端口，使用同一套 wire protocol；SPA 不关心另一端是哪个后端。

包发布到 npm 之后，`npx -y meta-sovereign serve`（或 `npm install -g meta-sovereign && meta-sovereign serve`）才会可用；在此之前两者都不能用。

### 聊天就绪与持久化数据

打开的聊天优先加载，并显示加载或重试状态。全部 / 私聊 / 群组 / 频道筛选在每个 Telegram 文件夹内都可用。拖动竖直分隔线调整列宽，尺寸会保存。通话位于主菜单聊天之后，Telegram 账户编辑移到个人资料。默认深色控件使用白色线条图标。

GitHub Pages 和可选的 localhost 应用均会在启动查找失败后等待 5、10、20 秒重试，此后每 30 秒重试。返回标签页或恢复网络时立即检查。同一时间仅进行一次查找；恢复连接时重新加载一次。仅浏览器模式不会向静态网站发送密码锁请求。

**操作员** 每次打开一个未读会话卡片，不显示聊天列表。卡片包含历史记录、未读上下文和普通回复输入框。**下一个 (N)** 保留未读状态并切换会话；**完成 (D)** 将已显示的消息边界标为已读，仅在服务器确认成功后前进。失败时保留卡片并提示重试。输入文字不会触发这些快捷键。新的未读会话会实时加入队列，完成后显示“没有未读会话”。聊天、通话和操作员图标旁的黑白圆形数字分别表示未读消息、未读未接来电和等待处理的会话；零值隐藏。通话数字中的“+”表示已加载页面之外仍有较早历史，打开通话会在此浏览器中确认其通知。

连接和个人资料中的 **工作账号** 为 Upwork、Fiverr、PeoplePerHour 和 Wellfound 提供初始登录与资料支持（issue #42）。打开可见的登录浏览器，自行登录，在同一标签页打开自己的资料并点击 **保存此个人资料**。每个服务分别保留本地资料快照和浏览器配置；不会提取密码或 cookies。快照在服务器重启后保留，但不代表当前仍已登录。参见[设置、能力与限制](WORK-ACCOUNTS.md)。

**全部** 默认是最后一个文件夹标签。启用 **设置 → 文件夹标签 → 始终将“全部”放在最前**，可在此浏览器中将其固定在最前。命名文件夹保留 Telegram 中的顺序。启动、文件夹更新及调整列宽时会滚动到选中的标签；所选文件夹会被记住。

JS 服务器将数据保存在操作系统用户的应用文件夹：macOS 为 `~/Library/Application Support/Meta Sovereign/store`，Windows 为 `%APPDATA%/Meta Sovereign/store`，Linux 为 `${XDG_CONFIG_HOME:-~/.config}/Meta Sovereign/store`。从旧 checkout 启动 `serve` 会一次性迁移 `.meta-sovereign`，保留消息、联系人、会话、媒体和证书，并用兼容目录链接保留旧路径。重启或改变工作目录仍使用同一存储。可通过 `--store` 或 `META_SOVEREIGN_STORE_DIR` 覆盖。参见[聊天就绪与数据存储](CHAT-READINESS.md)。

## 4. 安装桌面或移动 app

桌面和移动 app 把 GitHub Pages 上的同一个 SPA 加上内置 server，封装到 native shell 中。想使用完整功能又不想自己启动 server 时使用它们。

### 桌面（Linux、macOS、Windows）

打开 <https://link-foundation.github.io/meta-sovereign/download/>。页面会识别你的系统，提供最新 release 中匹配的安装包，并列出其他所有构建。每个文件也附在 [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases) 上。

| 系统    | 文件（x64 和 arm64）                                              |
| ------- | ----------------------------------------------------------------- |
| Linux   | `.AppImage`（自动更新）、`.deb`、`.tar.gz`                        |
| macOS   | `.dmg`（拖到 Applications）、`.zip`                               |
| Windows | `windows-installer` `.exe`（自动更新）、`windows-portable` `.exe` |

首次启动：

- **macOS。** 没有 Apple Developer ID 的构建使用 ad-hoc 签名，macOS 会阻止首次启动（“Apple could not verify…”）。打开 System Settings → Privacy & Security，点击 **Open Anyway**。这类构建不会自动更新，请从下载页获取新版本。
- **Windows。** 如果 SmartScreen 显示 “Windows protected your PC”，点击 **More info** → **Run anyway**。
- **Linux。** 执行 `chmod +x meta-sovereign-desktop-linux-*.AppImage` 后运行，或用 `sudo apt install ./<file>.deb` 安装 `.deb`。

用 release 中的 `SHA256SUMS.txt` 校验下载的文件：可以在下载页的 **Verify your download** 区域进行（选择文件和 `SHA256SUMS.txt`，数据不会离开浏览器），也可以在终端中执行：

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify <file> --repo link-foundation/meta-sovereign
```

应用把数据保存在系统的用户应用目录中，因此更新后数据仍然保留。自行构建安装包：`npm i --no-save electron-builder@^26 && npm run desktop:build -- --linux --x64`（见 `js/scripts/build-desktop.mjs`）。

### 移动端和开发构建

| 平台     | 构建命令                                        |
| -------- | ----------------------------------------------- |
| Electron | `npm run electron`（从源码运行）                |
| iOS      | `npm run mobile:ios`（打开 Xcode）              |
| Android  | `npm run mobile:android`（打开 Android Studio） |

Electron 和 Capacitor shell 原样复用 `js/src/web/`，所以界面与 GitHub Pages 上的 app 相同。

## 5. 将 SPA 连接到 server

[`discoverServer()`](../js/src/web/discover.js) 的选择顺序：

1. **Same origin** — 当 SPA 由 JS 或 Rust server 直接提供时。
2. **Saved override** — `localStorage.metaServer = "https://my-server"`，由 **Settings → Server** 设置。
3. **Runtime shell candidates** — Electron 和 Capacitor 注入内置 server URL。
4. **`127.0.0.1` ports** — 自动探测默认端口。
5. **Caller-supplied LAN candidates** — 可以传入列表。

如果都无响应，SPA 保持 **offline mode** 并写入本地 browser store。以后 server 出现时，[`OfflineClient`](../js/src/web/client.js) 会重放排队写入。

在 offline mode 下，托管的 app 会显示 **browser-only mode** 提示，包含启动本地 server 的命令、**Check again** 按钮和桌面 app 的链接。导入、自动化、同步、简历同步和问候需要 server；联系人、模式和群发继续使用浏览器存储工作。

托管的 app 位于 `https://link-foundation.github.io`，因此浏览器会先向本地 server 请求许可（CORS）。JS server 默认只允许此托管 origin 及服务器自身的精确 loopback origin。WebView 需要显式配置。要允许其他 origin，例如你自己部署的 SPA：

```bash
meta-sovereign serve --allow-origin=https://example.org
# 或：MS_ALLOW_ORIGINS="https://example.org https://link-foundation.github.io"
# --allow-origin=none 关闭跨源访问
```

默认界面是 GitHub Pages 上的托管应用。`serve` 会打印其地址，应用会自行在端口 8787 上找到服务器。
默认 `/` 重定向到 <https://link-foundation.github.io/meta-sovereign/>，localhost 界面关闭。
如需离线使用可选的本地副本，请显式启用：

```bash
meta-sovereign serve --local-ui=true    # 或 MS_LOCAL_UI=on
# 此时 / 提供可选的 localhost 界面；--ui-url=<url> 指定另一个托管副本
meta-sovereign serve --tls=false        # 或 MS_TLS=off — 关闭 HTTPS
```

浏览器说明：

- **Chrome 和 Edge**（以及较新的 Firefox）会询问一次页面能否访问本地网络中的设备。请允许。
- **Safari** 不允许 `https` 页面访问 `http://127.0.0.1`，但允许访问 `https://127.0.0.1`；server 现在也在同一端口上提供 HTTPS，并使用专为 localhost 颁发的自签名证书。若要让托管 app 在 Safari 中直接连接，请信任该证书一次：运行 `node js/bin/meta-sovereign.js trust`（macOS 将证书添加到 login keychain；其他系统会打印证书路径），或在 Safari 中打开 `https://127.0.0.1:8787/trust`，点击 **显示详情 → 访问此网站** 并输入密码，然后点击 **Check again**。此后托管 app 在 Safari 中可直接通过 HTTPS 连接，无需额外步骤。信任之前，提示会提供 **信任服务器**（<https://127.0.0.1:8787/trust>）链接；仅在 `--local-ui=true` 时显示 **从服务器打开应用**。Safari 通过受信任的本地 HTTPS API 使用托管应用，无需启用 localhost 界面。`--tls=false` / `MS_TLS=off` 可关闭 HTTPS。

在 macOS 交互式终端中，`serve` 会完成整个设置：使用 Secure Enclave 保护本次安装的 TLS 私钥，检测证书是否已受信任，仅在需要时请求信任，并打开 GitHub Pages 应用。无交互终端时可运行 `node js/bin/meta-sovereign.js serve --trust=true --open=true`。`--trust=false` 和 `--open=false` 可关闭相应操作。Swift 辅助程序需要 macOS Command Line Tools；不支持的 Mac 可显式使用 `--hardware-key=false` 选择文件密钥。硬件保护针对磁盘上的密钥；Node 在内存中使用密钥。详见[本地服务器设置与安全](./LOCAL-SERVER-SECURITY.md)。

## 6. 在设备之间同步（WebRTC）

当设备共享同一 server（Rust 或 JS）后，它们通过 server 的 `/rtc` signaling endpoint 使用 WebRTC 同步（[`webrtc-sync.js`](../js/src/web/webrtc-sync.js)）。实际流量是 peer-to-peer；server 只负责初始握手。对称 NAT 场景请见 [`docs/WEBRTC-TURN.zh.md`](./WEBRTC-TURN.zh.md)。

## 7. 加密备份和导出

加密备份和导出使用 AES-256-GCM。消息存储**没有**静态加密；只有保存的凭据（`secret:*` 链接）可以加密，且仅当服务器以 `MS_SECRET_PASSPHRASE` 启动时（见下面的[保护已保存的 secrets](#保护已保存的-secrets)）。`vault-*` CLI 命令（[`vault.js`](../js/src/storage/vault.js)）管理的是另一个 unlock 文件；server 并不使用它。

**文件与备份。** 请保持存储目录私密（应用创建的文件为 0600、目录为 0700，启动时会收紧旧文件）。普通备份不含密钥（manifest `secrets: excluded`）并会注明；加密备份（在备份页面输入口令，或设置该变量）才包含密钥。日志会隐藏令牌和密码。同一时间只有一个进程写入存储：第二个写入者（例如 `serve` 运行时执行 `import`）会带着明确提示停止，而 `export` 等只读命令仍可使用。 备份以流式压缩方式写入（`meta-sovereign-<时间>.msbk`，加密时为 `.msbk.enc`），因此在数 GB 的存储上也不会占满内存；每个归档写完后都会读回校验，恢复时会先检查整个文件（被改动、截断或调换顺序的字节都会被拒绝）再动存储。`data.bin` 不进归档：它会由 `data.lino` 重建。旧版本的备份（`.json`、`.json.enc`）仍可恢复。 备份会记录写入时的数据 schema：来自更新版本的备份会被拒绝（代码 `BACKUP_TOO_NEW`，请更新应用），来自旧版本的备份可恢复，存储在下次打开时迁移。

**自动备份与受众同步（环境变量）。** 服务器可以自行运行两项任务；它们只在端口确实归自己时才启动，关闭时停止，重启后不会重复启动。日志只记录数量，从不记录消息文本或密钥。

| 变量                       | 默认值       | 含义                                                                                                                                                                           |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MS_BACKUP_INTERVAL_HOURS` | `24`（每天） | 自动备份到 `archives` 文件夹的间隔小时数（第一次在启动后整整一个间隔）。`0` 关闭自动备份。未设置 `MS_SECRET_PASSPHRASE` 时为普通备份（不含密钥）；磁盘将满时跳过并写一行日志。 |
| `MS_BACKUP_KEEP`           | `3`          | 保留多少份自动备份；最旧的会被删除，但绝不删除最新的完好备份。`0` 表示全部保留。                                                                                               |
| `MS_AUDIENCE_SYNC_HOURS`   | `24`         | 从各网络刷新已保存受众（好友和聊天成员）的间隔小时数。`0`：关闭（页面上的同步按钮仍可用）。                                                                                    |

不是 0 或更大数字的值会被忽略：使用默认值并记录一行日志（`backup_setting_ignored` 或 `audience_sync_setting_ignored`）；服务器仍会启动。

从 CLI 导出加密 snapshot：

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

也可以从 JS-server-backed SPA 调用 `POST /api/export-encrypted`。Rust server 尚未暴露该 route；此时使用 CLI。

### 保护已保存的 secrets

你在 app 中保存的凭据（Telegram API id 和 hash、bot token、Telegram user session、email token，以及 GitHub、Upwork、PeoplePerHour 的 token）以 id 以 `secret:` 开头的 links 形式保存。默认它们在存储中是**明文**。要加密它们，请在环境变量 `MS_SECRET_PASSPHRASE` 中设置 passphrase 来启动 JS server：

```bash
MS_SECRET_PASSPHRASE='只有你自己知道的长 passphrase' node js/bin/meta-sovereign.js serve
```

它的作用：

- 每个 `secret:*` link 在写入前都用 AES-256-GCM 封存（密钥由 passphrase 经 scrypt 派生，每次写入使用新的 salt 和 IV）。link id 仍可读，所以存储里能看到_有哪些_ secrets，看不到内容。
- 每次启动请使用同一个 passphrase。错误的 passphrase 打不开已封存的 secrets，也无法恢复：丢失 passphrase 就丢失这些 secrets，需要重新登录或重新粘贴 token。
- 设置 passphrase 之前保存的 secrets 在重新保存之前仍是明文。
- 未设置该变量时，什么都不加密，server 行为和以前一样。
- 当请求没有带 passphrase 时，`POST /api/export-encrypted` 默认使用同一个 passphrase。

它**不会**加密的内容：存储的其余部分（`data.lino` 和 `data.bin`：联系人、消息、patterns 等）、下载的媒体和归档、日志，以及备份（只有创建备份时给了 passphrase 才会加密）。请用磁盘加密和文件权限保护它们。Rust server 没有这个选项：它把一切都放在内存中。

## 8. 导入数据

### 导入通讯录（macOS、iCloud 和 vCard）

在**联系人 → 导入联系人**中选择 macOS / iCloud 联系人或 vCard 文件。此功能需要 JavaScript 服务器或桌面应用；默认网页应用仍为 [GitHub Pages](https://link-foundation.github.io/meta-sovereign/)。macOS 仅在点击并获得系统授权后读取系统通讯录中已同步的账户（包括 iCloud、Google 和 Exchange）。原生助手需要 macOS Command Line Tools。在任何平台也可从服务商导出 `.vcf` 文件。先查看新增、更新和跳过的数量，再选择导入；取消不会保存联系人记录。重复导入未更改的记录不会产生副本。导入只保存在本地，不会上传到消息服务。

Telegram 用户账户已通过 `contacts.getContacts` 导入其已保存的 Telegram 联系人，这与系统通讯录不同。目录在同步期间自动刷新，保留搜索条件，并提供刷新按钮；没有消息的联系人也计入其中。字段、限制、系统权限、CLI 命令和存储锁说明见[联系人导入](CONTACTS-IMPORT.md)。

### 导入消息归档

把 archive 放入 `<store>/imports/`（可配置），然后运行：

```bash
meta-sovereign import
```

支持 email（`.eml`/mbox）、VK、Telegram Desktop、X、WhatsApp、Facebook、LinkedIn、career.habr.com、hh.ru、superjob.ru。完整列表见 [`docs/REQUIREMENTS.zh.md`](./REQUIREMENTS.zh.md) 的 E 节。

Live email 可使用 `source-pull --source=email --protocol=gmail`、`microsoft-graph`、`jmap`、`imap` 或 `pop3`。原始 IMAP/POP3/SMTP 还需要 `--host`、`--username`、`--password`，除非设置了等价的 `EMAIL_*` 环境变量。

### 通过浏览器导入

**连接** 中每个服务卡片都提供两种独立的连接方式：**通过浏览器导入**（推荐）和 **手动填写**（API 密钥、导出文件或粘贴内容）。服务页面将它们显示为两个标签页，地址（`#conn-<service>` 或 `#conn-<service>/manual`）在重新加载后仍保留所打开的标签页。**通过浏览器导入**需要在同一台电脑上
运行 JS server（`meta-sovereign serve`，Node.js 22.12 或更高版本）；server 通过
[browser-commander](https://github.com/link-foundation/browser-commander)
驱动 Chrome。

1. 点击 **打开浏览器**。服务会在单独的 Chrome 窗口中打开，并使用独立的
   profile（`<store>/auto-import/profiles/<service>`，仅所有者可访问），
   因此只需登录一次。
2. 在那里开始该服务的数据导出。该窗口下载的每个文件都会被捕获；ZIP 和
   tar.gz 会被解压，其中的导出文件会被导入。
3. Telegram Web 和 WhatsApp Web 没有导出功能：打开一个聊天并点击
   **保存此聊天**。
4. 点击 **完成** 或关闭窗口。空闲的浏览器会在 30 分钟后自动关闭。

**使用浏览器中的登录（推荐）。** 在 **连接** 顶部，**查找登录**
会列出这台电脑上的所有浏览器（Chrome、Safari、Firefox、Edge、Brave、
Arc、Yandex 等）以及每个浏览器已登录的服务。这一步只读取站点名称。
**使用这些登录** 会把勾选浏览器中这些服务的 cookies 复制到仅所有者可读
的文件（`<store>/auto-import/sign-ins/<service>.json`）；该服务的下一个
导入窗口会以登录状态打开，随后副本被删除。只读取你的浏览器，任何数据都
不会离开这台电脑。Telegram Web 和 WhatsApp Web 的登录不在 cookies 中，
请扫描一次它们的二维码。在 macOS 上读取 Safari 数据需要
**完全磁盘访问权限**：面板会说明需要授权的应用（你的终端或桌面应用），
并打开「系统设置」→「隐私与安全性」→「完全磁盘访问权限」；授权后重启
服务器。Chrome 可能会询问一次钥匙串密码。

服务按用户数量排序，最大的在前，所以 Email 排第一。

server 需要启动浏览器进程以及写入存储目录的权限。可选设置：

| 变量                                           | 作用                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `MS_BROWSER_CDP_URL`                           | 连接到已运行的 Chrome（`chrome --remote-debugging-port=9222`，然后 `http://127.0.0.1:9222`）。适用于没有屏幕的 Docker。 |
| `MS_BROWSER_CHANNEL` / `MS_BROWSER_EXECUTABLE` | 使用其他基于 Chromium 的浏览器。                                                                                        |
| `MS_BROWSER_HEADLESS=1`                        | 无窗口（仅适用于已登录的 profile）。                                                                                    |
| `MS_BROWSER_VERBOSE=1`                         | browser-commander 调试日志。                                                                                            |

在 Deno 下用 `deno task serve` 启动 server，它为浏览器进程授予
`--allow-run`。导入只能从应用本身启动：server 会拒绝来自其他网站的请求。

## 9. 在求职平台之间同步简历

简历通常同时存在于 LinkedIn、hh.ru、Habr Career、Naukri、VietnamWorks、
TopCV 和 SuperJob 上，这七份副本会逐渐不一致。`meta-sovereign` 通过你自己
机器上的浏览器读取全部简历，显示差异，并把商定的值写回去。

这需要 CLI：一个网页无法驱动另一个网页，因此 app 里的 **CV** 页面展示覆盖
范围、差异和运行历史，真正的运行交给终端。

```bash
# 一次性：安装浏览器引擎（可选依赖）
npm install playwright browser-commander
npx playwright install chromium

# 查看支持哪些平台，以及标记已验证的比例
meta-sovereign cv-platforms

# 用可见浏览器登录一次；session 会保存在 profile 目录里
meta-sovereign cv-read --platforms=linkedin --headed --profile=~/.meta-sovereign/cv

# 读取多个资料，并保留页面快照以便事后检查
meta-sovereign cv-read --platforms=linkedin,hh,naukri --login=<你的登录名> --artifacts=./cv-runs

# 比较已读取的内容 — 不需要浏览器
meta-sovereign cv-diff --prefer=linkedin

# 先看 sync 会改什么，再执行
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# 只写一个字段或一个编辑区块，其余不动
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# 最近几次运行发生了什么
meta-sovereign cv-telemetry --type=step.miss
```

不会有人向你索要平台密码：浏览器以 `--headed` 打开，你像平时一样登录，
session 保存在你指定的 profile 目录中。

本地 server 运行时，同样的操作也可以通过 HTTP 使用：
`GET /api/cv/platforms`、`GET /api/cv/plan?platform=…`、
`GET /api/cv/stored`、`POST /api/cv/read`、`POST /api/cv/compare`、
`POST /api/cv/sync`、`GET /api/cv/telemetry`。

| 现象                                 | 含义                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `browser-commander is not installed` | 安装上面的可选依赖，或改用 `cv-platforms` / `cv-plan` / `cv-diff`，它们不会打开浏览器。        |
| 运行以 `login-required` 结束         | 平台把你跳转到了登录页。加上 `--headed` 重新运行并登录。                                       |
| 运行以 `step-missed` 结束            | 站点改了 markup。原因里写明了 selector；`cv-telemetry` 和 `--artifacts` 中的 HTML 可还原页面。 |
| 平台报告 `unsupported`               | 该字段在平台计划里没有编辑器 — 这个改动会被报告，而不是被悄悄丢弃。                            |
| 字段被标记为 `deselected`            | 它是可写的，但被你的 `--paths`/`--groups` 过滤掉了。                                           |
| CV 页面提示需要 JS server            | 当前连接的 backend（例如 Rust server）没有 `/api/cv/*` 路由。                                  |

规范简历结构、步骤词汇、telemetry 事件以及每个平台已验证的内容，详见
[`docs/CV-SYNC.zh.md`](./CV-SYNC.zh.md)。

## 10. 用问候语或贴纸打招呼

开启对话是与人交流中最慢的部分。**问候** 页面会替你发送一句 "hi" 或一张
问候贴纸，就像 [konard/vk-bot](https://github.com/konard/vk-bot) 在 VK 上
做的那样，让你可以直接进入真正想测试的那条消息。

1. 打开 **问候**。贴纸网格显示 VK 的问候贴纸（图片直接从 vk.com 加载）和
   Messenger 的点赞贴纸。勾选你想用来问候的贴纸。
2. 点击 **实时列出贴纸**，从你的账号获取更多贴纸：关键词为问候的 VK 贴纸，
   以及网格下方列出的 Telegram 贴纸集中的 👋 贴纸。你可以通过贴纸集的
   `t.me` 链接把它添加到 Telegram。
3. 选择问候文本的语言，以及更偏好贴纸还是文字，然后点击 **保存选择**。
4. 把 **计划** 设为 **开启新对话**（从未联系过的人，最早的在前）或
   **回复问候**（说了 "hi" 正在等待回复的人），然后点击 **预览计划**。表格
   显示谁会收到什么，以及某人为何被跳过 — 例如，WhatsApp 和 Messenger 只
   允许在对方最后一条消息后的 24 小时内发送自由格式消息，而 Telegram bot
   只能回复。
5. **发送问候** 会把计划加入队列，消息之间留有停顿（默认 30 秒）。任何人都
   不会被问候两次。

在终端中也可以完成同样的操作：

```bash
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply
```

列出贴纸和发送需要 JS server（`meta-sovereign serve`）以及你已连接的 VK、
Telegram、WhatsApp 或 Messenger 账号。没有 server 时，页面仍会显示目录和
预览。Telegram 自带的空聊天推荐贴纸无法供 bot 使用 — 这一点及其他细节见
[`docs/GREETINGS.zh.md`](./GREETINGS.zh.md)。

## 11. 自动化：按规则安全地给人发消息

一个自动化规定给谁发消息、何时发、满足什么条件以及用哪段文字。打开
**自动化** 标签页即可编辑、预览和运行它们。第一个是 issue #31 的
“Say hi to contacts silent for 90 days”（向沉默 90 天的联系人打招呼）：
每个至少 90 天没有任何消息的个人 1:1 聊天——群组、频道和机器人不包括在
内——都会收到一条消息：

- 如果你们之间用 "ты"，就用 "Привет … Тебе или твоим друзьям …"；如果用
  "вы"，就用 "Здравствуйте … Вам или вашим друзьям …"。称呼形式由对话中的
  词级规则判断；没有依据或打平时使用礼貌的 "вы"。两段文字都可以编辑，
  支持 `{name}`、`{days}` 和 `{network}`。
- 其他预设会询问空缺职位、提供合同工作，或回应向你打招呼的人。
  **新建自动化** 会创建一个空白的自动化。

每个自动化包含：

- **何时运行**：手动、从聊天菜单、按计划（`30m`、`12h`、`1d`、`2w`），
  和/或在收到匹配某个正则表达式的消息时。
- **发给谁**：一个受众——`personal`、`friends:vk`、`chat:vk:<id>`、
  `community:vk:<id>`、`list:<id>`、`audience:<id>` 或 `person:vk:<id>`，
  用 `|`（或）、`&`（且）、`-`（除外）和括号组合，例如
  `friends:vk & chat:vk:2000000001 - list:blocked`。
- **条件**：至少沉默 N 天、N 天内不重复、仅限你也发过消息的聊天、仅限
  私聊、最后一条消息由谁发出、哪些网络。
- **模式**：**安全**（默认）在每个聊天中留下一份草稿；**自动** 在询问你
  一次之后直接发送，带“正在输入”指示、随机间隔和每日上限。

**预览** 列出谁会收到哪段文字，以及其余的人为什么被排除（“最近聊过”、
“已有草稿在等待”……）；不会发送任何内容。在安全模式下，每份草稿都会出现
在对应的聊天中：可以编辑它、**发送**（点击即确认）、切换 ты/вы、在该网络
中 **打开聊天**、**我自己发了**，或 **跳过**。每个结果都会被记住，所以
不会意外地给同一个人发两次消息。

**联系人** 在所有网络中搜索每个人（同一个人在其他网络上的账号显示为交叉
引用）；选择一些人，就可以只对他们运行某个自动化，或把他们保存为列表。
**受众** 保存命名的规格，并统计它们匹配多少人。要在一个人身上测试自动化，
打开与他的聊天，使用 **⚡ 自动化 → 在此聊天中测试**。

聊天本身（**聊天** 标签页）会在你输入时建议回复：先是你以前对该聊天最后
一条消息给出的完整回复，用得最多的排在前面，然后是来自你自己消息的逐词
续写；**Tab** 选取第一条建议。
未输入任何内容时只提供典型回复（你对该消息至少给过两次），很久以前的消息不给建议。
建议来自浏览器中保存的你的回复历史副本，因此输入时立即出现，重新加载后或服务器不在时也一样；更少见的建议会在你停顿时由服务器补充。它会显示对方——或代表你的自动化——正在输入。
发送使用该网络的 API，不行时回退到它的官方 web UI。**设置 → 外观** 选择
主题（跟随系统、浅色、深色，或按时间自动切换）和皮肤（t3.codes、
Telegram、WhatsApp 或 Signal）。**减少视觉效果**（自动、始终或从不）会在渲染缓慢的浏览器中关闭模糊和动画。

消息的操作与 Telegram Desktop 一致。右键单击一条消息（手机上长按）即在点击处
打开菜单：先是表情回应，然后是**回复**（选中部分文字时为**引用并回复**：回复会
引用这部分）、**复制所选文字**、**编辑**、**置顶**/**取消置顶**、图片上的
**另存为…**和**复制图片**、**复制文字**、链接上的**复制链接**，否则为
**复制消息链接**（频道中为**复制帖子链接**）、**转发**、**删除**和**选择**。
在群组中，鼠标下的收到的消息角落会显示**回复**。双击消息（或在手机上向左滑动）
即可回复；双击触摸回应 👍。要选择消息，从一条消息拖到另一条（从已选的消息开始
拖则取消选择），或选择**选择**；之后单击添加或移除一条，Shift+点击选择范围，
最多 100 条。聊天顶栏随即显示**转发 n**、**删除 n**和**取消**。右键单击已选消息
可**将所选复制为文本**、**转发所选**、**删除所选**、**取消置顶所选**和
**清除选择**，右键单击其他消息可**选择到此消息**。多条消息按 Telegram Desktop
的方式复制，每条为“[日期 时间] 姓名: 文字”。**Esc** 结束选择，
**Ctrl/Cmd+C** 复制，**Delete** 删除。在空的输入框中，**↑** 编辑你的上一条
消息，**Ctrl/Cmd+↑/↓** 选择要回复的消息。

聊天列表与 Telegram 一致：置顶的聊天按其顺序排在最前并带图钉；免打扰聊天的计数
为灰色；已归档的聊天收在一行**已归档的聊天**之后；每一行显示最后是谁写了什么
（“🙂 贴纸”、“图片”并附缩略图）。在其他设备上读过的聊天保留 Telegram 告知的
未读数。

```bash
# 已保存的自动化和预设
meta-sovereign automations
# 谁会收到什么，其余的人为什么被排除 —— 不写入任何内容
meta-sovereign automations plan reengage-dormant
# 安全模式：为每个人排队一份草稿
meta-sovereign automations run reengage-dormant
# 一次一份草稿 —— [y] 发送、[m] 我自己发了、[e] 编辑、[f] 切换 ты/вы、[s] 跳过、[q] 退出
meta-sovereign automations review
# 自动模式只有带 --confirm=true 才会发送；--chat 把范围缩小到指定的聊天
meta-sovereign automations run job-search --chat=vk:101 --confirm=true
```

HTTP：`/api/automations`（列出，`PUT` 保存）、`/api/automations/plan`、
`/run`、`/drafts`、`/drafts/{send,form,mark,skip}` 和 `/history`；
`/api/people`、`/api/audiences`、`/api/lists`、`/api/send`、
`/api/typing` 和 `/api/suggest` 和 `/api/suggest/model`（以链接形式提供回复索引，
`?format=lino` 为 Links Notation，`?since=` 只取变化）。背景说明见
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md)。

**没有你的确认，什么都不会发送。** 读取——导入、拉取新消息、预览——
会按需进行。任何写入其他服务或会被他人看到的操作（消息、帖子、问候、
批量联系、个人资料或简历的修改）都会先展示出来，只有在你确认了这一具体
内容后才会发送：输入文字下方的「发送」按钮、草稿上的「发送」按钮，或
列出将要发出内容的确认框。定时和收到消息触发的自动化只会准备草稿，即使
处于 auto 模式。保存个人资料或简历只会保存在本设备上；个人资料页面上的
**更新到其他服务** 会把它们发布到你勾选的网络。只有在 **设置 → 隐私**
中开启后，才会向对方显示「正在输入…」。在命令行中，发送类命令会先显示
计划并询问 y/N；脚本请传 `--yes`。

## 12. 故障排除

| 现象                                                 | 处理方式                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPA 卡在 loading spinner。                           | 打开 dev tools → Application → IndexedDB，确认存在 `meta-sovereign` 数据库；否则浏览器可能禁用了存储。                                                                                                                                                                                                                                                                                         |
| SPA 无法访问本地 server。                            | 在 app 中打开 **Settings → Server**，粘贴准确 URL。                                                                                                                                                                                                                                                                                                                                            |
| server 已运行，托管的 app 仍处于 browser-only mode。 | 点击 **Check again**。允许浏览器的本地网络提示。在 Safari 中：运行一次 `node js/bin/meta-sovereign.js trust`（macOS）或打开 **信任服务器**（<https://127.0.0.1:8787/trust>），点击「显示详情 → 访问此网站」，然后 **Check again**。仅在 `--local-ui=true` 时也可点击 **从服务器打开应用**（<http://127.0.0.1:8787>）。如果 SPA 是你自己托管的，用 `--allow-origin=<你的 origin>` 启动 server。 |
| 托管的 app 中照片和头像只显示首字母或空框。          | 更新 server：页面以 CORS 请求获取图片，server 只放行应用自己的 origin。如果 SPA 是你自己托管的，用 `--allow-origin` 加上它的 origin。被拒绝的加载在日志中记为 `telegram_media_refused`（哪个页面、如何请求），页面中加载失败的记为 `client_media_failed`（按路由计数）。                                                                                                                       |
| 刷新后部分消息或头像缺失。                           | 稍等几秒：聊天会重新请求消息直到拿到，仍在从 Telegram 下载的头像保存后即会显示（首次时 Telegram 逐个缓慢发送）。之后已保存的头像会立即加载。                                                                                                                                                                                                                                                   |
| Server 报告 `EADDRINUSE`。                           | 传入 `--port=NNNN` 给 `meta-sovereign serve` 或 Rust `serve --port=NNNN`。                                                                                                                                                                                                                                                                                                                     |
| WebRTC 跨网络停止同步。                              | 配置 TURN server，见 [`docs/WEBRTC-TURN.zh.md`](./WEBRTC-TURN.zh.md)。                                                                                                                                                                                                                                                                                                                         |
| `cargo build` 出现 linker 错。                       | 安装 C toolchain（Debian/Ubuntu 为 `build-essential`，macOS 为 Xcode CLI tools）。                                                                                                                                                                                                                                                                                                             |

## 13. 下一步

- [`README.zh.md`](../README.zh.md) — 项目概览和开发者说明。
- [`docs/REQUIREMENTS.zh.md`](./REQUIREMENTS.zh.md) — canonical requirement list。
- [`docs/SERVER-PARITY.zh.md`](./SERVER-PARITY.zh.md) — JS 与 Rust server routes。
- [`docs/CV-SYNC.zh.md`](./CV-SYNC.zh.md) — 简历同步的工作方式，逐个平台说明。
- [`docs/GREETINGS.zh.md`](./GREETINGS.zh.md) — 问候贴纸和文本，逐个网络说明。
- [`docs/UI-DESIGN-AUDIT.zh.md`](./UI-DESIGN-AUDIT.zh.md) — accessibility 与 HIG/Material/Fluent audit。
- [`docs/case-studies/`](./case-studies/) — 每个 issue 的完整案例研究。

**在这台电脑上查找 Telegram 会话。** 如果你在多个仓库里尝试过 Telegram,你的登录
其实已经在这台机器上——某个项目 `.env` 里的机器人令牌,另一个项目旁边保存的
GramJS 用户*字符串会话*(保存为 `.telegram_session`)。在
**连接 → Telegram → 手动输入** 中,**查找我的 Telegram 会话** 会遍历你的项目文件夹
(`~/Code`、`~/projects` …… 以及当前目录),同时收集**机器人令牌**和**用户会话**,
并按所属账号分组——在三个仓库中找到的同一账号会显示为一个。机器人令牌通过
`getMe` 确认;用户会话按手机号分组(在可用 GramJS 客户端时同样确认)。文件夹只被
读取;浏览器只会看到类型、路径和一个打码提示(最后四位)——绝不会看到令牌或会话。
选中的会存入 `secret:telegram:*`(设置口令时静态加密),且只发送给 Telegram。

**用手机登录 Telegram。** 在查找下方,"用你的 Telegram 账号登录" 像 Telegram Desktop 以及 konard/telegram-bot 那样登录:输入 `api_id`、`api_hash` 和号码,点击"发送验证码",输入 Telegram 发来的验证码(以及二步验证密码,如有),生成的用户会话保存在 `secret:telegram:*` 下。机器人令牌和完整用户账号都受支持。登录在本地服务器(GramJS)上进行;安装了 GramJS 时,找到的 `.telegram_session` 会与真实账号核对。

**邮箱登录名和密码。** 邮箱的"手动输入"可填写 IMAP/SMTP 服务器、登录名(地址)和密码(或应用专用密码),除 OAuth 令牌外,分别保存为 `secret:email:host` / `secret:email:username` / `secret:email:password`。

**邮件连接与安全（R-Z5）。** 服务器在每次拉取和发送时读取这些已保存字段（`secret:email:*`：host、port、security、username、password、mailbox、`ca`）。在 Email 卡片上，“立即收取邮件”会拉取新邮件（每 15 秒最多一次）；连接邮箱后轮询器也每 10 分钟拉取一次，且只取新邮件。`secure: false` 现在表示必须使用 STARTTLS：发送密码前先升级连接并验证证书，不能升级的服务器会被拒绝。明文只允许用于 `127.0.0.1`（例如 Proton Bridge）。证书始终验证；要信任私有证书，请把它的 CA 保存到 `ca`。已保存的密码绝不会发给另一个主机。以前对真实服务器使用 `secure: false` 会以明文传输或失败；现在使用 STARTTLS。邮件从清理后的副本显示：脚本、远程图片和跟踪像素被移除，附件只能下载。尚未提供：OAuth 登录界面、协议字段和文件夹选择。
定时拉取开关（`pulls`）现在也管邮件：`pulls: false` 时不再按计划收取邮件。
