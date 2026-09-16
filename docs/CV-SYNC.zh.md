# 求职平台之间的简历同步 (languages: [en](CV-SYNC.md) • zh • [hi](CV-SYNC.hi.md) • [ru](CV-SYNC.ru.md))

一份简历通常同时存在于七个地方：LinkedIn、hh.ru、Habr Career、Naukri、
VietnamWorks、TopCV、SuperJob。每个地方保存的副本都略有不同、略显陈旧，
没有人会手工把这七份保持一致。

这个子系统用真实浏览器读取其中的每一份资料，把它们变成同一个规范简历，
显示差异，并把商定的值写回去。整个过程完全在本地：浏览器运行在用户自己
的机器上，使用用户自己已登录的 session，除了用户本来就在用的平台之外，
不会把任何东西发往别处。

相关文档：[REQUIREMENTS 第 V 节](REQUIREMENTS.zh.md)、
[USER-GUIDE](USER-GUIDE.zh.md)、[issue 29 案例研究](case-studies/issue-29/README.md)。

## 1. 分层

| 层        | 文件                           | 职责                                                                                  |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Model     | `js/src/cv/model.js`           | 唯一的规范简历结构，以及它在 links notation 中的投影（R-V1）。                        |
| Diff      | `js/src/cv/diff.js`            | 基于 key 和 path 的比较与协调（R-V2）。                                               |
| Plans     | `js/src/cv/platforms/*.js`     | 每个平台一份声明式的、纯数据的计划（R-V3..R-V11）。                                   |
| Registry  | `js/src/cv/platforms/index.js` | 目录、校验与 confidence 统计（R-V12）。                                               |
| Telemetry | `js/src/cv/telemetry.js`       | 记录每个步骤、值、fallback 和 fingerprint，并做脱敏（R-V13）。                        |
| Runner    | `js/src/cv/runner.js`          | 通过 browser-commander 执行计划（R-V14）。                                            |
| Browser   | `js/src/cv/browser.js`         | 打开持久的 browser-commander session（R-V14）。                                       |
| Facade    | `js/src/cv/index.js`           | `readCvFrom`、`compareAllCvs`、`updateCvOn`、`syncCvAcross`（R-V15）。                |
| HTTP      | `js/src/server/routes-cv.js`   | `/api/cv/*`（R-V16）。                                                                |
| CLI       | `js/src/cli/cv-commands.js`    | `cv-platforms`、`cv-plan`、`cv-read`、`cv-diff`、`cv-sync`、`cv-telemetry`（R-V17）。 |
| SPA       | `js/src/web/cv-view.js`        | CV 页面（R-V18），并让 Node 路径不进入 browser bundle（R-V19）。                      |

各层只自上而下调用，只有 runner 知道浏览器的存在。因此整个流程 —— 包括
“把这四个字段写到 Naukri” —— 都可以在没有浏览器的情况下测试。

## 2. 规范简历

```text
cv
  basics
    name: Anna Ivanova
    headline: Backend Engineer
    location: Yerevan, Armenia
  skills
    skill: Go
    skill: Kubernetes
  experience
    position
      company: Acme
      title: Backend Engineer
      start: 2022-01
```

分区有三类：

- **maps** —— `basics`（`name`、`headline`、`summary`、`email`、`phone`、
  `location`、`website`、`birthDate`）和 `preferences`（`employment`、
  `schedule`、`salary`、`currency`、`relocation`、`remote`）；
- **lists** —— `skills`；
- **records** —— `experience`、`education`、`languages`、`links`，每条记录
  都有身份 key（`experience` 由 company + title + start 组成），这样在两个
  平台之间 diff 能匹配到同一段工作经历，而不会因为某个站点的排序相反就
  报告“全部都变了”。

每个值都用 path 寻址：`basics.headline`、`skills`、
`experience[0].title`。path 是 diff 的词汇，也是 CLI 的 `--paths` 以及
每个平台声明的 `writePaths` 白名单所使用的词汇。

## 3. 计划就是数据

一份计划是有序的步骤列表。计划里没有任何函数，因此它可以被打印、比较、
在 CI 中校验，也可以为一个我们尚未取得登录后 markup 的平台先行发布。

