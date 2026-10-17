# 需求 (languages: [en](REQUIREMENTS.md) • zh • [hi](REQUIREMENTS.hi.md) • [ru](REQUIREMENTS.ru.md))

本文件是 `meta-sovereign` 的顶层需求账本的中文版本。稳定的 `R-*` ID、代码
符号、route、命令和文件路径保持原文，便于和英文
[`REQUIREMENTS.md`](./REQUIREMENTS.md)、changeset、PR 和代码注释互相引用。

每个 issue 的完整拆解保存在 [`docs/case-studies/`](./case-studies/)。
[`docs/ROADMAP.md`](./ROADMAP.md) 仍然是 reviewer-facing roadmap ledger。

## A. 数据层

R-A1..R-A5 覆盖统一数据库的外部服务导入/导出、`.lino` 文件、binary
Doublets + text store 同步、自动加密备份，以及偏好 indented Links Notation。
状态：已完成，核心实现为 `DualStore`、`LinoTextStore`、backup scheduler 和
secret-link encryption。

## B. 统一通信 UI

R-B1..R-B4 要求一个统一 chat UI、基于历史 outgoing messages 的自动补全、
operator DONE/NEXT 工作流，以及跨服务 broadcast UI。状态：已完成，SPA view
和 `/api/*` routes 覆盖这些路径。

## C. Pattern matching 与回复自动化

R-C1..R-C5 覆盖 regex/PEG pattern editor、reply variation editor、
n8n-style graph automation、auto/semi-auto modes，以及跨多条消息的个人事实抽
取。状态：已完成，实现在 `src/patterns`、`src/facts`、graph 和 reply
surfaces。

## D. Personal CRM

R-D1..R-D6 覆盖联系人详情聚合、audience DSL、mass-personal outreach、可配置
搜索、profile sync 和 resume sync。状态：已完成。

## E. 外部服务连接器

R-E1..R-E10 要求 VK、Telegram、X、WhatsApp、Facebook、LinkedIn、
career.habr.com、hh.ru、superjob.ru 和 email 的 archive/live support。状态：
已完成；各 adapter 将数据规范化为 unified links。R-E11..R-E13 增加了
Naukri、VietnamWorks 和 TopCV：它们没有公开 API，因此数据来自导出文件和
浏览器会话（见 section V）。

## F. 分发、同步和部署

R-F1..R-F8 覆盖 NPM library surface、CLI、Electron、local web server、
WebRTC sync、Docker microservices 以及 server/client 的 Universal Links API。
状态：已完成。

## G. Stack constraints

R-G1..R-G3 要求 JS server/client + React UI + Rust/WASM heavy workloads、纯
Rust alternative server，以及通过 `deep-foundation/sdk` 风格的 iOS/Android/
Electron packaging。状态：已完成。

## H. 质量、设计和流程

R-H1..R-H6 覆盖 Apple/Material/Fluent UI guidance、简单代码、自动 API docs、
unit/integration/e2e coverage、CI/CD parity 和 Unlicense。状态：已完成。

## I. issue #1 文档交付

R-I1..R-I5 要求 issue #1 的 case study、online research、requirements、
solution plan 和 components survey。状态：已完成。

## J. PR #2 maintainer directives

R-J1..R-J11 覆盖 offline browser storage、server autodiscovery、WebRTC/
WebSocket、handler-driven store API、handled stamps、decentralized GitHub
Pages deployment、browser-commander e2e、pure-Rust server、requirements/
roadmap ledger、single-PR completion 和 CI timeout policy。状态：已完成。

## K. Hardening (issue #6)

R-K1..R-K20 覆盖 soft delete、recoverable tombstones、explicit purge、sync
semantics、provider delete behavior、vault master key、多 unlock methods、
encrypted exports、HTTP/CLI purge/export 和 issue #6 case study。状态：已完成。

## L. Browser-first publishing (issue #8)

R-L1..R-L15 覆盖 GitHub Pages SPA 发布、browser-first docs、Pages workflow、
server discovery、Rust/JS backend guidance、case study 和 CI/CD alignment。状
态：已完成。

## M. 新手友好 UI (issue #10)

R-M1..R-M18 覆盖 connection guides、CORS-aware probes、theme toggle、tutorial
overlay、settings guidance、e2e coverage 和 issue #10 case study。状态：已完
成。

## N. Tutorial progress persistence (issue #13)

