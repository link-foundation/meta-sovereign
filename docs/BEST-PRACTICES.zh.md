# AI 驱动开发最佳实践 (languages: [en](BEST-PRACTICES.md) • zh • [hi](BEST-PRACTICES.hi.md) • [ru](BEST-PRACTICES.ru.md))

本文说明能显著提升 AI-driven development 工作流质量和可靠性的 CI/CD 实践。
配置正确时，AI solver 必须根据 CI/CD 反馈持续迭代，直到所有检查通过。

## 为什么 CI/CD 对 AI 开发重要

AI-driven development 形成一个反馈闭环：

1. AI 根据 issue requirements 生成方案。
2. CI/CD 自动验证代码质量。
3. AI 修复失败项，直到所有 gates 通过。
4. 没有通过 gates 的代码不能合并。

这种方式让人类、AI 或混合团队都能保持一致质量。

## 本模板采用的实践

### 1. 文件大小限制

代码文件最多 1500 行。这样 AI 能在上下文窗口中读完整文件，人类也能更容易
导航，并迫使架构保持模块化。

### 2. 自动格式化

ESLint 负责质量和风格规则，Prettier 负责格式化，Husky 负责 pre-commit
hooks。统一格式减少无意义 diff。

### 3. 静态分析与 lint

严格 ESLint、未使用变量检查和 async/await 规则会在 review 前捕获问题。

### 4. 全面测试

测试覆盖 Node.js、Bun、Deno，Ubuntu、macOS、Windows，并使用
[`test-anywhere`](https://github.com/link-foundation/test-anywhere) 保持跨运行
时兼容。

### 5. Changeset 版本管理

每个 PR 创建独立 changeset，减少 merge conflict，自动决定最高版本 bump，并
生成 changelog。

### 6. Pre-commit hooks

本地提交前执行 format、lint 和文件大小校验，避免明显破坏进入 CI。

### 7. Release automation

发布流程自动 bump version、生成 changelog、用 OIDC trusted publishing 发布
包，并保证只有通过验证的 build 能发布。

### 8. CI/CD pipeline 功能

Workflow 使用 hive-mind 的实践：concurrency control、PR 分支排队、main 分支
取消旧 run、fresh merge simulation，以及 fast-fail job ordering。

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref == 'refs/heads/main' }}
```

### 9. 快速失败排序

syntax、format、lint、file-line-limit 先跑；慢的 3 runtime × 3 OS matrix 只在
快速检查通过后运行。这让 AI solver 和 reviewer 都更快收到有用反馈。

### 10. CI 文件行数限制

除了 ESLint 的 source-file 限制，`scripts/check-file-line-limits.sh` 还检查
`.mjs` scripts 和 `.github/workflows/release.yml`，防止 workflow 膨胀。

### 11. Secret detection

`secretlint` 在 lint job 中扫描 token、password 和 private key，避免凭据进入
review 或 release。

### 12. 文档验证

Docs change 时，CI 检查文档行数和必需文件：`README.md`、`CHANGELOG.md`、
`docs/CONTRIBUTING.md`、`docs/BEST-PRACTICES.md` 等。

### 13. 合理 timeout

每个 CI job 都有 `timeout-minutes`，并且 test runner 设置 30 秒 per-test
budget。Hung promise 或 flaky network call 会在几分钟内失败，而不是等 GitHub
Actions 默认的 6 小时。

### 14. 正确传播 cancellation

Job condition 使用 `!cancelled()`，避免 `always()` 在 workflow 已取消时仍启动
下游 job。

## 质量策略

本模板采用多层防线：developer machine 的 pre-commit 和 local tests、CI 的
fast/slow checks、documentation validation、changeset verify，最后 release 只
在全部 checks 通过后执行。

## 参考

- [Code Architecture Principles](https://github.com/link-foundation/code-architecture-principles)
- [hive-mind CI/CD Best Practices](https://github.com/link-assistant/hive-mind/blob/main/docs/CI-CD-BEST-PRACTICES.md)
- [hive-mind CI/CD Case Studies](https://github.com/link-assistant/hive-mind/tree/main/docs/case-studies)