| Action        | 含义                                                   |
| ------------- | ------------------------------------------------------ |
| `goto`        | 跳转到 URL（`{{login}}` 这类模板会被替换）。           |
| `waitFor`     | 等待 selector；超时记为 drift，而不是崩溃。            |
| `requireUrl`  | 断言我们仍在预期的位置 —— 这就是“我登录了吗？”的检查。 |
| `click`       | 点击第一个匹配项。                                     |
| `fill`        | 把规范值输入字段，并回读验证。                         |
| `press`       | 发送一个按键。                                         |
| `read`        | 把一个标量读入某个 path。                              |
| `readList`    | 把所有匹配读入 list 分区。                             |
| `readRecords` | 每个容器匹配读出一条记录，字段相对于该容器。           |
| `extractJson` | 解析服务器渲染的 JSON，并用具名 mapper 映射。          |
| `snapshot`    | 把某个区域的 HTML 作为运行产物保存。                   |
| `screenshot`  | 把视口的 PNG 作为运行产物保存。                        |

每个 selector 都可以是候选列表（`a, b, c`）。runner 按顺序尝试，只要用到
的不是第一个，就发出 `selector.fallback` 事件 —— 这是站点改动 markup 时
最早可能出现的警告。

每个步骤都带有 confidence 级别：

- `verified` —— 在我们自己抓到的 markup 中观察到；平台的 `evidence` 数组
  记录了 URL、日期和发现的内容。
- `documented` —— 来自厂商文档或公开 API。
- `draft` —— 由公开知识推断，待第一次登录后运行确认。draft 不是藏在代码
  里的猜测：它被标注、被统计、由 `cv-plan` 打印，并在 SPA 中展示。

## 4. 平台覆盖

| 平台         | Id             | 地区   | markup 访问情况           | Read paths | Write paths | 步骤 | Verified          | Drafts |
| ------------ | -------------- | ------ | ------------------------- | ---------- | ----------- | ---- | ----------------- | ------ |
| LinkedIn     | `linkedin`     | global | authenticated             | 7          | 4           | 32   | 7                 | 25     |
| hh.ru        | `hh`           | ru     | authenticated             | 10         | 4           | 30   | 6 (+2 documented) | 22     |
| Habr Career  | `habr-career`  | ru     | public profile            | 2 (+JSON)  | 3           | 17   | 12                | 5      |
| Naukri       | `naukri`       | in     | authenticated             | 10         | 3           | 34   | 7                 | 27     |
| VietnamWorks | `vietnamworks` | vn     | authenticated             | 9          | 8           | 32   | 11                | 21     |
| TopCV        | `topcv`        | vn     | blocked without a browser | 12         | 6           | 32   | 5                 | 27     |
| SuperJob     | `superjob`     | ru     | authenticated             | 6          | 2           | 18   | 5                 | 13     |

`markupAccess` 如实说明我们在没有 session 时能看到什么：
`public-profile` 表示读取那一半已对照线上 markup 验证过，
`authenticated` 表示资料页会跳转到登录页，
`blocked-without-browser` 表示站点会用挑战页面回应普通 HTTP 客户端 ——
这正是整个子系统要驱动真实浏览器的原因。

`cv-platforms --json` 和 `GET /api/cv/platforms` 直接从 registry 返回这张
表，因此它不可能与代码脱节。

## 5. 更新分组

写入是分组的，因为这些站点本来就这样工作：打开 “Headline” 弹窗、输入、
保存、关闭，是一个整体。每个分组都有 id（`intro`、`about`、`skills`、
`headline`、`key-skills`、`employment`、`personal`、`preferences`、
`cv-builder`、`objective`、`expectation`、`cv-document`、`title`、
`publish`），可以用 `cv-sync --groups=…`（或 `/api/cv/sync` 上的
`"groups": [...]`）选择，于是用户可以只写 headline 而不动其他内容。
`--paths=basics.headline` 则按简历 path 收窄同一次运行；平台支持但用户
没有选中的 path 会被报告为 `deselected` —— 这是刻意与 `unsupported`
区分开的另一个计数。

平台的 `writePaths` 是白名单。落在白名单之外的改动，`syncCvAcross` 会
报告为 `unsupported`，而不是假装已经写入：LinkedIn 不允许任何人通过资料
表单改写一条工作记录，计划就照实说明，而不是悄无声息地失败。

## 6. Telemetry

每次运行都会产生有序的事件流，保存在 store 中 `cv-telemetry` token 前缀
下，可用 `cv-telemetry` 或 `GET /api/cv/telemetry` 回放：

