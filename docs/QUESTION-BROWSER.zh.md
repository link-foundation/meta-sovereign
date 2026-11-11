# 在浏览器中审核答案

在“自动化 → 问题与已保存答案”中打开“提供方浏览器答案”。聊天和操作员的自动化
菜单也使用同一组控件。选择提供方，明确指定网页聊天，然后读取当前问题。
HH 需要数字网页聊天 ID 或官方聊天 URL，不能使用 API UUID。可选的官方申请页面
URL 用于选择其中可见的嵌入对话。

检查问题、已保存答案的依据及选项原文。发送按钮确认点击提供方页面上的那个具体
选项。问题变化、选项不可用或已有个人草稿时会阻止点击。普通开场建议不属于答案
选项。对于自由文本问题，预填仅向空白输入框写入审核过的草稿并核对实际值；请在
提供方页面自行审核和发送。预填不会提交消息。

服务器私密保存审核记录 30 分钟。它与自动答案共用持久化发件箱预留记录，防止
重复发送。只有确认提供方的发出消息回执才显示成功。恢复状态只读取已保存数据，
不打开浏览器，也不重复点击。响应丢失后，在恢复状态前禁止再次选择。未知结果
在刷新或重启后仍受保护；请检查提供方聊天，并在发件箱中确认结果。离线或不支持
的适配器不会模拟发送成功。查询功能支持情况不会启动浏览器。

CLI 使用 `meta-sovereign automations answers browser`，后接 `show`、
`inspect --source=hh --chat=7`、`select --id=<review-id> --option=Yes --confirm=true`、
`status --id=<review-id>` 或 `prefill --id=<free-text-review-id>`。
可信服务器提供 `GET /api/automations/answers/browser` 和
`POST /api/automations/answers/browser/{inspect,prefill,select,status}`，支持文本和
二进制 Links Notation。选择操作需要已保存的审核 ID、选项原文和布尔值
`confirm: true`。检查沿用现有个人资料、薪资、上下文和可选模型设置。

保存聊天中同一问题的完整接收答案摘要，可以恢复唯一匹配的当前选项。
答案冲突、历史检查不完整、本人消息、被拒答案或明确更正都会保留人工审核。
摘要不会批准保存规则或增加回答次数，也不能授权自由文本、表单字段或薪资目标。
已批准的精确选项优先。自动发送前会重新检查摘要，公共界面会显示来源消息。

CLI：`meta-sovereign automations answers plan --question="Do you have distributed systems experience?" --options='(Yes No)' --strict-options=true`。
选项使用 Links Notation。规划 API 也接受 `options` 和布尔值 `strictOptions`。

读取 HH 当前问题后，可以明确启动 1–120 分钟的监视（默认 120）。只有已批准的
精确选项或完整摘要中唯一匹配的选项会自动点击；每次操作前重新检查当前知识。
禁用或延迟出现的选项会等待。自由文本仅预填供审核，不自动发送。出现原生选项时，
未修改的自动草稿会清除，个人修改会保留。导航、刷新、未知送达结果或失去运行
所有者会暂停监视。“停止并等待”会先等待当前操作完成。

CLI：`meta-sovereign automations answers browser watch --id=<review-id>
--confirm=true --duration-ms=7200000`。此命令在前台运行，Ctrl+C/SIGTERM 会停止
并等待操作结束。其他进程可用 `watch-status --watch-id=<watch-id>` 读取保存状态，
但不能控制或恢复该前台所有者。运行它的服务器提供可信文本/二进制 Lino 路由：
`POST /api/automations/answers/browser/{watch-start,watch-status,watch-stop}`。
启动需要 `id: 'question-watch:<uuid>'`、`review`、`confirm: true` 和可选
`durationMs`。响应丢失时保留该 ID；重复启动 ID 或刷新界面仅恢复状态，不恢复
运行。没有运行所有者的已保存活动记录显示为 paused/owner-unavailable。

验证使用隔离的模拟提供方页面和实际生产发送器。已登录提供方完整验证和所有未读
聊天的编排仍是问题 #56 未完成的验收条件。参见
[监视验证记录](case-studies/issue-56/question-watch.md)。