R-N1..R-N9 要求 tutorial refresh 后保持当前步骤、Next/Skip/Complete 的持久
化、重新打开时重置、case study、external research 和 root-cause note。状态：
已完成。

## O. Email support (issue #3)

R-N1..R-N10（该历史区段沿用原编号）覆盖 email research、archive import、
Gmail/Microsoft Graph/JMAP live receive/send、IMAP/POP3/SMTP local-server
fallback、HTTP routes、CLI/API surface 和 reproducing tests。状态：已完成。

## P. Provider connections (issue #16)

R-O1..R-O19 覆盖 Telegram/Facebook/WhatsApp 等 provider credential forms、
archive upload/paste import、settings surface、Connect first CTA、secret
storage、probe classification、CORS help、unit/integration/e2e tests 和 issue
#16 case study。状态：PR #17 仍记录为 in progress。

## Q. UI 和文档国际化 (issue #18)

R-Q1..R-Q10 覆盖 SPA language switcher、browser language detection、local
override persistence、`<html lang>`/`dir`、所有 authored UI strings 的
translation keys、dictionary parity tests、Markdown language switchers、
translated docs siblings、docs-language automation、issue #18 case study 和 PR
#19 single-PR delivery。状态：PR #19 in progress。

## U. Mobile-first UI 改造 (issue #25)

R-N1..R-N12 覆盖 mobile-first AppShell（bottom-nav / side-rail /
permanent drawer）、Apple Liquid Glass tokens 与
`prefers-reduced-transparency` fallback、完整的 translation 覆盖（non-EN
build 不会出现 English literal）、独立的 Connections 页面（每个 provider
一张 card 并带 `connected/not-connected/action-required` state badge）、
独立的 setup detail screen 与 per-provider `setupSteps[]`、anchored
tutorial spotlight，以及以 "Connect a service" 起步的默认 tutorial 序列。
状态：PR #26 in progress（分支 `issue-25-dac43a780b5c`）。详细表参见
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U。

## V. 跨求职平台的简历同步 (issue #29)

