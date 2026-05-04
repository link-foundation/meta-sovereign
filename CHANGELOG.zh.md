# 更新日志 (languages: [en](CHANGELOG.md) • zh • [hi](CHANGELOG.hi.md) • [ru](CHANGELOG.ru.md))

本文件是面向中文读者的发布记录。版本号、提交哈希、命令名和
API 名称保持原文，以便能和 npm、GitHub Releases 以及英文
[`CHANGELOG.md`](./CHANGELOG.md) 对照。

## 0.13.0

### 次要变更

- R-N1..R-N10: 将 email 作为一等数据源加入：支持 `.eml`/mbox
  导入、浏览器直连 Gmail、Microsoft Graph 和 JMAP 的收发、本地
  Node 服务器的 IMAP/POP3/SMTP 传输、邮件 HTTP 路由、CLI 命令、
  连接指南文案，以及 issue #3 的案例研究。纯 Rust 服务器同步
  了同一线协议表面：`email` 出现在 `/sources`，`/api/email/pull`
  和 `/api/email/send` 接受同样的归档导入和发送队列 JSON。

## 0.12.0

### 次要变更

- R-M1..R-M18: 用连接指南替代所有空的 SPA 区块，加入可识别
  CORS 的直连 API 探测和同源服务器回退，并提供分步教程覆盖层。
- R-N1..R-N9: 将教程的当前步骤和完成状态保存在
  `metaSovereignTutorial` 中，刷新后从当前步骤继续，而不是回到第
  一步。

## 0.11.0

### 次要变更

- R-L1..R-L15: 将可在浏览器中直接工作的功能发布到 GitHub Pages，
  重写用户友好的文档，并完成 CI/CD 对齐审计。
- 文档新增 `docs/USER-GUIDE.md`、`docs/SERVER-PARITY.md` 和
  issue #8 案例研究；JS 代码与工具迁移到 `js/`，Rust workspace
  保持独立。

## 0.10.0 及更早

早期版本建立了本项目的本地优先基础：双存储、`.lino` 导入导出、
加密备份、软删除、GitHub Pages 发布、WebRTC/WebSocket 同步、React
SPA、Electron/Capacitor 外壳、纯 Rust 服务器以及跨运行时测试矩阵。
完整的逐条历史请参见英文
[`CHANGELOG.md`](./CHANGELOG.md)；本地化版本保留面向用户的摘要，避
免复制生成式发布日志中的全部内部细节。
