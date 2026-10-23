# 数据迁移：带版本的数据模式 (languages: [en](DATA-MIGRATIONS.md) • zh • [hi](DATA-MIGRATIONS.hi.md) • [ru](DATA-MIGRATIONS.ru.md))

当存储数据的形状发生变化（字段改名、标识符换了算法、日期改存为 ISO 文本）时，磁盘上已有的数据必须随之更新。meta-sovereign 在数据旁保存一个**模式版本**，并在数据以写入方式打开时按顺序自动执行**迁移**（R-Z17）。

## 版本如何工作

- 版本是存储中的一条链接 `meta:schema`：`{ version, applied: [{ id, at, ms, changed }], app }`。`applied` 是历史（哪个迁移、何时、耗时多久、改了多少条链接）；`app` 是写入它的应用版本。
- 没有这条链接的存储是**版本 0**：即有版本之前的数据形状。空存储视为最新。
- `CURRENT_SCHEMA`（在 `js/src/storage/migrations/index.js`）是本构建写入的版本。每个迁移是一个模块 `js/src/storage/migrations/<NNNN>-<slug>.js`，把数据从版本 `NNNN-1` 迁到 `NNNN`。
- 同样的模块同时用于**服务器存储**（`data.lino`）、**恢复的备份**以及网页 / GitHub Pages 模式的**浏览器存储**。

## 用户会看到什么

