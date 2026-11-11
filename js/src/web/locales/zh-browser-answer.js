export const zhBrowserAnswer = {
  'browserText.title': '已审阅的文本回复',
  'browserText.draft': '回复文本',
  'browserText.hint':
    '发送前请审阅每条待回复消息。服务方输入框必须为空；新的发出消息回执才表示送达。',
  'browserText.send': '发送已审阅的文本回复',
  'browserText.recover': '恢复回复状态',
  'browserText.sending': '回复正在发送。执行其他操作前请恢复其状态。',
  'browserText.sent': '服务方已确认此文本回复。',
  'browserText.unknown':
    '回复可能已送达。请检查服务方聊天并在发件箱中处理；不会自动重试。',
  'browserText.failed': '回复被拒绝。再次尝试前请读取当前问题。',
  'browserText.unconfirmed':
    '正在等待回复回执。若中断，请在再次发送前恢复服务器状态。',
  'browserText.ownerDraft':
    '服务方输入框中已有草稿。发送文本回复前请先在那里审阅。',
  'browserAnswer.latestAfterCompleted':
    '之前已完成的摘要或已批准无需回复的通知不需要答复。选项仅适用于最新消息。',
  'questions.match.pending-turn': '待回复消息的答案',
  'browserAnswer.wholeTurn': '草稿涵盖所有待回复消息。填入前请逐一检查答案。',
  'browserAnswer.turn': '已显示的待回复消息：{count}',
  'browserAnswer.latestOnly':
    '下面的答案仅针对最后一条消息。更早的消息仍需审核。',
  'browserAnswer.boundary.outgoing':
    '最后一条已显示的本人回复之后的消息。更早的历史尚未核实。',
  'browserAnswer.boundary.service':
    '最后一条已显示的系统事件之后的消息。更早的历史尚未核实。',
  'browserAnswer.boundary.rendered-start':
    '未显示更早的本人回复或系统事件。更早的历史未知。',
  'browserAnswer.boundary.unknown':
    '此核对仅包含最后一条消息。待回复的对话上下文未知。',
  'questions.match.accepted-summary': '已接受的答案摘要',
  'questions.acceptedSummary.matched': '已完成问卷的摘要与当前选项一致。',
  'questions.acceptedSummary.conflict':
    '已保存的摘要无法确定唯一的当前选项。请检查问题。',
  'questions.acceptedSummary.limited':
    '无法完整检查已保存的历史记录。请检查问题。',

  'browserAnswer.title': '服务浏览器答复',
  'browserAnswer.hint':
    '读取所选服务的聊天并核对所有待回复消息。发送一个现有选项，或在服务支持时审核文本回复。已有草稿会保留。恢复状态不会再次发送。',
  'browserAnswer.source': '服务',
  'browserAnswer.chat': '网页聊天引用',
  'browserAnswer.url': '申请页面 URL（可选）',
  'browserAnswer.inspect': '读取当前问题和选项',
  'browserAnswer.options': '当前可选答案',
  'browserAnswer.select': '在服务聊天中发送“{option}”',
  'browserAnswer.prefill': '填入已核对的草稿',
  'browserAnswer.prefilled': '草稿已填入；请在服务聊天中核对',
  'browserAnswer.recover': '恢复选择状态',
  'browserAnswer.reload': '重新读取浏览器能力和上次核对',
  'browserAnswer.unavailable': '请连接支持浏览器答复的服务器以使用这些控件。',
  'browserAnswer.review': '操作前请核对服务的当前问题。',
  'browserAnswer.sending': '正在选择。再次操作前请恢复其状态。',
  'browserAnswer.sent': '服务已确认所选答案。',
  'browserAnswer.markedSent': '您已在发件箱中将该答案标为已发送。',
  'browserAnswer.unknown':
    '选择可能已发送。请检查服务聊天并在发件箱中确认状态；系统不会自动重试。',
  'browserAnswer.failed': '选择被拒绝。重试前请读取当前问题。',
  'browserAnswer.receipt': '服务消息回执：{id}',
  'browserAnswer.ownerDraft': '服务输入框中有草稿。选择选项前请在那里核对。',
  'browserAnswer.pending':
    '答案控件尚未出现或已禁用。出现后请重新读取当前问题。',
  'browserAnswer.expired': '本次核对已过期。请重新读取当前问题。',
  'browserAnswer.error':
    '浏览器答复状态未确认（{code}）。请恢复状态或重新读取当前问题。',
  'browserAnswer.unconfirmed':
    '选择响应尚未确认。再次选择前，请恢复服务器状态。',
  'browserAnswer.outgoing':
    '提供方的最新消息是已发出的消息。收到新问题后请重新读取。',
  'browserWatch.hint':
    '监看此聊天中的已知答案。精确获准答案和完整摘要中的唯一匹配可以自动点击原生选项。普通文本仅填入草稿。保留所有者的编辑。导航、重新加载或结果不明的选择会暂停监看；重启服务器不会恢复监看。',
  'browserWatch.minutes': '分钟（1–120）',
  'browserWatch.start': '监看此聊天并选择已知答案',
  'browserWatch.unconfirmed':
    '监看启动尚未确认。再次启动前请恢复已保存的状态。',
  'browserWatch.active': '正在监看此平台聊天。',
  'browserWatch.paused': '监看已暂停。再次启动前请检查平台聊天。',
  'browserWatch.stopped': '监看已停止；待处理操作已结束。',
  'browserWatch.reason': '监看详情：{code}',
  'browserWatch.recover': '恢复监看状态',
  'browserWatch.stop': '停止监看并等待',
  'browserWatch.phase.starting': '正在打开已检查的聊天。',
  'browserWatch.phase.waiting': '正在等待新的收到的问题。',
  'browserWatch.phase.owner-draft': '已保留所有者的草稿。',
  'browserWatch.phase.pending-options': '正在等待回答控件出现或启用。',
  'browserWatch.phase.review': '此问题需要手动检查。',
  'browserWatch.phase.ready': '正在准备已知答案。',
  'browserWatch.phase.prefilled': '已填入草稿，等待检查。',
  'browserWatch.phase.sent': '平台已确认所选答案。',
  'browserWatch.phase.unknown':
    '选择可能已发送。请在发件箱核实结果；自动选择已暂停。',
  'browserWatch.phase.failed': '选择被拒绝；监看已暂停。',
  'browserWatch.phase.marked-sent': '您已在发件箱将先前的选择标记为已发送。',
  'browserWatch.selected': '上次确认的选项：{option}',
  'browserWatch.phase.selecting': '正在选择原生选项；请等待回执。',
};