R-V1..R-V22 覆盖 links notation 中的规范简历模型、跨平台 diff 与
reconcile、七个平台（LinkedIn、hh.ru、Habr Career、Naukri、
VietnamWorks、TopCV、SuperJob）的声明式浏览器计划、带
verified/documented/draft 步骤统计的 registry 校验、带脱敏和
HTML/截图产物的 telemetry、基于 browser-commander 的 plan runner、
facade / HTTP routes / CLI 命令 / SPA 页面、web bundle 纯净性、用
`--paths` 和 `--groups` 做的选择性写入、在 fixture markup 上用真实浏览器
跑完每个计划，以及后端没有 `/api/cv/*` 时的可见降级。状态：已在 PR #30
完成。详细表参见 [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section V；
工作原理见 [`docs/CV-SYNC.zh.md`](./CV-SYNC.zh.md)。

## W. Kate Mobile 被封后的 VK 令牌来源 (issue #32)

R-W1..R-W5 覆盖：用 VK 当前的 OAuth 网关检查 vkhost.github.io 列出的全部
客户端；`VK_TOKEN_SOURCES` 目录及其排序（VK 自家客户端排在小型第三方发布者
之前）；只用文档化方法检查已有令牌的 `inspectVkToken()`；四种语言中修正后的
VK 提示；以及连接器迁移到 `api.vk.ru` 域名。状态：PR #33。详细表参见
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section W；研究见
[`docs/case-studies/issue-32/`](./case-studies/issue-32/README.md)。

## X. 自动化、受众与聊天 (issue #31, PR #34)

以下需求来自
[issue #31](https://github.com/link-foundation/meta-sovereign/issues/31)——
“支持给所有很久没聊过的个人联系人发消息”——以及
[PR #34 的 review](https://github.com/link-foundation/meta-sovereign/pull/34)，
后者要求用一个通用、可配置的自动化取代专门的重新联系页面。研究、计划和截图
保存在 [`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md)。

| ID    | 需求                                                                             | 状态                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-X1  | 找出至少 N 天（默认 90 天）双方都没有任何消息的每个个人（1:1）联系人。           | 已完成：`js/src/crm/reengage.js` 中的 `findDormantContacts` 按聊天分组消息，只保留个人聊天（adapter 的 `chatType`、VK peer 范围，或恰好只有一个其他参与者），跳过群组、频道和机器人，并默认跳过 owner 从未发过消息的聊天。自动化的 `silentDays` 条件使用它。测试：`js/tests/reengage.test.js`、`js/tests/automations.test.js`。                                                                                    |
| R-X2  | issue 中的两段文字是默认文本，且都可以替换。                                     | 已完成：它们是 `reengage-dormant` 预设的模板（`defaultReengageTemplates`）；每个自动化都有自己可编辑的非正式和正式文本，支持 `{name}`、`{days}` 和 `{network}`。                                                                                                                                                                                                                                                   |
| R-X3  | 用 regex 规则判断对话中 "ты" 还是 "вы" 用得更多。                                | 已完成：`js/src/crm/address-form.js`——支持 Unicode 的整词标记（代词、物主代词、动词形式、祈使式、问候语），覆盖俄语，以及 您/你 和 आप/तुम；owner 自己的消息权重为 2×；得分更高者胜出。测试：`js/tests/address-form.test.js`。                                                                                                                                                                                      |
| R-X4  | 判断规则可扩展。                                                                 | 已完成：`rules` 选项；模式页面中标记为 `address:informal` / `address:formal` 的 `pattern:*` links 会成为额外规则（`addressRulesFromPatterns`）。                                                                                                                                                                                                                                                                   |
| R-X5  | 判断出的称呼形式可解释，并有安全的默认值。                                       | 已完成：每份草稿都带有称呼形式和原因（`majority`/`tie`/`no-evidence`）；没有证据或证据相等时使用礼貌的 "вы" 文本。草稿卡片、预览和 `automations review` 会显示称呼形式，并允许用户切换。                                                                                                                                                                                                                           |
| R-X6  | 默认是安全（debug）模式：一次一条预填消息，用户确认后才发送。                    | 已完成：`safe` 模式（默认）下的自动化只排队 `automation-draft:*` links；每份草稿都从所在聊天的草稿卡片或 `automations review` 中逐条发送，服务器会拒绝没有 `confirm: true` 的草稿发送。测试：`js/tests/automation.test.js`、`js/tests/automations-server.test.js`。                                                                                                                                                |
| R-X7  | 主动联系是一个可配置的自动化，而不是专门的页面或聊天。                           | 已完成：`js/src/automation/automations.js`——触发器 → 受众 → 条件 → 动作，参照 konard/vk-bot 的触发器设计；issue #31 是 `reengage-dormant` 预设，与求职、找合同工作和回应问候并列。自动化标签页可以编辑、预览和运行它们（`js/src/web/automations-view.js`）。测试：`js/tests/automations.test.js`、`js/tests/automations-view.test.js`。                                                                            |
| R-X8  | 自动化可以手动运行、按计划运行、在收到消息时运行，或从聊天菜单运行。             | 已完成：触发器类型 `manual`、`schedule`（`every: "1d"`）、`incoming`（一个 regex）和 `chat-menu`；调度器随服务器启动（`createAutomationScheduler`）；每个聊天的标题栏都有自动化菜单，包含“在此聊天中测试”（忽略条件）和“按条件运行”。                                                                                                                                                                              |
| R-X9  | 在终端和 HTTP 上使用同样的自动化。                                               | 已完成：`meta-sovereign automations`，带 `list`、`plan <id>`、`run <id>`、`review`、`drafts`、`history`、`save` 和 `delete`（`js/src/cli/automation-commands.js`）；`/api/automations`、`/api/automations/{plan,run,drafts,history}` 和 `/api/automations/drafts/{send,form,mark,skip}`（`js/src/server/routes-automations.js`）。测试：`js/tests/automation-cli.test.js`、`js/tests/automations-server.test.js`。 |
| R-X10 | 不会意外地给同一个人发两次消息。                                                 | 已完成：每次运行都写入一条 `automation-run:<automation>:<source>:<chat>` 记录（`sent`、`skipped` 或 `failed`），每份排队的草稿都是一个 `automation-draft:*` link；`cooldownDays` 条件和待处理的草稿会排除这些聊天，预览会说明每个人被排除的原因。                                                                                                                                                                  |
| R-X11 | 没有 adapter 能发送时，可以手动发送消息。                                        | 已完成：`prefillLinkFor` 生成填好正文的 `mailto:`（RFC 6068）、`tg://user?id=` 和 `https://vk.com/im?sel=`；草稿卡片的“打开聊天”使用它，“我自己发了”记录这次发送。                                                                                                                                                                                                                                                 |
| R-X12 | 自动化可以作用于可搜索、可交叉引用的联系人。                                     | 已完成：`js/src/crm/people.js` 把消息以及 `person:`、`member:` 和 `list:` links 合并为每个网络账号一条记录，并带 `sameAs` 交叉引用；`/api/people` 搜索这些记录；自动化标签页可以选择联系人、对他们运行自动化，或把他们保存为列表。测试：`js/tests/people.test.js`。                                                                                                                                                |
| R-X13 | 受众可以用并集、交集和差集组合好友、聊天、社区和列表。                           | 已完成：`js/src/crm/people.js` 中的 `resolveAudience` 和 `parseAudienceSpec`——例如 `friends:vk & chat:vk:2000000001 - list:blocked` 这样的规格，保存为 `audience:*` links，解析时给出人数；VK 好友、聊天和社区成员（以及 Bot API 公开的 Telegram 聊天成员）作为 `member:` links 同步。测试：`js/tests/people.test.js`。                                                                                            |
| R-X14 | 基于消息到消息的回复链接做自动补全，按频率排序，然后从我们自己的消息中逐词补全。 | 已完成：`js/src/replies/reply-graph.js` 从归档和实时消息中学习 提示 → 回复 的边；`/api/suggest` 按使用次数返回对聊天中最后一条收到消息的去重完整回复，然后返回来自 owner 消息的逐词续写；输入框把它们显示为 chips（Tab 选取第一个）。测试：`js/tests/reply-graph.test.js`、`js/tests/reply-service.test.js`。                                                                                                      |
| R-X15 | 用 link-cli 快速查找回复。                                                       | 已完成：`js/src/replies/reply-store-clink.js` 把回复图镜像到 `clink --serve`（`MS_REPLY_CLINK=1`），且从不阻塞按键；查找开销由 `experiments/clink-*.mjs` 测量。测试：`js/tests/reply-store-clink.test.js`。                                                                                                                                                                                                        |
| R-X16 | 存储、导入和导出使用关联栈：Links Notation 文本和 link-cli 二进制 doublets。     | 已完成：`js/src/storage/doublets-archive.js` 写出 link-cli store 的归档布局，因此同一个文件可以导入 `clink`；`js/src/storage/lino-store.js` 每行写一条 Links Notation 记录。测试：`js/tests/doublets-archive.test.js`。                                                                                                                                                                                            |
| R-X17 | 每个 messenger 中都有输入状态，适用于人和自动化。                                | 已完成：VK `messages.setActivity` 和 long-poll 输入事件、Telegram `sendChatAction`、WhatsApp 输入指示以及各 web UI；`typing:*` links 会过期；聊天标题栏显示谁正在输入，包括替用户输入的自动化，用户输入时也会发送我们的输入状态。测试：`js/tests/live-links.test.js`、`js/tests/chat-view.test.js`。                                                                                                               |
| R-X18 | API 无法发送时，用 browser-commander 通过官方 web UI 发送。                      | 已完成：`js/src/sources/browser-sender.js`——先用 API，然后用 browser-commander 以真实按键事件驱动 vk.com、web.telegram.org 或 web.whatsapp.com；未登录的 UI 报告为 `login-required`。测试：`js/tests/browser-sender.test.js`。                                                                                                                                                                                     |
| R-X19 | 聊天默认看起来像 t3.codes，可选类似 Telegram 的样式，使用 React。                | 已完成：`js/src/web/chat-view.js`——按日期分组的可搜索侧栏、居中的消息栏、悬浮输入框；设置 → 外观可在 `js/src/web/appearance.js` 和 `app.css` 中切换皮肤（t3、Telegram、WhatsApp、Signal）。测试：`js/tests/chat-view.test.js`、`js/tests/appearance.test.js`。                                                                                                                                                     |
| R-X20 | 主题：跟随系统、浅色、深色和自动。                                               | 已完成：`resolveTheme` 跟随操作系统（`prefers-color-scheme`）、固定选择或当前时间（07:00–19:00 为浅色）；标题栏按钮仍可切换浅色/深色。测试：`js/tests/appearance.test.js`。                                                                                                                                                                                                                                        |
| R-X21 | 每个依赖都使用最新版本。                                                         | 已在 commit `chore(deps)` 中完成：更新了 npm 包和 GitHub Actions；修复了 ESLint 10 和 jscpd 5 的问题。                                                                                                                                                                                                                                                                                                             |

## Y. Telegram 凭据查找器与共享 UI 约定

以下需求来自在构建"在这台电脑上查找 Telegram 会话"查找器（Telegram → 手动
输入）时维护者的指示。它们写成持久性约定，以便后续工作在所有适用之处都应用
它们，而不是每个页面重新发现。每条都在应用的所有适用界面上**统一**应用。

| ID    | 需求                                                                                                                                                                                                                                                                                                      | 状态                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-Y1  | 查找器只列出已证实有效的凭据：Telegram 主动拒绝的 token 或会话会被丢弃；无法检查的（网络/超时）会保留并标记为未验证。                                                                                                                                                                                     | 已完成：`js/src/sources/auto-import/telegram-creds.js` 中的 `verifyRecord`/`isDeadError`；`scan` 过滤 `active !== false`。                                                                                                                                                                                                                                                                 |
| R-Y2  | 凭据按账户去重，并按类型折叠为每种一个可连接条目（会话登录、bot token、手机号和密码登录）——绝不每个文件一行。                                                                                                                                                                                             | 已完成：`dedupeRecords` + `groupRecords`/`mergeRecords`；在 `js/tests/telegram-creds.test.js` 中测试。                                                                                                                                                                                                                                                                                     |
| R-Y3  | 用户账户排在机器人账户之前。                                                                                                                                                                                                                                                                              | 已完成：`groupRecords` 按账户类型稳定排序（user 0，bot 1）；测试 "user accounts are listed before bot accounts"。                                                                                                                                                                                                                                                                          |
| R-Y4  | 保留凭据被发现的每个位置；最短路径优先显示，其余位置在 "+N more" / "Show less" 切换后展开。                                                                                                                                                                                                               | 已完成：查找器 `byLength` 对 `wheres` 排序；`js/src/web/connections/telegram-sessions.js` 中的 `WhereLine` 是可展开列表。                                                                                                                                                                                                                                                                  |
| R-Y5  | 脱敏提示最多显示 token/会话的前三个和后三个字符（较短的值回退为仅尾部掩码）；原始密钥值绝不离开本机或进入日志。                                                                                                                                                                                           | 已完成：`maskEnds`/`maskHint`；全程使用 BigInt 安全的 JSON；值绝不返回浏览器或写入日志。                                                                                                                                                                                                                                                                                                   |
| R-Y6  | 连接凭据始终给出明确的可见反馈（"Connected" 标记）——成功的点击绝不无声。                                                                                                                                                                                                                                  | 已完成：`useFinder` 中的 `connected` 状态；条目用带勾的 "Connected" 徽章替换其按钮。                                                                                                                                                                                                                                                                                                       |
| R-Y7  | 验证状态（"confirmed with Telegram"）渲染为一个小的勾选图标，文字在其 tooltip 中，通过共享的 `VerifiedMark`，在任何显示已确认凭据之处统一使用。该 tooltip 是带样式、可靠的 CSS tooltip（`data-tooltip`，在悬停和键盘聚焦时显示），而非原生 `title`（缓慢且容易错过）；`aria-label` 为屏幕阅读器保留文字。 | 已完成：`VerifiedMark` + `js/src/web/icons.js` 中的 `check` 图标；`app.css` 中的 `[data-tooltip]` + `.verified-mark`。                                                                                                                                                                                                                                                                     |
| R-Y8  | 持久性框架（顶部菜单栏）始终位于临时浮层之上：教程聚光灯的边框及其遮罩在页眉底部裁剪，绝不浮在顶部菜单之上。                                                                                                                                                                                              | 已完成：`.topbar.glass` 位于 `z-index: 2001`，高于 `z-index: 2000` 的教程浮层；没有教程步骤指向页眉控件。                                                                                                                                                                                                                                                                                  |
| R-Y9  | 应用文件夹中默认开启详细服务器日志，记录每个请求和每个带堆栈的错误，使任何失败的根因已在磁盘上。                                                                                                                                                                                                          | 已完成：`createServerLog`/`installCrashLogging` 写入 `<store>/logs/meta-sovereign.log`；`--quiet-logs` 可关闭。                                                                                                                                                                                                                                                                            |
| R-Y10 | 生成的产物（如 `CHANGELOG.md`）从复制粘贴重复检测门中排除，使发布自动化不会触发它；该门只度量人工编写的源码。                                                                                                                                                                                             | 已完成：`**/CHANGELOG.md` 在 `.jscpd.json` 的 `ignore` 中。                                                                                                                                                                                                                                                                                                                                |
| R-Y11 | 教程会对真实进度作出反应：完成一次连接（已保存的会话、手机登录、机器人令牌或 API 密钥）会越过"连接服务"这一步，无论用户以何种方式连接——教程绝不会停留在用户已完成的步骤上。                                                                                                                               | 已完成：连接路径派发 `meta-sovereign:connected`（`announceConnected`）；`setup` 步骤的 `completeOnConnect` 对其作出反应（`useCompleteOnConnect`）；`TUTORIAL_VERSION` 升至 4。                                                                                                                                                                                                             |
| R-Y12 | 连接 Telegram 会让它真正可用，而不只是保存密钥：已连接账号的聊天、最近消息和通讯录联系人无需额外步骤即出现在聊天和联系人中，聊天页面绝不会要求重新连接已连接的服务。                                                                                                                                      | 已完成：`js/src/sources/telegram-account.js`（`createTelegramAccount`）通过 MTProto 将用户会话（对话、消息、联系人）同步为 `msg:telegram:*` / `person:telegram:*` 链接；同步在 `use` 之后、手机登录之后、服务器启动时运行，用户会话每 30 秒运行一次（只重新读取有变化的对话）；`GET /api/telegram/status`、`POST /api/telegram/sync`；空的聊天页显示账号和同步状态（`ChatAccountEmpty`）。 |
| R-Y13 | 在聊天中写给 Telegram 聊天的消息通过已连接的账号发送（用户会话以用户身份，机器人令牌以机器人身份），并以网络的消息 id 只存储一次。                                                                                                                                                                        | 已完成：服务器的 `telegram` 适配器通过账号发送（`accountSources`）；`handleSend` 存储账号的规范链接；机器人令牌绝不在后台轮询（`getUpdates` 会抢走它的更新）。                                                                                                                                                                                                                             |
| R-Y14 | 联系人列出用户可以交谈的人，包括尚未写过信的通讯录联系人，提供搜索和打开与该人聊天的"发消息"操作；教程先展示联系人，再展示如何从那里打开聊天。                                                                                                                                                            | 已完成：`aggregateContacts(links, { people: true })` 合并带 `open` 的 `person:` 链接；`ContactsView` 增加搜索和"发消息"（`#chat=<source>:<chat>`，以联系人命名的空聊天，打开时通过 `POST /api/telegram/history` 加载历史）；教程步骤 `contacts` → `contacts-open` → `chat`，`TUTORIAL_VERSION` 5。                                                                                         |
| R-Y15 | 消息只发送一次：点击发送会立即清空输入框，因此再次按 Enter 或点击不会再发送；同一消息的重复请求绝不会发布两次；同一聊天的消息按发送顺序发出；每个聊天保留自己的未发送草稿；用于确认输入法词语的 Enter 不算发送。                                                                                          | 已完成：编辑器为每条消息分配 `clientId` 并按聊天排队（`js/src/web/chat-live.js`）；`/api/send` 对同一 `clientId` 最多发送一次，并把结果共享给重复请求（`sendOnce`）；Telegram 收到由其派生的 `random_id`（`RANDOM_ID_DUPLICATE` = 已发送）、纯文本、按 4096 字符拆分（`js/src/sources/telegram-send.js`）；账号错误绝不回退到浏览器发送（`fallback: false`）。                             |
| R-Y16 | 用户的每条消息像即时通讯软件一样显示投递状态：发送中显示时钟，已发送 ✓，对方已读 ✓✓，失败的消息说明原因（频率限制的等待时间、无权发言、未知聊天），并提供重试和删除。                                                                                                                                     | 已完成：`chat-model.js` 中的 `deliveryStatus` / `chatMessages(links, key, { pending })`；已读回执是来自对话列表和 `UpdateReadHistoryOutbox` 的 `read:telegram:<chat>` 链接（`outboxMaxId`）；Telegram 错误在 `sendError` 中映射为代码；`chat-view.js` 中的 `Delivery` / `FailedActions`。                                                                                                  |
| R-Y17 | 已连接 Telegram 账号的新消息、编辑、删除、已读回执和输入状态会即时出现在打开的聊天中，无需刷新；视图停留在用户正在阅读的位置，并显示"新消息 ↓"而不是跳动。                                                                                                                                                | 已完成：每个已连接客户端上的 GramJS 原始更新处理器（`telegram-updates.js` → `telegram-account-live.js`）写入与同步相同的链接；`GET /api/events`（Server-Sent Events，仅聊天链接，绝不含 `secret:`）将其推送给 SPA，SPA 分批应用（`useLiveLinks`），并在每次（重新）连接时重新加载一次；30 秒轮询保留用于补漏。                                                                             |
| R-Y18 | 断线期间（休眠、切换网络、服务器重启）错过的更新仍会到达：消息、编辑、删除和已读回执无需手动同步即可出现。                                                                                                                                                                                                | 已完成：`telegram-catchup.js` 为每个账号在存储中保存 Telegram 的更新序号（`pts`），在重新连接、缺口 0.7 秒内未补上（TDLib 的规则）、收到 `updatesTooLong` 以及启动时调用 `updates.getDifference`，并把每一段交给实时处理器重放；频道缺口和过长的差异会重新读取对话（见 `docs/CHAT-REFERENCES.zh.md`）。                                                                                    |
| R-Y19 | 阅读 Telegram 聊天会在 Telegram 上将其标为已读，与官方应用一致：只算屏幕上的消息、只在窗口处于前台时、从不倒退；每个聊天显示未读数，并在"未读消息"分隔线处打开。可在 设置 → 隐私 中关闭（默认开启）。                                                                                                     | 已完成：`useReadMarker`（IntersectionObserver，500 毫秒防抖）→ `POST /api/telegram/read` → `messages.readHistory` / `channels.readHistory`；未读数取对话的 `unread_count` 加上更新的消息，任何设备上的 `updateReadHistoryInbox` 都会将其清零；设置项为 `metaSovereignReadReceipts`。                                                                                                       |
| R-Y20 | 未发送的文字在刷新后仍保留，Telegram 聊天的草稿与手机上一致：输入时保存到 Telegram，在其他设备上写的草稿会被带过来，发送后清除。                                                                                                                                                                          | 已完成：草稿存于 `localStorage`；`POST /api/telegram/draft`（`messages.saveDraft`，停止输入 2.5 秒后以及离开时立即保存），`updateDraftMessage` 写入聊天的已读链接，只在输入框为空或内容仍是之前从云端取来的文字时才应用；发送时带 `clear_draft`。                                                                                                                                          |
| R-Y21 | 尚未发出的消息在刷新或关闭标签页后仍保留，并在之后发出——仍然只发一次。                                                                                                                                                                                                                                    | 已完成：输入框的发件队列存于 `localStorage`，以相同的 `clientId` 恢复（服务器的按消息记忆和 Telegram 的 `random_id` 会丢弃重复）；已用发送途中刷新的端到端测试验证。                                                                                                                                                                                                                       |
| R-Y22 | 因临时原因未发出的消息会自动重发：网络错误时 1 秒后重试，逐次加倍至 60 秒，恢复联网时立即重试；遇到 Telegram 的频率限制时，按要求的时间准确等待（显示倒计时和"立即重试"）；永久性失败会让该聊天后面排队的消息一并停止，多条失败的消息可以一次全部重发或删除。                                             | 已完成：`chat-outbox.js`（`afterFailure`、`nextToSend`、`cascade`），发送途中服务器不再响应时给出 `network` 失败而不是"已保存"，以及带"全部重发 / 全部删除"的"未发送的消息"栏。                                                                                                                                                                                                            |
| R-Y23 | 聊天会提示未连接的情况（没有网络、正在重新连接本地服务器、Telegram 正在重新连接），并且消息一发出或输入框被清空，对方看到的"正在输入…"就会立即停止。                                                                                                                                                      | 已完成：`useConnectionBanner`（事件流关闭超过 3 秒，Telegram 状态中的 GramJS 连接状态），通过 `POST /api/typing {cancel: true}` 发送 `SendMessageCancelAction`。                                                                                                                                                                                                                           |

## Traceability

后续 PR 或 commit 完成功能时，请在 changeset 和 PR 描述中引用对应 `R-*`
ID，使本文件保持 live spec，而不是一次性快照。