| 位置                                             | 发生什么                                                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta-sovereign serve` 或任何写入命令            | 若存储较旧，先迁移（服务器之后才开始监听）。日志显示 `migration_started`，每个迁移一条 `migration_step`（`id`、`scanned`、`changed`、`ms`；只有计数，从不含内容），然后是 `migration_done`。 |
| `meta-sovereign migrate --store=<dir>`           | 立即迁移并打印同样的行。                                                                                                                                                                     |
| `meta-sovereign migrate --store=<dir> --dry-run` | 统计每个迁移会改动什么；不写入，不加锁。                                                                                                                                                     |
| `meta-sovereign migrate --store=<dir> --status`  | 存储的版本、待执行的迁移数以及历史。                                                                                                                                                         |
| `/api/health`                                    | `schema: { version, current }`。                                                                                                                                                             |
| 只读命令（`export`、`backup`、`cv-read` 等）     | 从不迁移。较旧的存储按原样读取（一行 `schema_old_read_only` 说明）；读取代码接受旧形状。                                                                                                     |
| 备份                                             | 归档记录 `schema: { version }`。恢复较旧的归档时先在内存中迁移其链接，因此失败不会写入任何内容；较新的归档会被拒绝并报 `BACKUP_TOO_NEW`。                                                    |
| 对等同步（`/ws`、`sync-connect`、WebRTC）        | 对等方交换模式版本。若数字不同，则不交换任何数据，双方记录 `SCHEMA_MISMATCH` 并写明两个版本；较旧的一方必须更新应用。                                                                        |

### 来自较新版本的存储：`STORE_TOO_NEW`

若存储由较新的应用写入（版本高于 `CURRENT_SCHEMA`），应用**绝不写入**：服务器保持关闭，命令以“this store was written by a newer version; update the app”停止。只读打开同样被拒绝，以免误读数据。请更新应用（或用写入它的应用打开该存储）。

### 磁盘空间不足：`LOW_DISK`

迁移只向日志追加，但仍需要空间。开始前可用空间至少为 `data.lino` 的 10% 加 256 MB；否则不做任何改动，并告知需要多少、剩余多少。释放空间后重新启动即可。

## 回滚：失败的迁移如何不复制存储而被撤销

`data.lino` 只追加，因此迁移通过截断来撤销：

1. 第一个迁移之前，日志被刷新到磁盘，其字节长度被持久地写入 `migration.json`。
2. 迁移期间暂停压缩（日志只追加），也不写二进制快照 `data.bin`。
3. 每个迁移完成后，追加其 `meta:schema` 链接，`migration.json` 前移到新长度。两个迁移之间停止，则保留第一个。
4. 最后删除 `migration.json`。
5. 若迁移抛出错误，或进程死亡且下次打开发现 `migration.json`：`data.lino` 被截断到记录的长度（fsync），`data.bin` 被删除（由日志重建），日志文件被移除（`migration_rolled_back`）。同一次打开随后再试一次。若再次失败，应用报告带迁移 id 的 `MIGRATION_FAILED`，存储保持原样。

不会产生存储的第二份副本，内存也保持在存储本来占用的水平（迁移以每批 1000 份副本查看链接）。

**浏览器存储**是整体保存的快照，没有日志可截断：其迁移是幂等的，每个迁移后保存 `meta:schema`，中途关闭的标签页会重新执行该迁移并得到相同结果。来自较新构建的浏览器存储不会被触碰（页面使用临时副本并触发 `ms-schema-too-new` 事件）。

## 编写迁移

检查清单：

1. **模块** `js/src/storage/migrations/<NNNN>-<slug>.js`，导出 `id`（不含 `.js` 的文件名）、`from`（`NNNN-1`）、`to`（`NNNN`）、`description` 和 `async up(ctx)`。在 `index.js` 的 `MIGRATIONS` 中加入导入和条目，并把 `CURRENT_SCHEMA` 提到 `to`。不得导入 `node:`，不得联网：它是纯数据转换，必须也能在浏览器中运行。
2. **幂等且只向前。** 崩溃后再次运行 `up` 必须得到相同结果：从已存字段计算目标形状，只写入不同之处（`ctx.putMany` 会跳过已相等的链接，只统计真实改动）。
3. **旧形状存储的夹具测试**：按上一个版本存储的方式构造链接（参见 `js/tests/migrations-email.test.js`；最好由当前代码写入的内容推导），迁移后与当前代码会存储的内容比较。
4. **幂等测试**：运行两次（`runMigrations(store, { migrations, from: <旧版本> })`）；第二次改动 0 条。
5. **dry-run 计数**：同一夹具通过 `migrate --dry-run`（或 `runMigrations(..., { dryRun: true })`）报告改动的链接数且不写入。
6. **文档行**：在下表中加一行，并说明哪些无法由已存数据重新计算（以及旧记录仍可读取）。
7. 迁移发布并运行一段时间之前，读取代码继续接受旧形状（只读打开不迁移）。

`ctx` 提供：

- `ctx.scan({ prefix, where, batchSize }, async (batch) => ...)`：成批的匹配链接副本；`ctx.get(id)`。
- `ctx.putMany(links)` / `ctx.put(link)`：写入有变化的链接；`ctx.tombstone(id)`：删除一条。
- `ctx.rekey(oldId, newId, { patch })`：把链接写到新 id 下，保留指向它的 `alias:<oldId>` 链接，并把旧 id 标记删除。`newId` 下已有的不同链接不会被覆盖（计入 `ctx.stats.conflicts`）。`ctx.rekeyMany(pairs, { fields, children, refMap })` 对多对 id 执行，然后一次遍历，把 `children` 条目、列出的标量 `fields`（如 `replyTo`）以及 `refMap(text)` 映射的内容（嵌入更长 id 中的 id）指向新 id。`ctx.resolve(id)` 沿别名解析，因此仍引用旧 id 的回复、表情回应或聊天成员关系依然能找到目标。
- `ctx.log(name, counts)`：只含数字的日志行；`ctx.progress({ scanned, changed })`；`ctx.dryRun`。

## 迁移列表

| Id                   | 模式   | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001-email-threads` | 0 -> 1 | 由原始 RFC 822（IMAP、POP3、`.eml`、`.mbox`）读取的邮件获得 R-Z5 使用的会话键（`References` 的第一个 id，否则 `In-Reply-To`，否则自身 `Message-ID`，否则去前缀的主题）、父邮件、`messageId` / `references` / `inReplyTo`，并把 `timestamp` 改为 ISO 时间；所有邮件的时间都改为 ISO。由已存的 `rawHeaders` 和 `subject` 重新计算。无法从已存数据恢复：encoded-word 主题的解码形式，以及没有 Message-ID 的邮件的 id；它们保持原样且仍可读取。 |

### 其他工作宣布的形状变化（各自按此约定添加迁移）

| 变化                                                                     | 如何适配                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| R-Z7：删除标记统一为 `deleted: { at, by, reason }`                       | 扫描带 `deleted: true` 或 `deletedAt` 的链接；`ctx.putMany`。                          |
| R-Z10：Facebook / LinkedIn 消息 id；Facebook `timestamp_ms` 数字改为 ISO | id 用 `ctx.rekeyMany`（别名使回复和表情回应仍可解析）；时间用 `scan` + `putMany`。     |
| R-Z9：WhatsApp 聊天 id 由标题式改为稳定式                                | `ctx.rekeyMany`，配合 `fields: ['chat']` 与针对 `chat:whatsapp:<id>` 子项的 `refMap`。 |
| R-Z11：GitHub 条目新增 `externalId`                                      | `scan` + `putMany`，尽可能由已存的 URL / id 回填。                                     |

## Telegram 的 `SCHEMA_REV` 是另一回事

`telegram-layer.js` 中的 `SCHEMA_REV` 表示聊天上次是用哪一层 Telegram API 读取的；它变化时 `telegram-repair.js` 会从网络重新读取聊天。迁移不得使用网络，所以两者保持分离：迁移改变已存数据的形状，修复则重新向 Telegram 询问新一层能提供的内容。
