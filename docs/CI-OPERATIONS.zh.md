# CI 与发布诊断（语言：[en](CI-OPERATIONS.md) • zh • [hi](CI-OPERATIONS.hi.md) • [ru](CI-OPERATIONS.ru.md)）

R-Z32 要求验证实际发布的源码，并保留失败诊断。[issue 43 调查](case-studies/issue-43/README.md)提供原始日志和模板比较。

## 本地检查与 CI

使用 `npm ci` 安装依赖。本地仅对修改文件执行 lint，并以 `--test-concurrency=1` 运行相关测试。完整的 Node/Bun/Deno 与操作系统矩阵、Chromium、macOS 原生 WebKit、Rust 和桌面打包均由 GitHub CI 执行。测试使用临时存储和独立服务器，与用户正在运行的应用分离。

两个浏览器执行 `js/scripts/browser-checks.json` 中相同的代表性测试，包括恢复测试。缺少所需浏览器、测试失败或超时均导致任务失败。测试进程开始后才上传浏览器产物；更早的合并或安装错误保留为主要原因。

20 万条记录的备份回归仅在独立 CI 任务中运行，设置 `RUN_BACKUP_STRESS=1`，V8 堆上限为 384 MiB。普通单元测试跳过它。不要在用户机器上运行压力测试。

## 诊断失败

先将运行时间和 head SHA 与分支最新提交核对。使用 `gh run view RUN_ID --log > run.log` 保存日志，阅读实际失败的步骤，区分断言失败、API 拒绝、报告缺失和过时运行被取消。`experiments/issue43-runs.py` 保存本次调查的运行与注释。

包检查将空缓存安装与启动分开；npm 日志和子进程最后的输出保存在 `artifacts/pack/`。浏览器各套件日志及 `summary.json` 保存在 `artifacts/browser/`。Wayback 存档仅提供修复建议，不会把失效的源链接变为成功。缺失或格式错误的报告也会失败。

详细诊断默认关闭。仓库变量 `CI_BROWSER_DEBUG=1` 启用 Playwright API 跟踪；`CI_SCRIPTS_DEBUG=1` 或 GitHub runner/step 调试显示辅助模块加载信息；`PACK_SMOKE_VERBOSE=1` 显示包安装与启动诊断。只使用测试数据，切勿记录 token、会话、用户消息或凭据。

## 发布前提与恢复

发布任务等待最终流水线门禁。只读检查取消过时运行；发布写操作串行执行且不中途取消。经过验证的提交之后，只允许版本、changelog 和 changeset 元数据变化。源码或依赖变化需要新的成功 CI。

npm 可信发布要求 Node 26.12.1 和固定的 npm 12.2.1、`id-token: write`，并为 `link-foundation/meta-sovereign` 的 `release.yml` 配置 trusted publisher。必要时须由包管理员在 npm 初始化包和发布者。token 交换被拒绝后，不得绕过检查发布。

启用 **Settings → Security → Code security → Dependency graph**。PR 在功能不可用时给出说明，无须贡献者提供秘密。`main` 缺少依赖图或 npm 发布者配置时，preflight 会在昂贵构建前失败并明确说明设置步骤。网络、身份验证和无效 API 响应仍是错误。

仅精确版本响应或明确的 npm E404/GitHub 404 用于判断版本存在与否，其他结果属于未知状态。仅已知的暂时网络或服务器错误会在同一截止时间内重试。staged 版本只轮询可见性，不再上传；权限或策略拒绝立即失败。npm 版本已发布而 GitHub release 缺失时，可恢复 GitHub release 和文档而不重复发布 npm。

## 依赖策略

发布辅助工具由 manifest 和 lockfile 固定。Telegram 使用维护中的 `teleproto` 及兼容层，公开 provider 标识仍为 `telegram`。KaTeX 已修补。npm、Bun 和 Deno 均明确批准经过审查的原生安装脚本。

`electron-builder` 固定为 `27.0.0-alpha.13`，因为 26.x 仍含弃用依赖。这是构建工具的预发布版本，所有原生打包目标都必须通过 CI。不得隐藏警告或强行覆盖不兼容的主版本。lockfile 回归检查拒绝 deprecated 条目。

v27 构建器的新配置保留相同的打包文件、原生模块策略、desktop 文件和 macOS 权限。临时签名使用 `mac.sign.identity` 和 `mac.sign.sign`。现有 updater 6 通道明确保留未签名的更新清单和 Windows 文件；启用 Authenticode 验证之前必须配置签名发布者。Staged updater 使用精确且限定范围的 npm alias，将弃用的 `lodash.isequal` 替换为 `lodash.isequalwith@4.4.0`。未提供 customizer 时，两者执行相同的布尔深度比较。每次安装后都会验证真正的 updater 缓存对相同、变更的元数据和缺失文件的处理。上游修复发布后应移除此 override；将整个 `lodash` 作为 alias 会返回包装对象，因此不安全。

