# HTTP 传输（语言：[en](HTTP-TRANSPORT.md) • zh • [hi](HTTP-TRANSPORT.hi.md) • [ru](HTTP-TRANSPORT.ru.md)）

JavaScript 服务端使用 `lino-rest-api` 传输结构化 HTTP 消息。默认响应为 `text/lino`。通过 `Accept: application/lino-binary` 请求二进制 Links Notation。写入时在 `Content-Type` 中指定相同类型；也支持 `text/lino-line` 和 `text/lino-compact`。二进制格式编码带类型的对象语法树，保留字符串、数字、Unicode 和空容器。

不支持的请求格式返回 415。无法满足的响应格式在执行修改之前返回 406。`Accept` 中更具体的排除规则优先于通配符。Origin、Host、口令、秘密隐藏及大小检查继续生效。普通请求上限为 1 MiB；归档路由原有的较大上限保持不变。解码器还限制输入大小、嵌套深度及二进制图展开规模。

JSON 兼容默认关闭。旧客户端必须在服务端显式启用：

```bash
node js/bin/meta-sovereign.js serve --json-compatibility=true
```

库选项为 `startServer({ jsonCompatibility: true })`，环境变量为 `MS_JSON_COMPATIBILITY=1`。兼容模式允许客户端请求 `application/json`，显式 Lino 请求仍然有效。新浏览器客户端使用 Lino，默认拒绝意外的 JSON 响应。提供方 API、下载文件及原始媒体/归档上传保留各自格式。

实时变更和 Telegram 账号通知流使用 `text/event-stream`，每个 data 字段包含一条 `text/lino-line` 记录。浏览器请求 `?format=lino-line`，也适用于启用兼容模式的服务端。编解码器转义消息中的换行。JSON 事件要求服务端启用兼容模式，否则 `?format=json` 返回 406。重连、Origin 检查、秘密过滤及慢客户端处理保持有效。

JavaScript WebSocket 同步和 WebRTC 信令协商 `meta-sovereign-sync.lino.v2`（文本）或 `meta-sovereign-sync.lino-binary.v2`（二进制）。WebRTC 数据通道声明相同协议。客户端拒绝缺失或不匹配的选择。旧版 `meta-sovereign-sync.v1` JSON 要求双方显式启用兼容模式。未声明协议的连接默认使用文本 Lino；服务端显式启用兼容模式时使用旧版 JSON。消息和连接前队列均限制为 4 MiB；超大或无效入站帧会关闭连接。来源检查、房间隔离和秘密过滤保持有效。参见[同步调查](case-studies/issue-56/lino-sync.md)。

JavaScript TCP 同步使用相同的版本化协议。双方先发送配置的协议名和换行，再发送由四字节无符号大端字节长度及所选 Lino 正文组成的记录。默认文本格式；双方通过 `--sync-format=binary` 选择二进制（库选项：`format: 'application/lino-binary'`）。不会自动回退。记录及队列限制为 4 MiB，协议前缀为 128 字节，握手为 10 秒。旧版换行 JSON 要求双方使用 `--sync-format=json --json-compatibility=true`。监听器仍仅绑定回环地址。CLI 同步命令持续运行直到中断，然后关闭连接、刷写并释放存储。

R-AA16 尚未完成：Rust 后端仍需协议迁移和验证。原生服务端功能一致性仍待完成。参见[需求清单](REQUIREMENTS.zh.md)和 [HTTP 传输调查](case-studies/issue-56/lino-http.md)。
