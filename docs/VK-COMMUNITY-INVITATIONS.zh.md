# VK 社区邀请 (languages: [en](VK-COMMUNITY-INVITATIONS.md) • [ru](VK-COMMUNITY-INVITATIONS.ru.md) • [hi](VK-COMMUNITY-INVITATIONS.hi.md) • zh)

打开**连接 → VK → 手动 → 社区邀请**。计划、旧帖替换和头像附件默认关闭。填写正数社区 ID、每行一个文案选项，以及每个选项都包含的标记。参考项目中的私人目标不会成为默认值。

最多接受十个原生照片、音频、视频或文档 ID，可附访问密钥。这里不接受 URL 或文件上传。头像选项直接使用当前个人资料的原生照片，无需重新上传。受限社区使用独立文案并省略配置媒体；明确启用的头像仍可附加。有其他文案可选时避免连续重复上次选择。

启用随机选择一个配置媒体的选项后，每次新审核从列表选择一项。确认前显示具体选择，发送和部分恢复期间保持不变。可选头像另行附加；受限社区不使用媒体列表。关闭此选项时附加全部配置项目。CLI：`--random-attachment true`（关闭用 `false`）；API 和离线设置：`randomAttachment`。

保存后审核每个社区、原文、附件和自己的旧帖 ID。前十条中已有自己的邀请、冷却期、受保护社区、同意撤回或证据不完整都会阻止发布。零限额不会发布。替换需要完整且有界的搜索，最多 1000 个匹配；仅选择当前账号创作、内容未变且有删除权限的帖子。

确认当前审核后发布。删除旧帖之前，先持久保存 VK 对新帖的明确确认。每次删除都重新核对保留的新帖、旧帖作者和内容，并要求独立确认。部分替换需要重新手动审核，只继续剩余删除，不重复发帖。发布或删除结果未知时绝不自动重放。VK 错误码 15/210/219 暂停该社区 24 小时；这些错误码以及 10/14 也会暂停账号邀请至少一分钟。

CLI 支持 `meta-sovereign vk-wall save`、`plan`、`run --plan <id> --confirm`；API 为 `/api/vk/wall`，使用文本或二进制 Lino。选项包括 `--communities`、`--messages`、`--marker`、`--attachments`、`--restricted-communities`、`--restricted-message`、`--replace-owned`、`--active-avatar`、`--limit`、`--cooldown-days` 和 `--every-minutes`。浏览器可离线保存设置；审核和发布需要本地服务器及 VK 账号。计划由所属服务器启动，关闭时停止并等待任务结束。

“前十条中有任意作者的邀请时暂停”默认关闭；默认只暂停自己的邀请。CLI：`--hold-any-visible true`；API 和离线设置：`holdAnyVisible`。

如果成功的当前 VK 查询确认已审核的旧帖不存在，可继续处理剩余旧帖。不存在的 ID 与已确认删除的 ID 分开显示。单凭 100/104 拒绝不能确认不存在；结果未知的写入仍为未知。审核后旧帖重新出现时，需要重新审核。已确认的新帖必须仍然存在且内容未变。

源好友邀请脚本同样发布到配置的社区墙。[源码审查](case-studies/issue-56/vk-friend-invitations.md)和[验证记录](case-studies/issue-56/vk-wall.md)。
