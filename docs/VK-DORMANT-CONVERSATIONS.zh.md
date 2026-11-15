# 久未联系的 VK 对话 ([en](VK-DORMANT-CONVERSATIONS.md) · [ru](VK-DORMANT-CONVERSATIONS.ru.md) · [hi](VK-DORMANT-CONVERSATIONS.hi.md))

连接 → VK 提供独立的话题提问、提供帮助及音乐提问策略。所有自动计划默认关闭。
每项策略分别保存执行间隔、发送上限、检查好友上限、沉默天数、每人间隔、问候或贴纸、
问题选项及受保护 ID。默认仅在线好友。话题默认沉默七天，帮助及音乐为 31 天。
上限为零时不会发送。

请自行编写问题，每行一个选项，最多 20 个，每个最多 500 字符。预览为每个人选择并
固定一个选项。音乐需指定原生 `audioOWNER_ID_AUDIO_ID`；不会自动选择参考账户的
音频。由 VK 附加音频；本功能不下载或上传本地音频文件。

预览检查当前好友关系、账户、发送权限及最多 1000 条消息的完整历史，并为本序列
保留空间。空对话、近期、未读、受保护、拒收、停用及结果未知的对话暂缓。列表最多
10,000 位好友；检查上限限制逐人读取。受保护 ID 与其他 VK 好友策略共享。

确认准确顺序：问候、可选音频、问题。每步间隔 15 秒，每人间隔 30 秒。每次发送有
独立的持久发件箱标识及正数 VK 消息回执。在 API 实际限流等待后重新检查权限、策略、
同意、账户及历史。新回复、编辑或附件变化将停止后续步骤。审核五分钟后失效。
文字及音频标识保留在聊天中。

确定的部分发送需要新的手动审核。剩余原始消息与 random ID 在重启后保留；已经
确认的步骤不会重复。结果未知的发送保留在发件箱，等待手动调查。自动计划不会继续
部分发送的序列。新一轮完整发送同时要求沉默时间及每人间隔。停止和关机会等待所属
任务退出。

`vk-topic`、`vk-help`、`vk-music` 支持 `status|save|plan|run`。保存参数包括
`--enabled=true|false`、`--every-minutes`、`--limit`、`--scan-limit`、
`--stale-days`、`--cooldown-days`、`--greeting`、`--sticker-id`、`--questions`、
`--online-only=true|false`、`--priority=ID,ID`，音乐还支持 `--audio`。
用 `--store` 选择存储。`plan` 后使用 `run --plan=<返回的-id> --confirm=true`。
前台命令不会启动计划。同样的操作通过 `/api/vk/topic`、`/api/vk/help`、
`/api/vk/music` 及其 `/plan`、`/run`，支持两种默认 Lino 编码。离线页面可保存
配置；读取 VK 或发送时需要本地服务器。

[实现及可复现证据](case-studies/issue-56/vk-reengage.md)。
