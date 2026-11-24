# VK 生日问候 ([en](VK-BIRTHDAY-GREETINGS.md) · [ru](VK-BIRTHDAY-GREETINGS.ru.md) · [hi](VK-BIRTHDAY-GREETINGS.hi.md))

打开 **连接 → VK → 手动 → VK 生日问候**。自动计划默认关闭。选择明确的 IANA 时区，例如 `UTC` 或 `Asia/Shanghai`。该时区决定今天的日期；日期改变后必须重新审核。

可编辑最多二十条短问候（每行一条）、二十个正数贴纸 ID，以及十个现有的 `photo`、`audio`、`video` 或 `doc` 附件 ID。附件可带访问密钥；这里不接受 URL 或文件上传。默认提供十条原创简短祝福，不预选贴纸或媒体。可以只发文字、贴纸、媒体，或先发贴纸再发文字及媒体。有不同选项时避免重复上次选择。

保存后审核好友、日期、准确文字和媒体。隐藏或无效的生日、日期不符、停用账号、好友关系变化、无写入权限、受保护的人、拒收、未读对话及过去 24 小时内的聊天都会阻止发送。仅在线筛选可选。必须在有限扫描内取得完整历史。发送上限为零时不发送。离线可保存设置；审核提供方信息及发送需要本地服务器和您的 VK 账号。

确认当前审核后发送。可选贴纸先发，15 秒后发送文字及媒体；每一步都必须有自己的正数原生消息回执。持久回执防止同一日期向同一好友重复问候，即使提供方历史已清除。部分已确认发送在重启后仍保留；重新手动审核仅继续原有剩余步骤。未知结果不会自动重试。每次操作前都会重新检查日期、账号、凭据、同意状态、设置及完整对话。停止和服务器关闭会等待所属工作结束。

也可使用 `meta-sovereign vk-birthday save`、`plan`、`run --plan <id> --confirm`，或默认 Lino text/binary 的 `/api/vk/birthday`。选项包括 `--time-zone`、`--messages`、`--stickers`、`--attachments`、`--online-only`、`--priority`、`--limit`、`--scan-limit`、`--every-minutes` 和 `--enabled`。启用计划会授权以后符合条件的问候；部分完成或结果未知的任务不会自动继续。

[实现与验证记录](case-studies/issue-56/vk-birthday.md)。
