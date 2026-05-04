# 参与贡献 meta-sovereign (languages: [en](CONTRIBUTING.md) • zh • [hi](CONTRIBUTING.hi.md) • [ru](CONTRIBUTING.ru.md))

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
bun test
npm test
deno test --allow-read
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

## 问题

如果对贡献流程有疑问，请打开 issue 讨论。
