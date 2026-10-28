# 参与贡献 meta-sovereign (languages: [en](CONTRIBUTING.md) • zh • [hi](CONTRIBUTING.hi.md) • [ru](CONTRIBUTING.ru.md))

本地只运行与修改相关的指定测试。完整测试、压力测试和运行时/浏览器矩阵由推送后的 GitHub CI/CD 执行。不要在正在使用的电脑上运行完整的 `npm test` 或未筛选的 `bun test`。

## 开发流程

1. Fork 仓库并 clone 到本地。
2. 创建 feature branch：`git checkout -b feature/my-feature`。
3. 安装依赖：`bun install` 或 `npm install`。
4. 修改代码。
5. 运行本地检查：`bun run check`。
6. 创建 changeset：`bun run changeset`。
7. Commit 并 push；pre-commit hooks 会自动运行。
8. 创建 Pull Request。

## 代码标准

### 文件大小限制

每个文件最多 **1500 行**。ESLint `max-lines` 规则和 CI
`check-file-line-limits` job 会执行这个约束。这样 AI 和人类开发者都能在一
个上下文中阅读文件，并保持模块清晰。

### 格式化与 lint

所有代码必须通过：

```bash
bun run format:check
bun run lint
bun run check
```

也可以手动修复：

```bash
bun run format
bun run lint:fix
```

### 测试要求

测试应覆盖关键路径，能在 Node.js、Bun、Deno 中运行，并使用
[`test-anywhere`](https://github.com/link-foundation/test-anywhere) 风格保持跨
运行时兼容。

```bash
# Local: specific test files only
node --test --test-concurrency=1 js/tests/rolling-host.test.js
# Full suite: GitHub CI/CD after push
```

## Changesets 版本管理

本项目使用 [Changesets](https://github.com/changesets/changesets) 管理版
本和 changelog，避免多个 PR 同时修改 `package.json` 造成冲突。

影响用户的变更需要 changeset：

```bash
bun run changeset
npm run changeset
```

| Type      | 何时使用             | 示例             |
| --------- | -------------------- | ---------------- |
| **Patch** | Bug fix 或内部变更   | typo、依赖、重构 |
| **Minor** | 新功能或非破坏性新增 | 新函数、可选参数 |
| **Major** | 破坏性变更           | 移除函数、改 API |

只改 `./docs` 或普通 Markdown 通常不需要 changeset，除非文档变更伴随影响
用户的代码行为。

## Pull Request

PR 标题应清晰描述变更，例如：

```text
feat: Add support for custom configuration
fix: Resolve race condition in async handler
docs: Update API documentation for v2
```

PR 描述应包含 What、Why、Testing。所有 PR 必须通过语法检查、格式化、
ESLint、secret scan、文件行数检查、changeset 校验、文档校验，以及跨平台/
跨运行时测试矩阵。

CI 会自动把最新 `main` merge 到 PR branch 并在 merged state 上运行检查。如
果出现冲突：

```bash
git fetch origin main
git merge origin/main
# resolve conflicts
git push
```

<a id="working-rules"></a>

## 工作规则

这些规则适用于每一次更改，无论由人还是 AI 代理完成；每个代理都从这一节开始（仓库中不保留专门给代理的文件）。每条规则都来自维护者的指示；它们所保护的产品需求见 [REQUIREMENTS.zh.md](REQUIREMENTS.zh.md)。

1. **每次更改都提交并推送。** 检查通过后提交并推送到 `main`；若 `main` 期间有更新，先 rebase。在 changeset 中写明更改对应的需求 ID。
2. **每条需求都被跟踪。** 新指示以四种语言在 [REQUIREMENTS.zh.md](REQUIREMENTS.zh.md) 中成为带 ID 和状态的一行；尚未完成的部分在状态中写明，而不是省略。
3. **文档使用四种语言。** 每个 `docs/*.md` 页面都有英文、俄文、印地文和中文版本，并带语言标题；`docs/case-studies/` 中的案例研究仅用英文。
4. **机密绝不离开本机。** 会话字符串、令牌、密码和密钥绝不打印、记录、提交或发送到任何地方；掩码提示最多显示前三个和后三个字符（R-Y5）。
5. **测试和检查只用假对象。** 测试和验证绝不连接真实网络、读取真实浏览器配置或凭据存储、扫描用户的机器或从真实账户发送；它们注入假对象（`clientFactory`、`telegramMtproto`、内存存储、临时文件夹），且不触碰真实的应用文件夹。
6. **通过计数而非内容查看运行中的应用。** 通过状态（`/api/telegram/status`）和日志行数检查运行中的服务器；调试时绝不打印用户的消息、联系人或凭据。
7. **每个网络只问一次。** 先读存储，只向网络请求缺少的内容，并通过账户的优先级队列（R-Y24、R-Y25）；保留网络提供的全部信息（R-Y28）。
8. **第三方代码是参考，而非依赖。** 我们借鉴的开源客户端列在 [CHAT-REFERENCES.zh.md](CHAT-REFERENCES.zh.md) 中；下载的副本只读——绝不构建、安装或运行。
9. **质量关卡保持开启。** 本地检查修改的文件并运行指定测试。推送后在 GitHub CI/CD 查看完整检查和测试；不要在用户电脑上运行完整测试。拆分超过复杂度或长度限制的函数。修改 Web 应用后重新构建 `js/src/web/app.min.js`（`npm run build:web`）。
10. **为其用户服务的本地应用。** meta-sovereign 是开源的，运行在用户自己的机器上、使用用户自己的账户、为用户的便利：它只在用户要求时、按用户要求的方式行动，并遵守每个网络允许的节奏。
11. **浏览器通过 browser-commander 启动，不显示自动化提示条。** 应用打开的浏览器，以及检查改动时用来查看网页应用的浏览器，都由 [browser-commander](https://github.com/link-foundation/browser-commander) 以默认方式启动（像人一样启动已安装的 Chrome）：绝不使用会让 Chrome 显示"受自动测试软件控制"或"不受支持的命令行标记"提示条的开关（`--enable-automation`、`--disable-blink-features=AutomationControlled`）。browser-commander 本身出现这种提示条时，向其仓库报告。
12. **数据形状的变化必须附带迁移。** 若某项改动改变了任何数据的存储方式（字段、id、日期格式），请在 `js/src/storage/migrations/` 中添加带编号的迁移模块并提高 `CURRENT_SCHEMA`（R-Z17）：幂等、不联网，并附带旧形状存储的夹具测试、幂等测试、dry-run 计数以及 [DATA-MIGRATIONS.zh.md](DATA-MIGRATIONS.zh.md) 中的一行。缺少时注册表守卫测试会失败。

## 问题

如果对贡献流程有疑问，请打开 issue 讨论。

CI 诊断、发布前提及恢复：参见 [CI 操作](CI-OPERATIONS.zh.md)（R-Z32）。
