# 服务器与自动化配置（语言：[en](SERVER-CONFIGURATION.md) • [ru](SERVER-CONFIGURATION.ru.md) • [hi](SERVER-CONFIGURATION.hi.md) • zh）

`meta-sovereign serve` 和桌面应用按以下顺序读取可读 Links Notation：

1. 用户应用目录中、`store` 旁的 `config.lino`。Linux：
   `$XDG_CONFIG_HOME/Meta Sovereign/config.lino`，否则为
   `~/.config/Meta Sovereign/config.lino`；macOS：
   `~/Library/Application Support/Meta Sovereign/config.lino`；Windows：
   `%APPDATA%/Meta Sovereign/config.lino`。
2. 当前目录下的 `.meta-sovereign/config.lino`，或 `--app-config=<file>` 指定的文件。
3. 显式命令选项覆盖文件中的服务器值。

默认文件可以不存在；显式指定的文件必须存在。相对路径以当前目录为基准。
`--store` 和 `META_SOVEREIGN_STORE_DIR` 只选择数据存储，不移动用户配置。
未设置时继续使用服务器原有环境变量；`MS_TLS=off` 仍会关闭 TLS。

```lino
configuration:
  server configuration_server

configuration_server:
  port 8788
  localUi true
  verbose false
  jsonCompatibility false
```

`meta-sovereign serve --port=8787` 只替换端口。嵌套对象使用命名引用，
无需 JSON 或类型标记。

| `server` 字段                                    | 值                                                     | 命令选项                                                   |
| ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| `port`                                           | 0–65535；0 选择空闲端口                                | `--port`                                                   |
| `verbose`, `localUi`, `tls`, `jsonCompatibility` | `true` / `false`                                       | `--verbose`, `--local-ui`, `--tls`, `--json-compatibility` |
| `backupIntervalHours`, `backupKeep`              | 0–596 小时，0 禁用；0–10000 个归档，0 全部保留         | `--backup-interval-hours`, `--backup-keep`                 |
| `recoveryFormats`                                | `text`, `binary`, `text,binary`, `binary,text`, `none` | `--recovery-formats`                                       |
| `allowOrigin`, `uiUrl`                           | `none` 或逗号/空格分隔的来源；应用的 HTTP(S) 地址      | `--allow-origin`, `--ui-url`                               |
| `theme`                                          | `system`, `light`, `dark`, `auto`                      | `--theme`                                                  |
| `skin`                                           | `t3`, `telegram`, `whatsapp`, `signal`                 | `--skin`                                                   |
| `language`                                       | `system`, `en`, `ru`, `zh`, `hi`                       | `--language`                                               |

文件上限为 64 KiB。命名管道等非常规文件会立即拒绝，不等待写入者。
未知字段、无效值、读取失败或 URL 中的凭据会以通用错误阻止启动。
令牌、密码和 cookies 应通过应用的受保护凭据控件设置。

桌面程序接受同样的启动选项。默认启用内置 UI、选择空闲端口并关闭 TLS。
`localUi false` 时默认端口为 8787，方便托管应用发现服务器；特殊端口可在
设置中选择。显式启用 TLS 后窗口使用 HTTPS。证书例外仅限本应用窗口、
精确本地来源和服务器证书指纹；其他证书仍正常验证。本地剪贴板权限也仅限
本应用来源。浏览器已保存的语言和外观优先；显式重置后可再次使用当前默认值。

## 六项 VK 桌面自动化

`automations.vk` 支持 `online`、`friends`、`cleanup`、`outgoing`、`wall`、
`birthday`。将[完整示例](../examples/desktop-automation-config.lino)复制到
`.meta-sovereign/config.lino`。示例的六项策略均暂停；启用前请替换示例 ID 和文本。

所有策略均有 `enabled` 和 `everyMinutes`：`online` 为 1–14 分钟，其他为
1–1440 分钟。其他字段：

| 策略                  | 字段                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friends`             | `maxFriends`, `batchSize`, `priorityIds`, `topPercentMutuals` (0–100), `acceptancePolicy`（`ranked-batch` / `desktop-ten-percent` / `desktop-configured`）                                                     |
| `cleanup`, `outgoing` | `limit`, `priorityIds`                                                                                                                                                                                         |
| `wall`                | `limit`, `cooldownDays`, `communities`, `messages`, `marker`, `attachments`, `restrictedCommunities`, `restrictedMessage`, `replaceOwned`, `activeAvatar`, `randomAttachment`, `holdAnyVisible`, `priorityIds` |
| `birthday`            | `limit`, `scanLimit`, `timeZone`, `messages`, `stickers`, `attachments`, `onlineOnly`, `priorityIds`                                                                                                           |

与现有自动化控件共用验证、限制及拒绝规则。启用 `wall` 前需要目标社区，
且每条邀请文本必须包含标记。参见[好友](VK-FRIEND-REQUESTS.md)、
[维护](VK-FRIEND-MAINTENANCE.md)、[邀请](VK-COMMUNITY-INVITATIONS.zh.md)、
[生日](VK-BIRTHDAY-GREETINGS.zh.md)。旧的空值、单值及列表使用原有兼容读取器；
无效的非空结构会拒绝。后层列表替换前层列表。

策略优先级从低到高：原生暂停默认值 → 全局文件 → 本地/指定文件 →
`--automation-defaults=<readable-Lino>` → 用户已保存的策略 → 策略保存命令的
显式选项。每项策略按字段合并。内联文档直接包含 `vk`，无外层 `automations`。

`meta-sovereign vk-online --app-config=.meta-sovereign/config.lino` 读取有效设置；
加上 `--every-minutes=7` 会保存用户选择，之后修改文件也不会覆盖它。
读取默认值不会写入策略或启动提供方操作。即使后层覆盖，前层也必须有效。
内联 Lino 同样上限 64 KiB。令牌、密码和 cookies 会拒绝；请使用受保护的凭据
控件，例如 `vk-token import` 的隐藏输入。

重启桌面应用或再次运行 `serve` 以重新读取文件。只有有效默认值改变时，
rolling 服务器才准备替代 worker，并清除文件已移除的默认值。已保存的策略
（包括暂停）继续优先。显式 `enabled true` 可在服务器调度器启动时启用此前
尚未配置的策略，但仍受原有凭据和发送保护约束。CLI 状态读取不会启动调度器。
