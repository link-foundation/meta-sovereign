// Simplified Chinese locale (issue #18). Keys must mirror ./en.js
// exactly; the parity test in js/tests/i18n.test.js fails the build
// if they drift. The issue uses the informal `ch` tag — the canonical
// BCP-47 / ISO 639-1 code is `zh`. We ship under `zh` so all browser
// `navigator.language` values (`zh`, `zh-CN`, `zh-Hans`, `zh-Hans-CN`,
// `zh-Hant-TW`, …) resolve to this dictionary via prefix matching.

export const zh = {
  appName: 'meta-sovereign',
  skipLink: '跳到主要内容',
  'header.theme': '主题',
  'header.themeAria': '切换深色模式',
  'header.tutorial': '教程',
  'header.tutorialAria': '打开教程',
  'header.language': '语言',
  'header.languageAria': '选择界面语言',
  'header.systemDefault': '跟随系统',
  'header.online': '在线',
  'header.offline': '离线',
  'nav.chat': '聊天',
  'nav.operator': '操作员',
  'nav.contacts': '联系人',
  'nav.automation': '自动化',
  'nav.patterns': '模式',
  'nav.replies': '回复',
  'nav.facts': '事实',
  'nav.audience': '受众',
  'nav.broadcast': '广播',
  'nav.outreach': '触达',
  'nav.profile': '个人资料',
  'nav.backup': '备份',
  'nav.status': '状态',
  'nav.connections': '连接',
  'nav.settings': '设置',
  'shell.primaryNavAria': '主导航',
  'common.loading': '加载中...',
  'common.refresh': '刷新',
  'common.save': '保存',
  'common.send': '发送',
  'common.cancel': '取消',
  'common.preview': '预览',
  'common.queue': '加入队列',
  'common.evaluate': '运行',
  'common.infer': '推断',
  'chat.aside': '聊天',
  'chat.placeholder': '输入消息...',
  'operator.title': '操作员',
  'operator.next': '下一条 (N)',
  'operator.done': '完成 (D)',
  'operator.progress': '{current} / {total}',
  'contacts.title': '联系人 ({count})',
  'contacts.identity': '身份',
  'contacts.networks': '网络',
  'contacts.chats': '聊天',
  'contacts.messages': '消息',
  'contacts.lastSeen': '最近活跃',
  'automation.title': '自动化图',
  'automation.edges': '{count} 条边',
  'patterns.title': '模式',
  'patterns.inferTitle': '从示例推断正则',
  'patterns.examplesPlaceholder': '每行一个示例',
  'patterns.modeSimple': '简单',
  'patterns.modeLcs': 'lcs (可变间隔)',
  'patterns.idPlaceholder': '模式 ID（例如 greet）',
  'patterns.labelPlaceholder': '标签',
  'patterns.colId': 'ID',
  'patterns.colRegex': '正则',
  'replies.title': '回复变体组',
  'replies.newTitle': '新建或更新组',
  'replies.idPlaceholder': '组 ID（例如 thanks）',
  'replies.variationsPlaceholder': '每行一个变体',
  'replies.saveGroup': '保存组',
  'facts.title': '事实 ({count})',
  'facts.colQuestion': '问题',
  'facts.colAnswer': '回答',
  'facts.colPattern': '模式',
  'audience.title': '受众构建器',
  'audience.hint':
    '运算符：AND、OR、NOT、括号。维度：network:、chat:、sender:、kind:、fact:',
  'audience.queryPlaceholder': '例如 network:telegram AND chat:general',
  'audience.contactsCount': '{count} 个联系人',
  'broadcast.title': '广播',
  'outreach.title': '触达',
  'outreach.hint': '大规模个性化触达。预览随时可用；队列会真正发送。',
  'outreach.queryPlaceholder': '受众查询，例如 network:telegram AND chat:vip',
  'outreach.bodyPlaceholder':
    '正文。使用 {name}、{networks}、{chats} 为每个收件人定制。',
  'profile.title': '个人资料',
  'profile.namePlaceholder': '姓名',
  'profile.bioPlaceholder': '简介',
  'profile.saveProfile': '保存资料',
  'profile.resumeTitle': '简历',
  'profile.titlePlaceholder': '职位',
  'profile.bodyPlaceholder': '工作经历',
  'profile.saveResume': '保存简历',
  'backup.title': '备份',
  'backup.hint': '加密压缩包保存在服务器存储目录下。',
  'backup.passphrasePlaceholder': '可选口令',
  'backup.keepPlaceholder': '保留 N 份（可选）',
  'backup.create': '创建备份',
  'backup.restore': '恢复',
  'backup.itemMeta': '{size} 字节 — {timestamp} — {state}',
  'backup.encrypted': '已加密',
  'backup.plain': '未加密',
  'status.title': '状态',
  'settings.title': '设置',
  'settings.intro':
    '应用级偏好保留在这里。提供方凭据、归档导入和实时检测集中在专用的“连接”页面。',
  'settings.openConnections': '打开连接',
  'settings.credentials': '凭据',
  'settings.optional': '(可选)',
  'settings.storedAs': '存储为 {id}',
  'settings.saveCredentials': '保存凭据',
  'settings.saving': '保存中...',
  'settings.saved': '已保存。',
  'settings.forget': '清除',
  'settings.forgetting': '正在清除 {label}...',
  'settings.forgotten': '{label} 已清除。',
  'settings.archive': '归档导入',
  'settings.archivePasteHint': '或在下方粘贴归档内容：',
  'settings.archivePastePlaceholder': '在此粘贴归档内容',
  'settings.archivePasteWith': '粘贴 {label} 内容',
  'settings.importPasted': '导入粘贴内容',
  'settings.importing': '正在导入 {label}...',
  'settings.importedCount': '已从 {label} 导入 {count} 条消息。',
  'settings.importFailed': '导入失败：{message}',
  'settings.nothingToImport': '没有可导入的内容。',
  'settings.docsLink': '如何获取凭据 ↗',
  'settings.credentialsSaved': '凭据已保存',
  'settings.noCredentials': '尚无凭据',
  'settings.probe.idle': '端点：{url}',
  'settings.probe.notReady': '输入令牌以启用检测',
  'settings.probe.button': '直接试一下',
  'settings.probe.probing': '检测中...',
  'settings.probe.connected': '已连接 (HTTP {status})',
  'settings.probe.httpHint': 'API 返回 {status}。{hint}',
  'settings.probe.httpNoHint': 'API 返回 {status}。',
  'settings.probe.cors':
    '浏览器阻止了请求 (CORS)。请在下方启动本地服务器以代理调用。',
  'settings.probe.network': '网络错误：{message}。',
  'settings.probe.fetchFailed': 'fetch 失败',
  'guide.connectFirstHint': '必须先连接一个提供方，这里才会有数据。',
  'guide.openSettings': '打开 {target}',
  'guide.openSettingsTarget': '连接 → {label}',
  'guide.openSettingsRoot': '连接',
  'guide.openConnections': '打开 {target}',
  'guide.openConnectionsTarget': '连接 → {label}',
  'guide.openConnectionsRoot': '连接',
  'guide.probeDisabled': '在连接中输入凭据以启用 {label} 检测。',
  'guide.useThisServer': '使用此服务器',
  'guide.fallbackTitle': '此处暂无内容。',
  'guide.filesLabel': '文件：{hint}',
  'guide.envVarLabel': '环境变量：{name}',
  'guide.localServer.title': '启动本地服务器以解锁此提供方',
  'guide.localServer.body':
    '同源本地服务器代理提供方请求并绕过浏览器的 CORS 规则。选择你已安装的运行时。',
  'guide.localServer.rust': 'Rust（推荐）',
  'guide.localServer.rustHint':
    '使用本仓库的纯 Rust 二进制。默认地址 http://127.0.0.1:8787。',
  'guide.localServer.node': 'Node / Bun / Deno',
  'guide.localServer.nodeHint':
    '复用已发布的 JS 服务器。默认地址 http://127.0.0.1:8787。',
  'guide.localServer.docker': 'Docker',
  'guide.localServer.dockerHint':
    '在容器中启动同一个 JS 服务器。参见 docker/web.Dockerfile。',
  'guide.localServer.overrideHint':
    '服务器运行后，将其 URL 粘贴到下方并点击「使用此服务器」——SPA 会保存它并重新加载。',
  'guide.chat.title': '统一收件箱当前为空。',
  'guide.chat.body':
    'meta-sovereign 将所有已连接服务的每条聊天集中在一处。打开“连接”来添加提供方或导入归档，然后回到这里。',
  'guide.operator.title': '操作员队列为空。',
  'guide.operator.body':
    '操作员卡片流逐条带你处理未读消息。打开“连接”并添加支持聊天的提供方以启动队列。',
  'guide.contacts.title': '尚无联系人。',
  'guide.contacts.body':
    '联系人会跨提供方汇总，同一人在不同网络中只会出现一次。打开“连接”添加提供方以填充此列表。',
  'guide.automation.title': '尚无自动化图。',
  'guide.automation.body':
    '自动化图把匹配某模式的入站消息路由到回复变体。打开“连接”导入提供方数据后再构建自动化。',
  'guide.patterns.title': '尚无模式。',
  'guide.patterns.body':
    '模式是从示例消息中推断出的。打开“连接”连接提供方或导入归档，然后带着示例回到这里。',
  'guide.replies.title': '尚无回复变体组。',
  'guide.replies.body':
    '回复组通过模糊相似度从你过去的发出消息中提取。打开“连接”添加支持聊天的提供方以填充回复库。',
  'guide.facts.title': '尚未提取事实。',
  'guide.facts.body':
    '事实是模式跨消息提取出的「问题 → 答案」对。打开“连接”收集提供方数据，然后在这里添加捕获模式。',
  'guide.audience.title': '构建你的第一个受众。',
  'guide.audience.body':
    '使用 AND/OR/NOT 加上 network:、chat:、sender:、kind:、fact: 等维度交叉筛选联系人。请先打开“连接”添加至少一个提供方。',
  'guide.broadcast.title': '尚无广播目标。',
  'guide.broadcast.body':
    '广播会将相同消息发布到每个已连接的信息流。打开“连接”添加支持公开发布的提供方以启用目标复选框。',
  'guide.outreach.title': '尚无触达对象。',
  'guide.outreach.body':
    '大规模个性化触达把模板消息按 1:1 发送给受众查询中的每个联系人。打开“连接”添加支持聊天的提供方。',
  'guide.profile.title': '尚无个人资料。',
  'guide.profile.body':
    '在此编辑个人资料和简历；保存后会同步到每个已连接的提供方。打开“连接”添加至少一个提供方用于资料同步。',
  'guide.backup.title': '尚无备份归档。',
  'guide.backup.body':
    '备份是本地存储的静态加密归档。在上方设置口令,有数据值得保存时点击「创建备份」,或先启动本地服务器以便备份保存到磁盘。',
  'guide.status.title': '状态仅显示本地存储。',
  'guide.status.body':
    '只有当服务器可达时,才会显示状态字段。可在下方启动本地服务器,或者完全离线工作——SPA 会直接写入浏览器存储。',
  'guide.connections.title': '连接',
  'guide.connections.body':
    '外部服务集中在这个独立页面。选择一个提供方以输入凭据、上传归档并检测线上 API。设置页只保留应用层级偏好。',
  'guide.settings.title': '设置',
  'guide.settings.body':
    '应用级偏好保留在这里。提供方凭据、归档导入和实时检测集中在专用的“连接”页面。',
  'connections.title': '连接',
  'connections.intro': '选择一个提供方以输入凭据、导入归档并检测线上 API。',
  'connections.state.connected': '已连接',
  'connections.state.notConnected': '未连接',
  'connections.state.actionRequired': '需要操作',
  'connections.openDetail': '设置',
  'connections.controlsTitle': '连接控制',
  // BEGIN setup-steps (issue #25 R-N8) — auto-generated
  'connections.email.setup.step1.title': '准备 Email 凭据',
  'connections.email.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.email.setup.step2.title': '保存到 meta-sovereign',
  'connections.email.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.email.setup.step3.title': '执行探测',
  'connections.email.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.telegram.setup.step1.title': '准备 Telegram 凭据',
  'connections.telegram.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.telegram.setup.step2.title': '保存到 meta-sovereign',
  'connections.telegram.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.telegram.setup.step3.title': '执行探测',
  'connections.telegram.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.vk.setup.step1.title': '准备 VK 凭据',
  'connections.vk.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.vk.setup.step2.title': '保存到 meta-sovereign',
  'connections.vk.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.vk.setup.step3.title': '执行探测',
  'connections.vk.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.x.setup.step1.title': '准备 X (Twitter) 凭据',
  'connections.x.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.x.setup.step2.title': '保存到 meta-sovereign',
  'connections.x.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.x.setup.step3.title': '执行探测',
  'connections.x.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.whatsapp.setup.step1.title': '准备 WhatsApp 凭据',
  'connections.whatsapp.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.whatsapp.setup.step2.title': '保存到 meta-sovereign',
  'connections.whatsapp.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.whatsapp.setup.step3.title': '执行探测',
  'connections.whatsapp.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.facebook.setup.step1.title': '准备 Facebook 凭据',
  'connections.facebook.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.facebook.setup.step2.title': '保存到 meta-sovereign',
  'connections.facebook.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.facebook.setup.step3.title': '执行探测',
  'connections.facebook.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.linkedin.setup.step1.title': '准备 LinkedIn 凭据',
  'connections.linkedin.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.linkedin.setup.step2.title': '保存到 meta-sovereign',
  'connections.linkedin.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.linkedin.setup.step3.title': '执行探测',
  'connections.linkedin.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.habr-career.setup.step1.title': '准备 career.habr.com 凭据',
  'connections.habr-career.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.habr-career.setup.step2.title': '保存到 meta-sovereign',
  'connections.habr-career.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.habr-career.setup.step3.title': '执行探测',
  'connections.habr-career.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.hh.setup.step1.title': '准备 hh.ru 凭据',
  'connections.hh.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.hh.setup.step2.title': '保存到 meta-sovereign',
  'connections.hh.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.hh.setup.step3.title': '执行探测',
  'connections.hh.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.github.setup.step1.title': '准备 GitHub 凭据',
  'connections.github.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.github.setup.step2.title': '保存到 meta-sovereign',
  'connections.github.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.github.setup.step3.title': '执行探测',
  'connections.github.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.upwork.setup.step1.title': '准备 Upwork 凭据',
  'connections.upwork.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.upwork.setup.step2.title': '保存到 meta-sovereign',
  'connections.upwork.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.upwork.setup.step3.title': '执行探测',
  'connections.upwork.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.peopleperhour.setup.step1.title': '准备 PeoplePerHour 凭据',
  'connections.peopleperhour.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.peopleperhour.setup.step2.title': '保存到 meta-sovereign',
  'connections.peopleperhour.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.peopleperhour.setup.step3.title': '执行探测',
  'connections.peopleperhour.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  'connections.superjob.setup.step1.title': '准备 SuperJob 凭据',
  'connections.superjob.setup.step1.body':
    '打开下方文档链接,按上游服务的要求创建 API 令牌、OAuth 凭据或开发者密钥。',
  'connections.superjob.setup.step2.title': '保存到 meta-sovereign',
  'connections.superjob.setup.step2.body':
    '将凭据粘贴到此页面的字段。值会以 `secret:*` 键保存,绝不会离开浏览器。',
  'connections.superjob.setup.step3.title': '执行探测',
  'connections.superjob.setup.step3.body':
    '点击"探测连接"——返回成功即说明凭据有效。失败时会显示带下一步操作的翻译提示。',
  // END setup-steps
  'connections.back': '返回连接',
  'connections.email.label': '电子邮件',
  'connections.email.archive.title': '导入 .eml 或 mbox 邮件导出',
  'connections.email.archive.hint':
    '从你的邮件提供方导出邮件为 .eml 文件或 mbox 归档,包括 Gmail Takeout 的 mbox 文件。将文件拖入导入框,来源选择 "email"。',
  'connections.email.archive.fileHint': '*.eml, *.mbox',
  'connections.email.api.title': '连接邮件 API 与协议',
  'connections.email.api.hint':
    '当 CORS 允许时,可直接在浏览器中使用 JMAP、Gmail API 或 Microsoft Graph。IMAP、POP3 与 SMTP 需要本地服务器,因为浏览器无法打开原始 TCP/TLS 邮件套接字。',
  'connections.email.fields.token.label': 'OAuth 访问令牌',
  'connections.email.errorHints.401':
    '令牌被拒绝。请使用 gmail.readonly 范围重新签发 OAuth 令牌。',
  'connections.email.errorHints.403':
    '范围不足。请重新签发带 gmail.readonly 或 jmap 权限的令牌。',
  'connections.telegram.label': 'Telegram',
  'connections.telegram.archive.title': '导入 Telegram Desktop 归档',
  'connections.telegram.archive.hint':
    'Telegram Desktop -> 设置 -> 高级 -> 导出 Telegram 数据。选择「个人聊天」+「JSON」,然后将生成的 result.json 拖入下方导入框。',
  'connections.telegram.archive.fileHint': 'result.json',
  'connections.telegram.api.title': '连接 Telegram Bot API',
  'connections.telegram.api.hint':
    '在 Telegram 内联系 @BotFather,运行 /newbot,复制机器人令牌并粘贴为名为 "secret:telegram:bot-token" 的密钥。',
  'connections.telegram.fields.token.label': '机器人令牌',
  'connections.telegram.errorHints.401':
    '令牌被拒绝。向 @BotFather 申请新令牌或撤销泄露的旧令牌。',
  'connections.telegram.errorHints.404':
    '未找到端点。请仔细检查机器人令牌中是否含有空白字符。',
  'connections.vk.label': 'VK',
  'connections.vk.archive.title': '导入 VK 会话归档',
  'connections.vk.archive.hint':
    '打开 https://vk.com/data_protection 申请归档,解压后加载 "messages" JSON 文件。',
  'connections.vk.archive.fileHint': 'messages*.json',
  'connections.vk.api.title': '连接 VK API',
  'connections.vk.api.hint':
    '在 https://vk.com/apps?act=manage 创建独立应用,申请带 messages 范围的访问令牌。粘贴为 "secret:vk:token"。',
  'connections.vk.fields.token.label': '访问令牌',
  'connections.vk.errorHints.401':
    '访问令牌已过期。请在 id.vk.com 重新执行 implicit 流程。',
  'connections.x.label': 'X (Twitter)',
  'connections.x.archive.title': '导入 X 数据归档',
  'connections.x.archive.hint':
    '设置 -> 你的账户 -> 下载你的数据归档。归档准备好后解压,选择 data/ 下的推文和私信 JSON 文件。',
  'connections.x.archive.fileHint': 'tweets.js, direct-messages.js',
  'connections.x.api.title': '连接 X API v2',
  'connections.x.api.hint':
    '在 https://developer.x.com/ 创建应用,生成用户上下文 bearer 令牌,并粘贴为 "secret:x:token"。',
  'connections.x.fields.token.label': 'Bearer 令牌',
  'connections.x.errorHints.401':
    'Bearer 令牌被拒绝。请在 X 开发者门户生成新令牌。',
  'connections.x.errorHints.403': '令牌有效但缺少 users.read 范围。',
  'connections.whatsapp.label': 'WhatsApp',
  'connections.whatsapp.archive.title': '导入 WhatsApp 聊天导出',
  'connections.whatsapp.archive.hint':
    '在 WhatsApp 应用中,打开聊天 -> ... -> 更多 -> 导出聊天(无媒体)。把生成的 "WhatsApp Chat with NAME.txt" 拖入导入框。',
  'connections.whatsapp.archive.fileHint': 'WhatsApp Chat with *.txt',
  'connections.whatsapp.api.title': '连接 WhatsApp Cloud API',
  'connections.whatsapp.api.hint':
    '在 Meta for Developers 创建应用,添加 WhatsApp 产品,复制临时或系统用户访问令牌以及电话号码 ID(WHATSAPP_PHONE_NUMBER_ID)。',
  'connections.whatsapp.fields.token.label': '访问令牌',
  'connections.whatsapp.fields.phoneNumberId.label': '电话号码 ID',
  'connections.whatsapp.errorHints.400':
    'Meta 返回 400。请重新检查访问令牌,确认应用处于 Live 模式。',
  'connections.whatsapp.errorHints.401':
    '访问令牌被拒绝。请在 Meta Business 生成新的系统用户令牌。',
  'connections.facebook.label': 'Facebook',
  'connections.facebook.archive.title': '导入 Facebook 下载',
  'connections.facebook.archive.hint':
    '设置和隐私 -> 设置 -> 你的信息 -> 下载你的信息。选择 "JSON" 并选择需要的类别(消息、帖子)。',
  'connections.facebook.archive.fileHint': 'messages_*.json, posts_*.json',
  'connections.facebook.api.title': '连接 Facebook Graph API',
  'connections.facebook.api.hint':
    '在 Meta for Developers 应用中,添加一个 Facebook 主页,生成主页访问令牌(FACEBOOK_PAGE_ACCESS_TOKEN)并记录主页 ID(FACEBOOK_PAGE_ID)。',
  'connections.facebook.fields.token.label': '主页访问令牌',
  'connections.facebook.fields.pageId.label': '主页 ID',
  'connections.facebook.errorHints.400':
    'Graph 返回 400。请确认访问令牌未过期(主页令牌有效期较短)。',
  'connections.facebook.errorHints.401':
    '访问令牌被拒绝。请在 Graph API Explorer 重新签发新的主页令牌。',
  'connections.linkedin.label': 'LinkedIn',
  'connections.linkedin.archive.title': '导入 LinkedIn 数据导出',
  'connections.linkedin.archive.hint':
    '设置与隐私 -> 数据隐私 -> 获取数据副本。选择「需要特定内容?」并请求「消息」+「帖子」。',
  'connections.linkedin.archive.fileHint': 'messages.csv, Shares.csv',
  'connections.linkedin.api.title': '连接 LinkedIn REST API',
  'connections.linkedin.api.hint':
    '在 https://www.linkedin.com/developers/ 创建应用,申请「Share on LinkedIn」+「Sign In with LinkedIn using OpenID Connect」产品,粘贴 OAuth2 访问令牌以及作者 URN(LINKEDIN_AUTHOR_URN)。',
  'connections.linkedin.fields.token.label': '访问令牌',
  'connections.linkedin.fields.authorUrn.label': '作者 URN',
  'connections.linkedin.errorHints.401':
    'OAuth2 访问令牌被拒绝。请重新执行授权码流程。',
  'connections.habr-career.label': 'career.habr.com',
  'connections.habr-career.archive.title': '导入 career.habr.com 申请 JSON',
  'connections.habr-career.archive.hint':
    '在 career.habr.com 打开账户,前往「Отклики на вакансии」,使用导出为 JSON 的操作。保存文件并加载到 SPA 中。',
  'connections.habr-career.archive.fileHint': 'applications.json',
  'connections.habr-career.api.title': '连接 career.habr.com 私有 API',
  'connections.habr-career.api.hint':
    '在 career.habr.com -> 设置 -> Tokens 生成个人访问令牌,粘贴为 "secret:habr-career:token"。',
  'connections.habr-career.fields.token.label': '个人访问令牌',
  'connections.habr-career.errorHints.401':
    'career.habr.com 拒绝了令牌。请在 设置 -> Tokens 重新签发。',
  'connections.hh.label': 'hh.ru',
  'connections.hh.archive.title': '导入 hh.ru 沟通归档',
  'connections.hh.archive.hint':
    '打开 https://hh.ru/applicant/negotiations,使用 JSON 导出,保存文件并在此加载。',
  'connections.hh.archive.fileHint': 'negotiations.json',
  'connections.hh.api.title': '连接 hh.ru API',
  'connections.hh.api.hint':
    '在 https://dev.hh.ru/ 注册应用,运行 OAuth2 客户端凭证或授权码流程,把访问令牌粘贴为 "secret:hh:token"。',
  'connections.hh.fields.token.label': '访问令牌',
  'connections.hh.errorHints.401':
    'hh.ru 拒绝了令牌。请通过 https://dev.hh.ru/ 的应用刷新。',
  'connections.github.label': 'GitHub',
  'connections.github.archive.title': '导入 gh api JSON 转储',
  'connections.github.archive.hint':
    '保存来自 `gh api` 的 JSON 转储(例如 `gh api repos/OWNER/REPO/issues --paginate > issues.json`)或一个信封 `{ issues, comments, pulls, reviews, reviewComments, discussions }`,并把文件拖到这里。',
  'connections.github.archive.fileHint':
    'issues.json, pulls.json, comments.json, envelope.json',
  'connections.github.api.title': '连接 GitHub REST API',
  'connections.github.api.hint':
    '在 https://github.com/settings/personal-access-tokens 创建细粒度个人访问令牌,授予对 issue、pull request 以及你想克隆的仓库的读取权限;如打算发表评论,请同时给 issue 写权限。粘贴为 "secret:github:access-token"。',
  'connections.github.fields.token.label': '个人访问令牌',
  'connections.github.errorHints.401':
    '令牌被拒绝。请在 https://github.com/settings/personal-access-tokens 重新签发个人访问令牌。',
  'connections.github.errorHints.403':
    'GitHub 返回 403。令牌可能缺少范围(issues:read、pull_requests:read、contents:read)或触发了次级速率限制。',
  'connections.github.errorHints.404':
    '未找到仓库或不可见。请确认令牌可访问目标 owner/repo。',
  'connections.upwork.label': 'Upwork',
  'connections.upwork.archive.title': '导入 Upwork 数据导出',
  'connections.upwork.archive.hint':
    'Upwork 允许导出交易历史(Reports → Transaction History → Download CSV)、单个工作归档,以及内部管理信封(`{ jobs, contracts, rooms, messages, transactions }`)。把生成的 CSV 或 JSON 文件拖到这里,来源选择 "upwork"。',
  'connections.upwork.archive.fileHint':
    'transactions.csv, jobs.json, contracts.json, envelope.json',
  'connections.upwork.api.title': '连接 Upwork GraphQL API',
  'connections.upwork.api.hint':
    '在 https://www.upwork.com/services/api/apply 注册 OAuth2 应用,运行三段式授权码流程,把访问令牌粘贴为 "secret:upwork:access-token"。可选刷新令牌存储在 "secret:upwork:refresh-token"。',
  'connections.upwork.fields.token.label': 'OAuth 访问令牌',
  'connections.upwork.fields.refreshToken.label': '刷新令牌',
  'connections.upwork.fields.organizationId.label': '组织(租户)ID',
  'connections.upwork.errorHints.401':
    'Upwork 拒绝了访问令牌。请通过已注册的 OAuth2 应用刷新或重新执行授权码流程。',
  'connections.upwork.errorHints.403':
    '令牌有效但缺少范围。请重新签发,加上你需要的 messaging、search 与 reports 范围。',
  'connections.upwork.errorHints.429':
    'Upwork 限速了请求。请退避;按 API 服务条款适配器会缓存结果 24 小时。',
  'connections.peopleperhour.label': 'PeoplePerHour',
  'connections.peopleperhour.archive.title': '导入 PeoplePerHour 数据导出',
  'connections.peopleperhour.archive.hint':
    'PeoplePerHour 通过 GDPR 数据访问请求包(设置 → 隐私 → 申请我的数据)和收益 CSV(报告 → 收益 → 导出)提供账户级导出。把得到的 JSON 或 CSV 拖到这里,来源选 "peopleperhour"。',
  'connections.peopleperhour.archive.fileHint':
    'projects.json, proposals.json, workstreams.json, earnings.csv',
  'connections.peopleperhour.api.title': '连接 PeoplePerHour REST API',
  'connections.peopleperhour.api.hint':
    '通过 PeoplePerHour 开发者门户(https://www.peopleperhour.com/site/developers)注册 OAuth2 应用,运行授权码流程,把访问令牌粘贴为 "secret:peopleperhour:access-token"。可选刷新令牌存储在 "secret:peopleperhour:refresh-token"。按 PPH API 服务条款适配器会缓存每个响应 24 小时。',
  'connections.peopleperhour.fields.accessToken.label': 'OAuth 访问令牌',
  'connections.peopleperhour.fields.refreshToken.label': '刷新令牌',
  'connections.peopleperhour.errorHints.401':
    'PeoplePerHour 拒绝了访问令牌。请通过已注册的 OAuth2 应用刷新或重新执行授权码流程。',
  'connections.peopleperhour.errorHints.403':
    '令牌有效但缺少范围。请重新签发,加上你需要的 projects、proposals 与 workstreams 范围。',
  'connections.peopleperhour.errorHints.429':
    'PeoplePerHour 限速了请求。请退避;按 API 服务条款适配器会缓存结果 24 小时。',
  'connections.superjob.label': 'superjob.ru',
  'connections.superjob.archive.title': '导入 SuperJob 回复归档',
  'connections.superjob.archive.hint':
    '在 superjob.ru,打开求职者控制台 -> 「Отклики」,使用 JSON 导出操作。保存文件并在此加载。',
  'connections.superjob.archive.fileHint': 'responses.json',
  'connections.superjob.api.title': '连接 SuperJob API',
  'connections.superjob.api.hint':
    '在 https://api.superjob.ru/register/ 注册应用,把密钥复制为 SUPERJOB_APP_ID,把访问令牌作为 "secret:superjob:token"。',
  'connections.superjob.fields.appId.label': 'App ID (X-Api-App-Id)',
  'connections.superjob.fields.token.label': '访问令牌',
  'connections.superjob.errorHints.401':
    'SuperJob 拒绝了 App ID。请在求职者控制台重新核对。',
  'tutorial.button': '教程',
  'tutorial.skip': '跳过此步',
  'tutorial.next': '下一步',
  'tutorial.finish': '完成',
  'tutorial.off': '关闭教程',
  'tutorial.progress': '第 {current} 步，共 {total} 步',
  'tutorial.connect.title': '先连接一个服务',
  'tutorial.connect.body':
    'meta-sovereign 在你接入至少一个服务之前是空的。点击高亮的「连接」入口打开各服务的设置屏幕——你随时可以回到这个引导。',
  'tutorial.welcome.title': '欢迎使用 meta-sovereign',
  'tutorial.welcome.body':
    '这是你的本地优先个人 CRM 和统一收件箱。除非你主动指向服务器，否则数据不会离开浏览器。点击「下一步」浏览主要流程。',
  'tutorial.chat.title': '聊天 — 你的统一收件箱',
  'tutorial.chat.body':
    '所有已连接服务的聊天都会汇总到这里。如果某个版块为空，它会说明如何接入提供方——结束教程后试着打开「聊天」标签页。',
  'tutorial.contacts.title': '联系人 — 每人一行',
  'tutorial.contacts.body':
    '联系人在各个网络间合并显示。至少连接一个提供方才能填充此列表。',
  'tutorial.automation.title': '自动化 — 从模式到回复',
  'tutorial.automation.body':
    '构建节点图，将匹配正则模式的入站消息路由到对应的回复变体。模式与回复组共同驱动这个图编辑器。',
  'tutorial.backup.title': '备份 — 静态加密',
  'tutorial.backup.body':
    '备份会用口令加密本地存储。如果你启动了本地服务器，归档会保存在其数据目录旁边。',
  'tutorial.connections.title': '先连接一个服务',
  'tutorial.connections.body':
    '点击「连接」选择一个提供方。每个提供方都会在应用内引导你获取凭据——无需外部说明。',
  'tutorial.connectionDetail.title': '按提供方流程逐步操作',
  'tutorial.connectionDetail.body':
    '提供方页面列出获取凭据所需的每一步，以及用于确认连接是否生效的实时 API 检测。',
};