| 事件                 | 何时产生                                        |
| -------------------- | ----------------------------------------------- |
| `run.start`          | 一次读取 / 更新 / drift 检查开始。              |
| `step.start`         | 每个步骤之前，带上它的 action 和 confidence。   |
| `step.ok`            | 步骤完成了它声明的事，并附上实际用的 selector。 |
| `step.skip`          | 前置条件不成立的可选步骤。                      |
| `step.miss`          | selector 没有匹配到任何内容，或等待超时。       |
| `step.error`         | 步骤抛出了异常。                                |
| `value.read`         | 一个值进入了简历（已脱敏）。                    |
| `value.write`        | 一个值被输入页面，并附上验证结果。              |
| `selector.fallback`  | 使用了靠后的候选 selector，而不是第一个。       |
| `markup.fingerprint` | 被 snapshot 区域的 FNV-1a fingerprint。         |
| `markup.changed`     | 该 fingerprint 与记录的 baseline 不同。         |
| `screenshot`         | 写出了一个 PNG 产物。                           |
| `run.finish`         | 总计、耗时与结果。                              |

脱敏默认开启：电子邮件地址、电话号码以及任何看起来像长 token 的内容，
都会在事件存储前被替换。产物路径除外，因为用户打不开的路径算不上证据。

带上 `--artifacts=<dir>` 时，`snapshot` 与 `screenshot` 步骤会写出
`<dir>/<runId>/<name>.html` 和 `.png`。这就是 issue 所要求的 markup 变化
记录：当站点挪动了某个字段，发现它的那次运行会把 HTML 和图片放在事件流
旁边。

该路径的两个片段都拼写成任何文件系统都接受的形式：run id 形如
`linkedin-2026-09-16T07-00-00.000Z`，而不是 ISO 时间戳，因为 Windows 会把
路径里的 `:` 当作 alternate data stream 的分隔符，从而根本不会创建该目录。

## 7. drift 检测

一次健康运行产生的 `markup.fingerprint` 事件构成 baseline。之后的运行会
与之比较，并在写入任何值之前，为每个发生位移的区域发出
`markup.changed`。runner 同样把“selector 不见了”当作数据而非崩溃：一个
非可选步骤 miss 会以 `code: 'step-missed'` 和指明 selector 的原因中止本次
运行，因此针对我们只有 draft 的站点，第一次登录后的运行就会给出一份精确
的待修清单。

## 8. 如何使用

```bash
# 支持哪些平台，以及其中多少已被验证
meta-sovereign cv-platforms
meta-sovereign cv-plan --platform=linkedin

# 把资料读入本地 store（会打开浏览器）
meta-sovereign cv-read --platforms=linkedin,hh --login=anna --artifacts=./cv-runs

# 比较已经存下来的内容 —— 不需要浏览器
meta-sovereign cv-diff --prefer=linkedin

# 规划收敛；加 --apply 才会真正写入
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# 只写一个字段，或只写一个编辑分组
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# 一次运行中发生了什么
meta-sovereign cv-telemetry --type=step.miss
```

某个平台的第一次 `cv-read` 会打开可见浏览器（`--headed`），用户登录一次，
session 保存在按平台区分的 profile 目录（`--profile=<dir>`）里，之后的运行
会复用它。本仓库从不索取、保存或传输凭据。

同样的操作也可以通过 HTTP（`/api/cv/platforms`、`/plan`、`/stored`、
`/read`、`/compare`、`/sync`、`/telemetry`）以及 SPA 的 **CV** 页面使用。
该页面列出各平台及其 draft 数量，展示比较矩阵，并拒绝从浏览器标签页发起
实时读取 —— 浏览器无法驱动另一个浏览器，因此 SPA 会转而指向 CLI。

## 9. 测试

| 层级            | 运行内容                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | Model、diff、计划校验、runner、telemetry —— 使用假的 commander。                                                                    |
| Fixture         | `js/tests/helpers/markup-fixture.js` 依据计划本身重建每份计划预期的 DOM。                                                           |
| Browser（可选） | `RUN_BROWSER_E2E=1 npm run test:e2e:cv` 通过 Playwright 拦截，在平台自己的 URL 上提供这些 fixture，并用真实 Chromium 跑完七份计划。 |

fixture 生成器正是浏览器测试有价值的原因：它从计划的 selector 推导页面，
因此计划与其 fixture 不可能脱节，而 e2e 检验的是实际发布的路径 ——
`openBrowserSession` → browser-commander → runner → telemetry —— 而不是它
的 mock。
