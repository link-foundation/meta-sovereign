# 路线图 (languages: [en](ROADMAP.md) • zh • [hi](ROADMAP.hi.md) • [ru](ROADMAP.ru.md))

## 当前没有开放的已跟踪路线图项

issue #1 的路线图目前为空。原始 issue 和 PR #2 maintainer follow-up 中
提取的每个需求都记录在 [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) 中，
并且每一行都带有实现证据并标记为 Done。

此文件继续保留为 PR #2 要求的 reviewer-facing roadmap ledger。如果评审中
发现新的缺口，请先用匹配的需求 ID 记录到这里，再把相关需求标记为 Done。

哪些 Telegram 客户端功能已支持、部分支持、搁置或不支持，记录在
[`docs/FEATURES.zh.md`](./FEATURES.zh.md)。

## 审计后续工作（R-Z）

对已完成工作的审计发现了一些缺口，分为两个阶段。第 1 阶段**进行中**，尚未完成。第 2 阶段**已计划，尚未开始**。这里的任何内容都不是承诺或日期。

### 第 1 阶段 — 进行中

- R-Z1：加固本地 server。
- R-Z2（已完成）：让存储、备份、已保存的 secrets 和日志更安全。
- R-Z3：让自动发送更安全。
- R-Z4（已完成）：让发送和同步的结果真实可信（不会误发 LinkedIn 公开帖子，不会假报 CV 同步成功，X 私信，明确的回退方式）。
- R-Z5：修复 email。
- R-Z6：让 CI 变绿（Deno、Bun、Windows、`cargo test`、CI 中的浏览器 e2e）。

### 第 2 阶段 — 已计划，暂不进行

- R-Z7：接上已有但从不运行的代码：自动备份计划、已删除消息的 tombstones（查看、恢复、清除）、受众成员同步、Upwork 和 PeoplePerHour 的 24 小时缓存清理、教程的 Skip 按钮，以及已保存但未使用的 refresh token。
- R-Z8：拉取 GitHub、Upwork 和 PeoplePerHour 的收件箱（email 在 R-Z5），并完善 VK 实时更新、历史分页、媒体和 reactions。
- R-Z9：个人 WhatsApp：为 WhatsApp Web 提供可见的登录窗口（二维码）、稳定的聊天 id、更好的归档解析器、服务条款提示。
- R-Z10：Facebook、Instagram、X 和 LinkedIn 的归档导入：修复 id 冲突、乱码、缺失附件、reactions 和参与者。
- R-Z11：GitHub：编辑、删除和回应消息、review comments、通知、增量拉取、discussions、列出仓库。
- R-Z12：页面一致性：16 个对话框的 Escape 和焦点处理、显示目前被吞掉的错误、修复凭据浏览器测试。
- R-Z13（已完成）：文档：四种语言的按系统功能矩阵、ru、hi 和 zh 需求文档中缺失的 R、S、T 部分、重复的 R-N id、README 中的 npm 说法、本路线图、`MS_SECRET_PASSPHRASE`，以及如实说明 Rust server 的限制。

### 暂不进行

- 把包发布到 npm（需要所有者）。
- 用真实账号检查网页选择器（需要真实账号）。
- WebAuthn 和 TOTP 解锁。
- Rust server 与 JS server 对齐：仅作文档说明，见 [`docs/SERVER-PARITY.zh.md`](./SERVER-PARITY.zh.md)。

## 已关闭范围

关闭范围的实现历史保存在
[`docs/case-studies/issue-1/solution-plan.md`](./case-studies/issue-1/solution-plan.md)。
最终 PR #2 状态覆盖：本地优先双存储、`.lino` 导入导出、加密备份、连接器、
React SPA、浏览器存储、服务器自动发现、WebSocket/WebRTC 同步、Electron、
移动打包、Docker 部署、纯 Rust 服务器 parity，以及单元/集成/Rust/browser
e2e 测试。
