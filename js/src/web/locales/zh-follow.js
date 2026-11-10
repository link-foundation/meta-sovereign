export const zhFollow = {
  'follow.title': 'Follow：发现 Telegram 链接',
  'follow.hint':
    '从各平台已缓存的接收消息中提取链接。每条记录保留来源消息。识别链接不会验证访问权限或加入聊天。 使用已连接服务器的缓存；未配置服务器时，使用此浏览器的存储。',
  'follow.scope': '缓存消息范围',
  'follow.source': '平台（留空：全部）',
  'follow.chat': '聊天 ID（留空：全部）',
  'follow.self': '您的账号标识，用逗号分隔',
  'follow.limit': '接收消息数量上限（0：整个缓存档案）',
  'follow.filterHint':
    '排除发出的消息。如果导入消息没有发出标记，请提供您的账号 ID。缓存可能含有私人邀请链接，请妥善保密。',
  'follow.load': '加载缓存记录',
  'follow.extract': '提取接收消息链接',
  'follow.clear': '清空筛选范围内的缓存',
  'follow.clearAsk': '删除符合这些筛选条件的链接缓存记录？来源消息将保留。',
  'follow.confirmClear': '清除这些记录',
  'follow.cancel': '取消',
  'follow.working': '处理中…',
  'follow.extracted':
    '已扫描 {messages} 条匹配接收消息中的 {scanned} 条。找到 {found} 条记录，新增 {added} 条。',
  'follow.limited':
    '提取不完整：已达到消息上限，或 {count} 条消息的字段超过提取限制。现有记录已保留。',
  'follow.cleared': '已删除 {count} 条缓存记录。',
  'follow.failed': '无法确认缓存操作。重试前请加载缓存以检查状态。',
  'follow.total': '{count} 条包含来源消息的缓存记录',
  'follow.kind.public': '待验证的公开用户名',
  'follow.kind.invite': '待验证的私人邀请',
  'follow.kind.message': '公开消息链接',
  'follow.kind.private-message': '私人消息链接；需要已有访问权限',
  'follow.provenance': '{source} · 聊天 {chat} · 发送者 {sender}',
  'follow.previous': '上一页记录',
  'follow.next': '下一页记录',
};
