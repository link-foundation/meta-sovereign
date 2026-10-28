# CI 与发布诊断（语言：[en](CI-OPERATIONS.md) • zh • [hi](CI-OPERATIONS.hi.md) • [ru](CI-OPERATIONS.ru.md)）

R-Z32 要求验证实际发布的源码，并保留失败诊断。[issue 43 调查](case-studies/issue-43/README.md)提供原始日志和模板比较。

## 本地检查与 CI

使用 `npm ci` 安装依赖。本地仅对修改文件执行 lint，并以 `--test-concurrency=1` 运行相关测试。完整的 Node/Bun/Deno 与操作系统矩阵、Chromium、macOS 原生 WebKit、Rust 和桌面打包均由 GitHub CI 执行。测试使用临时存储和独立服务器，与用户正在运行的应用分离。

两个浏览器执行 `js/scripts/browser-checks.json` 中相同的代表性测试，包括恢复测试。缺少所需浏览器、测试失败或超时均导致任务失败。测试进程开始后才上传浏览器产物；更早的合并或安装错误保留为主要原因。

20 万条记录的备份回归仅在独立 CI 任务中运行，设置 `RUN_BACKUP_STRESS=1`，V8 堆上限为 384 MiB。普通单元测试跳过它。不要在用户机器上运行压力测试。

## 诊断失败

先将运行时间和 head SHA 与分支最新提交核对。使用 `gh run view RUN_ID --log > run.log` 保存日志，阅读实际失败的步骤，区分断言失败、API 拒绝、报告缺失和过时运行被取消。`experiments/issue43-runs.py` 保存本次调查的运行与注释。

包检查将空缓存安装与启动分开；npm 日志和子进程最后的输出保存在 `artifacts/pack/`。浏览器各套件日志及 `summary.json` 保存在 `artifacts/browser/`。Wayback 存档仅提供修复建议，不会把失效的源链接变为成功。缺失或格式错误的报告也会失败。

详细诊断默认关闭。仓库变量 `CI_BROWSER_DEBUG=1` 启用 Playwright API 跟踪；`CISCRIPTS_DEBUG=1` 或 GitHub runner/step 调试显示辅助模块加载信息；`PACK_SMOKE_VERBOSE=1` 显示包安装与启动诊断。只使用测试数据，切勿记录 token、会话、用户消息或凭据。

## 发布前提与恢复

发布任务等待最终流水线门禁。只读检查取消过时运行；发布写操作串行执行且不中途取消。经过验证的提交之后，只允许版本、changelog 和 changeset 元数据变化。源码或依赖变化需要新的成功 CI。

npm 可信发布要求 Node 24 自带的 npm 至少为 11.5.1、`id-token: write`，并为 `link-foundation/meta-sovereign` 的 `release.yml` 配置 trusted publisher。必要时须由包管理员在 npm 初始化包和发布者。token 交换被拒绝后，不得绕过检查发布。

启用 **Settings → Security → Code security → Dependency graph**。PR 在功能不可用时给出说明，无须贡献者提供秘密。`main` 缺少依赖图或 npm 发布者配置时，preflight 会在昂贵构建前失败并明确说明设置步骤。网络、身份验证和无效 API 响应仍是错误。

仅精确版本响应或明确的 npm E404/GitHub 404 用于判断版本存在与否，其他结果属于未知状态。仅已知的暂时网络或服务器错误会在同一截止时间内重试。staged 版本只轮询可见性，不再上传；权限或策略拒绝立即失败。npm 版本已发布而 GitHub release 缺失时，可恢复 GitHub release 和文档而不重复发布 npm。

## 依赖策略

发布辅助工具由 manifest 和 lockfile 固定。Telegram 使用维护中的 `teleproto` 及兼容层，公开 provider 标识仍为 `telegram`。KaTeX 已修补。npm、Bun 和 Deno 均明确批准经过审查的原生安装脚本。

`electron-builder` 固定为 `27.0.0-alpha.13`，因为 26.x 仍含弃用依赖。这是构建工具的预发布版本，所有原生打包目标都必须通过 CI；运行时包的 Node 要求不变。不得隐藏警告或强行覆盖不兼容的主版本。lockfile 回归检查拒绝 deprecated 条目。
