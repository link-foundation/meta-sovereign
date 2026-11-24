export const zhUnreadReview = {
  'browserUnread.summary.saved': '已保存摘要中的答案（{count}）。无需回复。',
  'browserUnread.summary.hold': '请在此聊天中核对摘要。下一个聊天将继续等待。',
  'browserUnread.form.enable':
    '准备链接中的问卷和 HeadHunter 评分投票，供我审核',
  'browserUnread.answer.form-review': '已在表单页面打开，可进行审核。',
  'browserUnread.form.rating-ready':
    '已输入公司名称。请在 HeadHunter 上自行评分并提交。',
  'browserUnread.form.rating-closed': 'HeadHunter 已结束本次投票。',
  'browserUnread.form.rating-sign-in': '请在投票窗口登录 HeadHunter 后继续。',
  'browserUnread.form.rating-unavailable':
    '请在 HeadHunter 投票窗口检查公司搜索。',
  'browserUnread.form.prefilled': '已预填 {count} 个字段。提交前请检查问卷。',
  'browserUnread.form.partial':
    '已预填 {count} 个字段。请检查问卷并填写剩余字段。',
  'browserUnread.form.waiting-owner': '请前往表单页面处理问卷。',
  'browserUnread.form.refused': '无法准备问卷。',
  'browserUnread.form.slot-limit':
    '所有表单槽位均已占用。请释放一个槽位以准备问卷。',
  'browserUnread.form.unconfirmed':
    '无法确认问卷填写结果。修改前请检查当前页面。',
  'browserUnread.form.closed': '问卷已在现已关闭的审核会话中准备。',
  'browserUnread.form.open': '在表单中检查 {slot}',
  'browserUnread.answers': '处理机器人选项，普通回复留待审核',
  'browserUnread.answersHint':
    '在未激活的服务窗口中逐一检查未读聊天。完整摘要中的答案会保存以供审核。精确匹配的已保存答案、完整摘要中的唯一匹配，以及获准薪资目标对应的唯一区间可选择机器人选项。普通回复会保留为草稿。后续检查会等待你审核第一个待处理聊天。可以单独启用模型草稿。',
  'browserUnread.startAnswers': '逐一处理未读答案',
  'browserUnread.activeAnswers':
    '正在检查未读问题。可选择已批准的机器人选项；普通回复保留为草稿供你审核。',
  'browserUnread.pausedAnswers':
    '答案处理已暂停。开始新一轮前请检查保留的聊天和已保存发件箱。恢复状态不会重复操作。',
  'browserUnread.held':
    '聊天 {chat} 已保持打开供审核，草稿已保留。重复检查只查看此聊天，直到你回复或无需回复。',
  'browserUnread.answer.review': '需要你审核。',
  'browserUnread.answer.no-reply': '无需回复。',
  'browserUnread.answer.pending-options': '正在等待机器人提供选项。',
  'browserUnread.answer.owner-draft': '你原有的草稿已保留。',
  'browserUnread.answer.prefilled': '草稿已准备供审核；未发送文字。',
  'browserUnread.answer.selecting': '正在选择精确匹配的机器人选项。',
  'browserUnread.answer.sent': '已通过发出消息确认机器人选项。',
  'browserUnread.answer.marked-sent': '你已将此选择标记为已发送。',
  'browserUnread.answer.unknown': '选项的送达情况不确定；请检查服务聊天。',
  'browserUnread.answer.failed': '选项已被拒绝；请检查已保存结果。',

  'browserUnread.restoredReply':
    '已恢复原聊天、筛选条件和空白输入框。已显示确认的回复 {id}，而非先前的阅读位置。',
  'browserUnread.replyNotRevealed':
    '回复 {id} 已确认，但未显示。优先保留所有者的草稿和阅读位置；请检查服务窗口。',
  'browserUnread.title': '未读会话',
  'browserUnread.hint':
    '在已连接且未激活的服务窗口中读取有限数量的未读聊天。请保持该窗口未激活，直到本次读取结束。已保存的答案用于生成待审核内容；本次读取不会发送回复或调用模型。可见列表和历史记录可能不完整。',
  'browserUnread.limit': '聊天数量上限（1–100）',
  'browserUnread.confirm': '打开聊天可能会将消息标记为已读。',
  'browserUnread.start': '读取未读聊天以供审核',
  'browserUnread.unconfirmed':
    '开始新读取前，请恢复已保存的读取状态。恢复状态不会再次打开聊天。',
  'browserUnread.recover': '恢复未读读取状态',
  'browserUnread.stop': '停止未读读取并等待',
  'browserUnread.active': '正在读取未读会话。不会发送回复。',
  'browserUnread.completed': '本次未读读取已结束。请审核下方发现的问题。',
  'browserUnread.failed': '本次未读读取失败。再次开始前请检查服务窗口。',
  'browserUnread.stopped': '本次读取已停止，待处理操作已结束。',
  'browserUnread.paused':
    '当前服务器会话不拥有已保存的读取任务，也不会自动重新启动它。',
  'browserUnread.coverage':
    '已访问发现的 {observed} 个聊天中的 {visited} 个。这不能证明已找到所有未读聊天或消息。',
  'browserUnread.restored': '服务窗口的原始视图已恢复。',
  'browserUnread.history':
    '浏览器历史记录条目：读取前 {before}，读取后 {after}。',
  'browserUnread.notRestored':
    '原始视图未能完全恢复。请检查服务窗口；已保留所有者的新更改。',
  'browserUnread.review': '审核聊天 {chat}',
  'browserUnread.unverified': '聊天 {chat} 没有经过验证的问题审核。',
  'browserUnread.notices': '应用已启用的申请确认和拒绝回复规则',
  'browserUnread.noticesHint':
    '在已连接且未激活的服务窗口中进行有限检查。验证完整历史后，已启用的保存规则可发送完全匹配且已批准的申请确认回复，或每个聊天一次的指定拒绝回复。请保持窗口未激活。问题和邀请保留待审核；不会调用模型。',
  'browserUnread.startNotices': '对未读聊天应用通知规则',
  'browserUnread.activeNotices':
    '正在访问未读聊天并应用已启用的通知回复规则。请等待实际发送和视图恢复凭据。',
  'browserUnread.pausedNotices':
    '通知回复已暂停。开始下一轮前请检查保存的结果和发件箱。此轮检查不会自动重启。',
  'browserUnread.polling': '重复检查未读会话',
  'browserUnread.pollingHint':
    '每次检查都在服务窗口未激活时使用相同的已确认设置。停止会等待已开始的操作结束。发送或视图恢复结果不确定时会暂停；恢复状态不会重新启动。',
  'browserUnread.intervalMs': '检查间隔（秒，1–7200）',
  'browserUnread.durationMs': '运行时长（分钟，1–1440）',
  'browserUnread.retryMaxMs': '重试最大间隔（秒，不小于检查间隔）',
  'browserUnread.maxFailures': '暂停前连续失败次数（1–10）',
  'browserUnread.poll.starting': '正在启动重复未读检查。',
  'browserUnread.poll.visiting':
    '一轮检查正在进行。下方显示的记录属于标明的检查轮次。',
  'browserUnread.poll.waiting': '等待下一次未读检查。',
  'browserUnread.poll.owner-active': '服务窗口已激活。等待期间不会打开会话。',
  'browserUnread.poll.backoff':
    '确定尚未执行或已恢复视图的空检查失败。等待重试。',
  'browserUnread.poll.settled': '重复检查已停止或暂停。恢复状态不会继续运行。',
  'browserUnread.pollCounts':
    '已结束轮次：{passes}。连续失败：{failures}/{max}。结束时间：{expires}。',
  'browserUnread.pollNext': '下次检查时间：{next}。',
  'browserUnread.pollReceipt': '显示的记录来自轮次 {id}。',
};
