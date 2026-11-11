export const zhForms = {
  'forms.automatic.action': '填充空字段',
  'forms.automatic.recover': '恢复填充结果',
  'forms.automatic.hint':
    '为受支持的空字段填写完整答案，并附加已配置的已保存 PDF。网站可能立即保存或上传更改。保留现有答案。请检查每个答案，并自行翻页和提交。',
  'forms.automatic.error':
    '结果未确认（{code}）。请检查浏览器或恢复同一请求；恢复使用原始设置。',
  'forms.automatic.title': '自动填充结果',
  'forms.automatic.unresolved': '仍有 {count} 个问题需要检查或回答。',
  'forms.automatic.next':
    '检查当前答案，自行打开下一页，再填充新页面。完成后请自行提交表单。',
  'forms.automatic.review': '检查当前答案并补全待回答的问题。请自行提交表单。',
  'forms.reason.owner-verification':
    '检测到人工验证。请在审阅浏览器中完成；验证内容不会作为答案读取。',
  'forms.reason.captcha-frame': 'CAPTCHA 框架已排除在答案检查之外。',
  'forms.automatic.state.waiting-owner': '正在等待您在审阅浏览器中完成验证。',
  'forms.automatic.state.prefilling': '验证已完成。填写前正在检查表单。',
  'forms.automatic.wait':
    '请在 {time} 前自行完成 CAPTCHA。使用“聚焦”打开可见的审阅窗口，或使用“关闭”取消等待。验证码内容不会用于答案学习。',
  'forms.automatic.state.prefilled':
    '已填写并核对受支持的空字段。请检查当前表单。',
  'forms.automatic.state.partial':
    '部分字段仍待回答或无法确认。请检查当前表单。',
  'forms.automatic.state.uncertain':
    '某次更改的结果不确定。再次请求前请检查当前表单。',
  'forms.automatic.state.refused':
    '填充流程已被拒绝。请检查已确认的更改，并重新读取当前页。',
  'forms.journal.action.prefill': '填充空字段',
  'forms.capacity.label': '此处控制的审核浏览器上限',
  'forms.capacity.hint':
    '保存在此存储中。每个控制器默认为四个；请按服务器资源设置容量。分离的观察器单独列出。提高上限不会启动浏览器。',
  'forms.capacity.save': '保存浏览器容量',
  'forms.review.error.form-capacity-invalid': '请使用正整数设置浏览器容量。',
  'forms.review.error.form-capacity-changed':
    '浏览器容量已更改。请刷新会话后再保存。',
  'forms.review.error.form-capacity-in-use':
    '请先关闭审核浏览器，再将容量降至当前占用数量以下。',
  'forms.review.error.form-capacity-unavailable':
    '无法在此存储中保存浏览器容量。',

  'forms.resume.title': '已保存的 PDF 简历',
  'forms.resume.hint':
    '将一份 PDF 保存到私人存储中以便重复使用。每份表单仍需明确执行附件操作；保存不会将文件上传到表单。',
  'forms.resume.loading': '正在加载已保存的 PDF…',
  'forms.resume.saved': '{name} · {size} 字节',
  'forms.resume.empty': '尚未保存 PDF。',
  'forms.resume.save': '保存所选 PDF',
  'forms.resume.delete': '删除已保存的 PDF',
  'forms.resume.reload': '重新加载 PDF 信息',
  'forms.resume.changed': '已保存的 PDF 已更改。请重新加载并检查新计划。',
  'forms.resume.error': '无法更新已保存的 PDF（{code}）。重试前请重新加载。',
  'forms.resume.attach': '附加已保存的 PDF：{name} · {size} 字节',
  'forms.resume.unknown': '无法获取已保存 PDF 的状态。',

  'forms.learning.observed': '已考虑的实际答案（包括跳过的答案）',
  'forms.learning.enable': '从已规划的页面学习答案',
  'forms.learning.scope':
    '规划每一页后，在观察到提交完成或用户修改保持一分钟不变时，将可重复使用的答案保存为未批准的建议。未修改的预填答案不会在提交前学习。关闭捕获也会关闭学习。',
  'forms.learning.waiting-plan': '学习已就绪。请规划此页面以选择要观察的问题。',
  'forms.learning.watching':
    '学习已开启 · {tracked} 个答案 · 已保存 {saved} 个建议 · 跳过 {skipped} 个 · 遗漏 {omitted} 个 · {failed} 次失败。',
  'forms.learning.disabled': '答案学习已关闭。',
  'forms.learning.incomplete':
    '由于捕获不完整，学习已暂停。请重新规划当前页面；先前未捕获的答案无法学习。',
  'forms.learning.failed':
    '多次失败后学习已暂停。请检查保存的答案并重新规划以重试。',
  'forms.learning.stopped': '答案学习已停止。',
  'forms.learning.result':
    '{kind}：已保存 {saved} 个未批准建议 · 跳过 {skipped} 个。',
  'forms.learning.kind.observed-submission': '观察到提交完成',
  'forms.learning.kind.stable-owner-edit': '用户修改已保持一分钟不变',
  'forms.journal.action.learn': '学习答案',

  'forms.monitor.capture': '自动捕获页面',
  'forms.monitor.scope':
    '编辑或打开后续页面时，捕获可见问题和当前值。这不能确认已提交，也不会学习答案。',
  'forms.monitor.active':
    '自动捕获 {captured} 次 · 省略 {omitted} 次 · 失败 {failed} 次。',
  'forms.monitor.disabled': '自动捕获已关闭。请读取每个页面以保留快照。',
  'forms.monitor.unavailable': '自动捕获不可用。请读取每个页面以保留快照。',
  'forms.monitor.stopped': '自动捕获已停止。',
  'forms.navigation.next':
    '检测到“下一页”控件。请在表单浏览器中打开下一页，然后读取并规划当前问题。',
  'forms.reason.other-documents-not-sampled':
    '此自动快照仅包含一个文档；其他框架未在同一时刻读取。',
  'forms.journal.action.observe': '自动捕获',
  'forms.journal.previous':
    '操作后无法读取页面。此检查点显示上一次审阅的快照，不能确认当前值。',
  'forms.downloadMarkdown': '下载 Markdown',
  'forms.reportSaved': 'Markdown 报告已保存：{path}',
  'forms.reportFailed': '无法保存 Markdown 报告。请下载副本以保留报告。',
  'forms.review.history': '已捕获页面',
  'forms.journal.title': '已捕获的表单页面',
  'forms.journal.scope':
    '这些内容来自当前会话中的明确读取、规划、已验证操作和已启用的自动捕获。捕获之间的页面或编辑可能缺失。日志有数量和大小限制，保留到会话关闭；导出的报告仍会保留。快照不能证明已提交或已学习答案。',
  'forms.journal.count': '保留 {count} 个快照 · 因保留上限省略 {omitted} 个',
  'forms.journal.entry': '{action} · {fields} 个字段 · {time}',
  'forms.journal.inspect': '查看快照',
  'forms.journal.action.read': '读取',
  'forms.journal.action.plan': '规划',
  'forms.journal.action.apply': '填写',
  'forms.journal.action.attach': '附加 PDF',
  'forms.journal.action.disclose': '查看选项',
  'forms.fill.unavailable': '请在表单浏览器中检查此字段；此处无法更改。',
  'forms.fill.radioChanges': '此选项还会取消选择：{fields}。',
  'forms.fill.radioReceipt': '{field} → 未选择：{status}',
  'forms.fill.existing':
    '现有答案将被更改。请检查所选更改，再允许替换或取消选择该字段。',
  'nav.forms': '表单',
  'forms.title': '检查表单',
  'forms.hint':
    '在独立的浏览器槽位中读取可见问题和当前值。检查会保留原有答案，完成后关闭浏览器。',
  'forms.loading': '正在检查浏览器是否可用…',
  'forms.unavailable': '请连接支持浏览器自动化的服务器以检查表单。',
  'forms.retry': '重新检查',
  'forms.url': '表单网址',
  'forms.slot': '浏览器槽位',
  'forms.slotHint':
    '命名槽位使用独立的登录配置。窗口是否可见取决于表单和槽位设置。',
  'forms.read': '读取当前页面',
  'forms.reading': '正在读取…',
  'forms.report': '检查报告',
  'forms.count': '已读取 {frames} 个文档中的 {fields} 个字段。',
  'forms.scope':
    '此快照仅涵盖当前页面上的可见控件。后续页面和关闭的自定义控件中可能还有问题。行 ID 仅适用于此快照。',
  'forms.partial': '部分内容无法检查：',
  'forms.download': '下载报告',
  'forms.empty':
    '未找到可见的表单字段。请在浏览器中检查页面、登录要求和验证码。',
  'forms.unlabelled': '无标签字段',
  'forms.group': '问题组：{label}',
  'forms.source': '标签：{source} · {type} · {frame}',
  'forms.required': '必填',
  'forms.disabled': '已禁用',
  'forms.readOnly': '只读',
  'forms.value': '当前值：{value}',
  'forms.mixed': '混合选择',
  'forms.checked': '已选中',
  'forms.unchecked': '未选中',
  'forms.omitted': '未读取 {type} 字段的内容。',
  'forms.label.aria-labelledby': '引用的无障碍文本',
  'forms.label.aria-label': '无障碍标签',
  'forms.label.label': '表单标签',
  'forms.label.placeholder': '占位提示',
  'forms.label.title': '标题提示',
  'forms.label.legend': '分组标题',
  'forms.label.heading': '前面的标题',
  'forms.label.unlabelled': '未找到标签',
  'forms.reason.unlabelled-controls': '部分控件没有可读取的问题标签。',
  'forms.reason.text-limit': '部分标签或描述超出文本长度上限。',
  'forms.reason.value-limit': '部分当前值超出文本长度上限。',
  'forms.reason.control-scan-limit': '已达到控件扫描上限。',
  'forms.reason.field-limit': '已达到字段数量上限。',
  'forms.reason.option-limit': '部分选项超出数量上限。',
  'forms.reason.unexpanded-options':
    '自定义选项控件处于关闭状态；检查未将其展开。',
  'forms.reason.shadow-scan-limit': '已达到自定义元素检查上限。',
  'forms.reason.custom-elements':
    '自定义元素或影子 DOM 中可能存在未读取的控件。',
  'forms.reason.frame-limit': '已达到框架数量上限。',
  'forms.reason.parent-frame-unavailable': '父框架不可用。',
  'forms.reason.hidden-frame': '未读取隐藏的框架。',
  'forms.reason.frame-unavailable': '无法读取某个框架。',
  'forms.error.form-url': '请输入不包含登录凭据的 HTTP 或 HTTPS 网址。',
  'forms.error.form-busy': '另一个检查仍在运行。请等待完成后重试。',
  'forms.error.form-changed':
    '检查期间表单发生了页面跳转。请重新读取当前页面。',
  'forms.error.form-timeout': '检查已达到时间上限。请检查页面后重试。',
  'forms.error.form-stopped': '检查在完成快照前停止。请在可用服务器上重试。',
  'forms.error.browser-unavailable':
    '此服务器不支持浏览器自动化。请检查浏览器配置。',
  'forms.error.bad-browser-policy':
    '槽位名称只能包含小写拉丁字母、数字、连字符或下划线。',
  'forms.error.server-required': '请连接支持浏览器自动化的服务器以读取表单。',
  'forms.error.form-read-failed':
    '无法读取表单。网址和上次报告已保留；请检查页面后重试。',
  'forms.plan.title': '答案建议',
  'forms.plan.hint': '使用已保存答案和可选的本人资料，为每个字段准备建议。',
  'forms.plan.reloadProfiles': '重新加载资料',
  'forms.plan.profile': '本人资料',
  'forms.plan.savedOnly': '仅使用已保存答案',
  'forms.plan.profilesLoading': '正在加载资料…',
  'forms.plan.profilesFailed': '无法加载资料。仍可使用已保存答案。',
  'forms.plan.approximate': '包含相似的已保存问题，供审核',
  'forms.plan.action': '生成答案建议',
  'forms.plan.planning': '正在生成建议…',
  'forms.plan.proposal': '建议：{value}',
  'forms.plan.unresolved': '需要补充答案',
  'forms.plan.source': '答案来源：{source}',
  'forms.plan.similarity': '问题相似度：{percent}%',
  'forms.plan.missing': '缺少的资料值：{keys}',
  'forms.plan.keys': '使用的资料值：{keys}',
  'forms.plan.rule': '已保存问题：{question}',
  'forms.plan.evidence': '依据：{source}',
  'forms.plan.count':
    '{proposed} 项建议 · {unresolved} 项待补充 · 已保留 {preserved} 个当前值',
  'forms.plan.review': '请逐项审核。生成建议不会修改、提交表单或学习答案。',
  'forms.plan.profileSource': '资料：{name} · 版本 {revision}',
  'forms.plan.modelUnavailable': '此建议工具暂不支持模型建议。',
  'forms.plan.source.profile': '本人资料',
  'forms.plan.source.exact': '完全匹配的已保存问题',
  'forms.plan.source.template': '已保存的问题模板',
  'forms.plan.source.approximate': '相似的已保存问题',
  'forms.plan.source.salary': '薪资设置',
  'forms.plan.source.assembled': '组合的已保存答案',
  'forms.plan.source.unresolved': '没有可用答案',
  'forms.plan.reason.protected-field':
    '此字段受保护或处于混合状态；未提出修改建议。',
  'forms.plan.reason.missing-label': '需要明确的问题标签才能提出答案建议。',
  'forms.plan.reason.missing-profile': '缺少所需的资料值。',
  'forms.plan.reason.choice-mismatch': '答案无法唯一对应一个可用选项。',
  'forms.plan.reason.field-format': '请检查答案是否符合此字段的格式或选项。',
  'forms.plan.reason.no-answer': '未找到可用的已保存答案。',
  'forms.plan.reason.current-value': '已保留当前值。请与建议进行比较。',
  'forms.plan.reason.review': '修改前请审核此建议。',
  'forms.plan.reason.planning-limit': '已达到匹配上限。此字段仍需补充答案。',
  'forms.plan.error.form-report': '请重新读取当前表单以获取有效检查报告。',
  'forms.plan.error.answer-profile-missing':
    '所选资料不存在。请重新加载并选择其他资料。',
  'forms.plan.error.form-stopped': '建议生成已停止。请在可用服务器上重试。',
  'forms.plan.error.server-required': '请连接服务器以生成答案建议。',
  'forms.plan.error.form-plan-failed':
    '无法生成答案建议。检查报告、选项和上次建议已保留；准备好后请重试。',
  'forms.review.title': '审核浏览器',
  'forms.review.hint':
    '在服务器上保留浏览器以供审核。在该浏览器中完成登录、CAPTCHA 或打开下一页，然后读取当前页面。会话在闲置 24 小时或服务器停止时关闭。这些控件保留答案原样，且不会提交。',
  'forms.review.open': '打开供审核',
  'forms.review.opening': '正在打开…',
  'forms.review.refresh': '刷新会话',
  'forms.review.loading': '正在加载审核会话…',
  'forms.review.count': '已打开 {count} 个审核会话，上限 {limit}',
  'forms.review.read': '读取当前页面',
  'forms.review.focus': '显示浏览器',
  'forms.review.close': '关闭浏览器',
  'forms.review.headless':
    '浏览器正在无可见窗口的模式下运行。打开新会话前请更改表单可见性设置。',
  'forms.review.headed': '服务器上的可见浏览器',
  'forms.review.visibilityPending': '正在检查浏览器可见性…',
  'forms.review.expires': '若一直闲置，将于 {time} 关闭',
  'forms.review.state.opening': '正在打开',
  'forms.review.state.open': '已打开供审核',
  'forms.review.state.closing': '正在关闭',
  'forms.review.state.close-failed': '尚未确认关闭',
  'forms.review.error.form-slot-in-use':
    '此审核槽位已经打开。请使用其控件或选择其他槽位。',
  'forms.review.error.form-session-limit':
    '请先关闭一个审核浏览器，再打开新会话。',
  'forms.review.error.form-session-missing': '此审核会话已不可用。请刷新列表。',
  'forms.review.error.form-session-closed':
    '浏览器已关闭。请打开新的审核会话。',
  'forms.review.error.form-close-failed':
    '尚未确认浏览器清理。请在列表中保留此会话并重试关闭。',
  'forms.review.error.form-focus-unavailable': '此浏览器无法显示审核窗口。',
  'forms.review.error.form-busy': '另一审核操作仍在进行。请等待完成。',
  'forms.review.error.form-timeout':
    '审核已达到时限。请刷新会话，准备好后重试。',
  'forms.review.error.form-stopped': '审核正在停止。请连接可用的服务器。',
  'forms.review.error.server-required': '请连接服务器以管理审核浏览器。',
  'forms.review.error.form-review-failed':
    '无法确认审核操作。URL 和报告已保留。重试前请刷新会话。',
  'forms.fill.title': '审核所选更改',
  'forms.choices.inspect': '打开选项以供检查',
  'forms.choices.opened':
    '选项已打开并读取。应用更改前，请为当前页面创建新的答案计划。',
  'forms.choices.uncertain':
    '无法确认选项检查结果。更改前请检查浏览器并创建新计划。{code}',
  'forms.choices.refused':
    '选项检查在点击前被拒绝。请为当前页面创建新计划。{code}',
  'forms.fill.hint':
    '在下方选择字段，仅应用选中的建议。支持文本字段、原生控件以及已显示的 ARIA 复选框、完整单选按钮组和单选选项。替换现有答案需要明确允许。提交和下一步由您操作；网站可能会在编辑时保存更改。',
  'forms.fill.select': '应用此建议',
  'forms.fill.count': '已选 {count} 项 · 最多 {limit} 项',
  'forms.fill.replace': '允许替换所选更改影响的现有答案',
  'forms.fill.apply': '应用所选更改',
  'forms.fill.error':
    '尚未确认结果（{code}）。已保留选择。重试同一计划以获取记录；已执行的操作不会再次执行。',
  'forms.fill.state.applied':
    '所有所选更改均已确认。发送前请在表单浏览器中审核。',
  'forms.fill.state.partial':
    '部分更改已确认。请检查当前页面，并为剩余字段创建新计划。',
  'forms.fill.state.uncertain':
    '某次更改尝试的结果不确定。再次规划前请检查浏览器和当前报告。',
  'forms.fill.state.refused':
    '在更改字段之前已拒绝操作。请读取当前页面并创建新计划。',
  'forms.fill.refusal': '原因：{code}',
  'forms.fill.receipt': '{field}：{status}',
  'forms.fill.receipt.applied': '已应用并读回确认',
  'forms.fill.receipt.unchanged': '已一致，未更改',
  'forms.fill.receipt.uncertain': '结果不确定',
  'forms.fill.receipt.not-attempted': '未尝试',
  'forms.upload.hint':
    '选择要附加到此字段的 PDF 简历（最大 8 MiB）。网站可能立即上传。发送前请检查表单；附加后须重新生成答案计划。',
  'forms.upload.choose': 'PDF 简历',
  'forms.upload.selected': '已选择：{name} · {size} 字节',
  'forms.upload.replace': '允许替换当前附件',
  'forms.upload.attach': '附加所选 PDF',
  'forms.upload.attached':
    '已附加 {name} 并验证其内容。进行其他更改前请审核新计划。',
  'forms.upload.uncertain': '无法确认附件（{code}）。重试前请检查实际表单。',
  'forms.upload.refused': '未执行附件操作（{code}）。请重新规划当前页面。',
};
