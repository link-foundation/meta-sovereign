# 已保存的问卷

聊天、求职申请和外部表单共用回答规划器。读取当前规则以生成方案时，
它会从已保存的完整问卷中索引明确对应的编号回答。编号、项目符号和分行问题的
条件追问、说明及代码保留在所属问题中。对应关系不明确时保留整段；完整已保存回答优先。

即使完整回答已获批准，提取的分项仍需审核。服务和聊天限制、明确更正、当前薪酬及
联系方式上下文和缺失值检查仍然有效。读取不会写入派生规则或发送内容。新组合的问卷也需审核。

原生求职申请的预填和精确回答自动提交也要求已批准且无歧义的已保存回答。
提取、未批准或冲突的回答仍须由所有者审核，即使字段内容与其措辞相同。
所有者可以填写原生表单，再单独确认提交。

在 **问题与已保存的回答 → 从对话中学习** 中，可同时预览已保存问卷的分项及存档回答，
然后保存建议供审核。保存的措辞增加零次使用；只有实际发出的存档回复增加频率。
重复运行不会重复计数，也会保留批准状态。此操作不会下载服务商历史。

离线命令：

```sh
meta-sovereign automations answers backfill-questionnaires
meta-sovereign automations answers backfill-questionnaires --apply
```

`answers learn` 包含相同操作。两种 Links Notation 编码均支持
`POST /api/automations/answers/backfill-questionnaires` 和 `/api/automations/answers/learn`。
`apply: false` 仅预览，`apply: true` 保存建议。容量不足或知识并发变化时拒绝应用；请重新预览。
