# VK 用户令牌

在 **连接 → VK** 中验证已有的用户令牌，或粘贴准确的
`https://oauth.vk.com/blank.html#…` 最终地址。桌面应用还可在隔离的 VK
窗口中尝试 Kate Mobile 授权。VK 可能拒绝这个历史客户端或消息权限。
出现登录页面本身不能证明授权或消息访问可用。

启动 JS 服务器或桌面应用前设置 `MS_SECRET_PASSPHRASE`；参见
[用户指南](USER-GUIDE.zh.md)中的存储密钥保护说明。每次启动必须使用相同
口令。没有受保护的存储时，本功能拒绝保存令牌；此设置不会加密其余数据库。

每次尝试都需重新确认替换。验证只读取用户资料、权限和一次会话列表计数，
不会发送消息。有效用户令牌保存到受保护的 `secret:vk:user-token`，供实时读取
和发布共同使用。旧凭据仍作为后备。有效用户没有消息权限时仍可保存，并明确
显示该限制。无效令牌、社区令牌及账号不匹配的令牌会被拒绝。存储失败后应先
检查状态，再决定是否重试。

导入开始时清空密码字段。回执包含操作 ID、已验证账号和能力，不包含令牌或
粘贴的 URL。取消会等待本次任务排空；若保存已获确认，仍如实显示已保存。
刷新页面只读取状态，不重新授权、不重复导入，也不恢复勾选的同意。
服务器重启后临时操作状态清空，受保护的凭据继续保留。

```sh
node js/bin/meta-sovereign.js vk-token status
node js/bin/meta-sovereign.js vk-token start --confirm
node js/bin/meta-sovereign.js vk-token import --confirm
node js/bin/meta-sovereign.js vk-token cancel --id=<operation-id>
```

导入通过终端隐藏输入获取秘密，请勿把令牌放入命令参数。start/import 返回
等待回执后，用 status 查询最终结果。无桌面服务器不支持授权窗口，但支持
导入。`--url` 接受 HTTPS 或环回 HTTP 源地址。共享
`GET /api/vk/token` 和 `POST /api/vk/token/{start,import,cancel}` 支持文本和
二进制 Links Notation：start/import 需 `confirm: true`，import 另需 `value`，
cancel 需当前 `id`。失败或结果不确定的请求不会自动重放。
参见[有限可复现证据](case-studies/issue-56/vk-token.md)。