Windows Deno 在 Telegram 初始化之前选择 cifrante 现有的 WASM AES 后端：cifrante 0.6.0 创建原生 IGE 时会使 Deno 2.9.8 以 `0xC0000005` 崩溃。其他运行时及平台的选择保持原样。有界的 `experiments/issue43-cifrante.mjs` 验证应用路径与加密解密；`--raw-native` 明确重现原生崩溃。`CI_CRYPTO_DIAGNOSTICS=1` 启用测试阶段跟踪，默认关闭。运行时及加密断言均保留。

Desktop、registry、mobile 和 package-smoke 命令共用精确固定的 `cross-spawn@7.0.6`，以解析 Windows npm/npx shim 并转义参数。Node 的参数数组与 `shell: true` 组合会触发 DEP0190；共用启动器设置 `shell: false` 并保留命令失败状态。回归测试以 `--throw-deprecation` 运行 npm/npx，并检查参数原样传递及退出码。

Pre-commit hook 向 lint-staged 传入 `--config package.json`，避免自动发现归档模板快照中的配置。根级 ESLint/Prettier 排除规则保留原始证据。真实的临时 Git 回归测试验证嵌套参考任务不会运行，而维护中的文件仍接受根级检查。

GitHub 测试 fixture 在清理时关闭其拥有的所有连接，包括 keep-alive 和未完成的请求；应用服务器保持独立。`CI_FIXTURE_DEBUG=1` 输出连接数与关闭耗时（默认关闭）。保持 runtime job 原有截止时间，通过修复 fixture 的连接清理避免等待客户端超时。

`MS_LIFECYCLE_DEBUG=1` 输出固定的关闭阶段名称、经过的毫秒数和自有连接数，不含请求或账户内容。默认关闭，Windows Node CI 显式启用。keep-alive 回归测试阻塞内存存储的 flush，分别验证套接字关闭和持久化；随后必须释放 flush 并等待完整关闭。

GitHub 多次无法分配 macOS ARM runner 后，Node 和 WebKit 改用固定版本的原生 `macos-26-intel` 池。Bun、Deno 和桌面打包仍覆盖 macOS ARM。九种运行时/操作系统组合及两项浏览器检查仍为必需；排队不算检查成功。

所有自有网络 fixture 共用跟踪 socket 的关闭 helper，覆盖 GitHub、serverFetch、archive/WhatsApp/marketplace 路由、本地 Pages 和邮件协议。Rust 文档在检查和两条发布路径中均拒绝警告（`RUSTDOCFLAGS=-D warnings`）。临时 Git fixture 设置自己的 LF 策略，不修改用户设置。

两个发布模式仅更新锁文件的两个根版本字段，不重新解析依赖。CI 使用 `node experiments/issue-52/rehearse-release.mjs` 离线验证根目录和嵌套包。`CI_SCRIPTS_DEBUG=1` 显示版本和包数量。桌面发布拒绝不完整的上游任务结果，并明确显示阻止原因。参见 [issue 52 审计](../dev/log/issues/52/pulls/53/README.md)。

所有写入外部状态的任务共用仓库/main 并发组，且不会被取消。只读检查仅取消相同任务的过期运行，矩阵标识也参与分组。版本推送发生竞争时重新获取 main、验证源码一致并重新计算元数据，最多三次；规则和认证错误立即失败。隔离的 `rehearse-push.mjs` 通过真实本地 Git 远端验证这些行为，不执行发布。

发布和定时 CodeQL 都要求有效 SARIF，任何未解决结果都会失败。两个有意保留的正则用例通过规则、路径、原始行、整个文件的 SHA256 和指定回归测试审核；源码变更会使例外失效。失败时仍保存报告。HTML 导入、CV 和 SVG 使用固定版本的流式解析器；CV 写入仅允许规范自有字段。Pages 已知捆绑依赖的临时 `DEP0040` 过滤仅限部署步骤，其他警告仍可见；上游修复并重新构建 action 后应删除过滤。

两个 CodeQL 工作流系列也会扫描所有面向 main 的 PR，包括仅修改文档的 PR，以便 GitHub 比较全部基线配置。除工作流任务外，还应检查 CodeQL 汇总结果。错误响应和保存的错误摘要只保留已隐藏凭据的消息首行，抛出的堆栈字符串以及任意对象的字符串转换都不能泄露堆栈帧。

## 发布内容与 npm 缓存

[Issue 54 审计](../dev/log/issues/54/pulls/55/README.md)保存了六次指定运行和完整模板文件树。版本更新后，GitHub 发布创建与补充步骤将本地引用解析为精确的提交 SHA；缺失必需发布、API 拒绝或未知响应都会在写入前失败。说明保留全部 changeset 章节、围栏代码示例、字面转义和相关 PR 链接；大文本遵循 UTF-8 字节上限并附带完整 changelog 的不可变链接。npm 缓存使用者仅恢复，每个 workflow/ref/平台键只有指定写入者。所有 setup-node 步骤显式关闭隐式包管理器缓存。CI 验证证据归档的校验和。

工作流审计也检查复合 action 和 Dependabot。同仓库 action 使用 GitHub 的 `$/...` 语法；常规依赖版本等待七天，安全更新不受此延迟影响。 固定的 actionlint 1.7.12 尚不支持该语法；针对确切引用的兼容例外关联上游 issue 711，并验证真实错误仍会失败。
