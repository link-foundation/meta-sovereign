# VK 历史保留策略

打开连接 → VK → 历史保留策略。自动计划默认关闭。填写明确的对话 ID、严格的消息数阈值，以及高于阈值的检查上限。支持负数 ID 和群聊 ID。受保护的绝对 ID 与全局退出列表中的对话均会跳过。

审核显示账号、配置的历史、服务端消息数、匹配的本地消息数和保留的删除凭据。只确认当前展示的计划；设置、凭据、账号、历史、本地内容改变或审核过期后会拒绝执行。超过有限检查上限的历史不会删除。

当前 messages.deleteConversation 方法仅为此账号清理历史。只有明确的 VK 错误 3 才允许改用 messages.delete，使用已审核的 cmids 和 delete_for_all=0，每批最多 100 条、间隔两秒。超时、丢失回复或无效确认绝不触发备用方法或自动重试。本地清理前须重新读取服务端历史以核对结果。

部分完成会保留已确认 ID 和凭据。重启后须手动审核才能处理原计划的剩余消息，自动计划无法继续部分删除。本地记录按服务端 ID、对话、文字和时间匹配，内容保留为可恢复删除标记，并沿用因果同步语义。其他服务和未审核记录均不受影响；此操作不会物理清除数据。

前台 CLI:

```sh
meta-sovereign vk-retention save --peers=9,-12 --threshold=1000 --scan-limit=2000 --enabled=false
meta-sovereign vk-retention plan
meta-sovereign vk-retention run --plan=<reviewed-plan-id> --confirm=true
meta-sovereign vk-retention status
```

`/api/vk/retention` · `POST /plan` · `POST /run` · Lino text / binary.
