// English locale (issue #18). Source language — every other locale
// dictionary mirrors this set of keys exactly. The parity test in
// js/tests/i18n.test.js fails the build if a locale is missing or
// adds a key. Provider names ("Telegram", "WhatsApp", …) and API URLs
// stay in their source form because they are proper nouns / API
// brand identifiers.

export const en = {
  appName: 'meta-sovereign',
  skipLink: 'Skip to main content',
  'header.theme': 'Theme',
  'header.themeAria': 'Toggle dark mode',
  'header.tutorial': 'Tutorial',
  'header.tutorialAria': 'Open tutorial',
  'header.language': 'Language',
  'header.languageAria': 'Select interface language',
  'header.systemDefault': 'System default',
  'header.online': 'online',
  'header.offline': 'offline',
  'nav.chat': 'Chat',
  'nav.operator': 'Operator',
  'nav.contacts': 'Contacts',
  'nav.automation': 'Automation',
  'nav.patterns': 'Patterns',
  'nav.replies': 'Replies',
  'nav.facts': 'Facts',
  'nav.audience': 'Audience',
  'nav.broadcast': 'Broadcast',
  'nav.outreach': 'Outreach',
  'nav.profile': 'Profile',
  'nav.backup': 'Backup',
  'nav.status': 'Status',
  'nav.connections': 'Connections',
  'nav.cv': 'CV sync',
  'nav.settings': 'Settings',
  'shell.primaryNavAria': 'Primary navigation',
  'common.loading': 'Loading...',
  'common.refresh': 'refresh',
  'common.save': 'save',
  'common.send': 'send',
  'common.cancel': 'cancel',
  'common.preview': 'preview',
  'common.queue': 'queue',
  'common.evaluate': 'evaluate',
  'common.infer': 'infer',
  'chat.aside': 'Chats',
  'chat.placeholder': 'Type a message...',
  'operator.title': 'Operator',
  'operator.next': 'NEXT (N)',
  'operator.done': 'DONE (D)',
  'operator.progress': '{current} / {total}',
  'contacts.title': 'Contacts ({count})',
  'contacts.identity': 'Identity',
  'contacts.networks': 'Networks',
  'contacts.chats': 'Chats',
  'contacts.messages': 'Messages',
  'contacts.lastSeen': 'Last seen',
  'automation.title': 'Automation graphs',
  'automation.edges': '{count} edges',
  'patterns.title': 'Patterns',
  'patterns.inferTitle': 'Infer regex from examples',
  'patterns.examplesPlaceholder': 'one example per line',
  'patterns.modeSimple': 'simple',
  'patterns.modeLcs': 'lcs (variable gaps)',
  'patterns.idPlaceholder': 'pattern id (e.g. greet)',
  'patterns.labelPlaceholder': 'label',
  'patterns.colId': 'id',
  'patterns.colRegex': 'regex',
  'replies.title': 'Reply variation groups',
  'replies.newTitle': 'New / update group',
  'replies.idPlaceholder': 'group id (e.g. thanks)',
  'replies.variationsPlaceholder': 'one variation per line',
  'replies.saveGroup': 'save group',
  'facts.title': 'Facts ({count})',
  'facts.colQuestion': 'Question',
  'facts.colAnswer': 'Answer',
  'facts.colPattern': 'Pattern',
  'audience.title': 'Audience builder',
  'audience.hint':
    'Operators: AND, OR, NOT, parens. Dimensions: network:, chat:, sender:, kind:, fact:',
  'audience.queryPlaceholder': 'e.g. network:telegram AND chat:general',
  'audience.contactsCount': '{count} contacts',
  'broadcast.title': 'Broadcast',
  'outreach.title': 'Outreach',
  'outreach.hint':
    'Mass-personal outreach. Preview always; queue actually dispatches.',
  'outreach.queryPlaceholder':
    'audience query, e.g. network:telegram AND chat:vip',
  'outreach.bodyPlaceholder':
    'Body. Use {name}, {networks}, {chats} to personalise per recipient.',
  'profile.title': 'Profile',
  'profile.namePlaceholder': 'name',
  'profile.bioPlaceholder': 'bio',
  'profile.saveProfile': 'save profile',
  'profile.resumeTitle': 'Resume',
  'profile.titlePlaceholder': 'job title',
  'profile.bodyPlaceholder': 'experience',
  'profile.saveResume': 'save resume',
  'backup.title': 'Backup',
  'backup.hint': 'Encrypted archives live under the server store directory.',
  'backup.passphrasePlaceholder': 'optional passphrase',
  'backup.keepPlaceholder': 'keep N (optional)',
  'backup.create': 'create backup',
  'backup.restore': 'restore',
  'backup.itemMeta': '{size} bytes - {timestamp} - {state}',
  'backup.encrypted': 'encrypted',
  'backup.plain': 'plain',
  'status.title': 'Status',
  'settings.title': 'Settings',
  'settings.intro':
    'App-level preferences live here. Provider credentials, archive imports, and live probes live on the dedicated Connections screen.',
  'settings.openConnections': 'Open Connections',
  'settings.credentials': 'Credentials',
  'settings.optional': '(optional)',
  'settings.storedAs': 'Stored as {id}',
  'settings.saveCredentials': 'Save credentials',
  'settings.saving': 'saving...',
  'settings.saved': 'saved.',
  'settings.forget': 'Forget',
  'settings.forgetting': 'forgetting {label}...',
  'settings.forgotten': '{label} forgotten.',
  'settings.archive': 'Archive import',
  'settings.archivePasteHint': 'or paste the archive contents below:',
  'settings.archivePastePlaceholder': 'Paste archive contents here',
  'settings.archivePasteWith': 'Paste {label} contents',
  'settings.importPasted': 'Import pasted contents',
  'settings.importing': 'importing {label}...',
  'settings.importedCount': 'imported {count} messages from {label}.',
  'settings.importFailed': 'import failed: {message}',
  'settings.nothingToImport': 'nothing to import.',
  'settings.docsLink': 'How to obtain the credentials ↗',
  'settings.credentialsSaved': 'credentials saved',
  'settings.noCredentials': 'no credentials yet',
  'settings.probe.idle': 'Endpoint: {url}',
  'settings.probe.notReady': 'Enter a token to enable probe',
  'settings.probe.button': 'Try directly',
  'settings.probe.probing': 'probing...',
  'settings.probe.connected': 'Connected (HTTP {status})',
  'settings.probe.httpHint': 'API responded with {status}. {hint}',
  'settings.probe.httpNoHint': 'API responded with {status}.',
  'settings.probe.cors':
    'Browser blocked the request (CORS). Start a local server below to proxy the call.',
  'settings.probe.network': 'Network error: {message}.',
  'settings.probe.fetchFailed': 'fetch failed',
  'guide.connectFirstHint':
    'You must connect a provider first before any data can show up here.',
  'guide.openSettings': 'Open {target}',
  'guide.openSettingsTarget': 'Connections → {label}',
  'guide.openSettingsRoot': 'Connections',
  'guide.openConnections': 'Open {target}',
  'guide.openConnectionsTarget': 'Connections → {label}',
  'guide.openConnectionsRoot': 'Connections',
  'guide.probeDisabled':
    'Enter credentials in Connections to enable the {label} probe.',
  'guide.useThisServer': 'Use this server',
  'guide.fallbackTitle': 'Nothing here yet.',
  'guide.filesLabel': 'Files: {hint}',
  'guide.envVarLabel': 'Env var: {name}',
  'guide.localServer.title': 'Start a local server to unblock this provider',
  'guide.localServer.body':
    'A same-origin local server proxies the provider request and side-steps the browser CORS rule. Pick the runtime you have installed.',
  'guide.localServer.rust': 'Rust (recommended)',
  'guide.localServer.rustHint':
    'Uses the pure-Rust binary from this repository. Defaults to http://127.0.0.1:8787.',
  'guide.localServer.node': 'Node / Bun / Deno',
  'guide.localServer.nodeHint':
    'Reuses the published JS server. Defaults to http://127.0.0.1:8787.',
  'guide.localServer.docker': 'Docker',
  'guide.localServer.dockerHint':
    'Spins up the same JS server in a container. See docker/web.Dockerfile.',
  'guide.localServer.overrideHint':
    'Once the server is running, paste its URL below and click "use this server" — the SPA will store it and reload.',
  'guide.chat.title': 'Your unified inbox starts empty.',
  'guide.chat.body':
    'meta-sovereign keeps every chat from every connected service in one place. Open Connections to connect a provider or import an exported archive, then come back here.',
  'guide.operator.title': 'Operator queue is empty.',
  'guide.operator.body':
    'The operator card stream walks you through unread messages chat by chat. Open Connections and add a chat-capable provider to start the queue.',
  'guide.contacts.title': 'No contacts yet.',
  'guide.contacts.body':
    'Contacts are aggregated from every connected provider so the same person across networks shows up once. Open Connections to add a provider and populate this list.',
  'guide.automation.title': 'No automation graphs yet.',
  'guide.automation.body':
    'Automation graphs route incoming messages from a pattern to a reply variation. Open Connections to import provider data before building automations.',
  'guide.patterns.title': 'No patterns yet.',
  'guide.patterns.body':
    'Patterns are inferred from example messages. Open Connections to connect a provider or import an archive, then return with examples to infer from.',
  'guide.replies.title': 'No reply variation groups yet.',
  'guide.replies.body':
    'Reply groups are extracted from your previous outgoing messages by fuzzy similarity. Open Connections to add a chat-capable provider and seed your reply library.',
  'guide.facts.title': 'No facts extracted yet.',
  'guide.facts.body':
    'Facts are question -> answer pairs extracted across messages by your patterns. Open Connections to gather provider data, then add a capture pattern here.',
  'guide.audience.title': 'Build your first audience.',
  'guide.audience.body':
    'Cross-reference contacts using AND/OR/NOT plus dimensions like network:, chat:, sender:, kind:, fact:. Open Connections to add at least one provider first.',
  'guide.broadcast.title': 'No broadcast targets yet.',
  'guide.broadcast.body':
    'Broadcasts post the same message to every connected feed. Open Connections to connect a public-posting provider and enable target checkboxes.',
  'guide.outreach.title': 'No outreach surface yet.',
  'guide.outreach.body':
    'Mass-personal outreach sends a templated message 1:1 to each contact in an audience query. Open Connections to add a chat-capable provider first.',
  'guide.profile.title': 'No profile yet.',
  'guide.profile.body':
    'Edit your profile and resume here; saves are pushed to every connected provider. Open Connections to add at least one provider for profile sync.',
  'guide.backup.title': 'No backup archives yet.',
  'guide.backup.body':
    'Backups are encrypted-at-rest archives of the local store. Set a passphrase above, click "create backup" once you have data worth saving, or start a local server first if you want backups to live on disk.',
  'guide.status.title': 'Status is showing the local store only.',
  'guide.status.body':
    'Status fields appear once a server is reachable. Either start a local server below, or keep working fully offline — the SPA writes straight to your browser store.',
  'guide.connections.title': 'Connections',
  'guide.connections.body':
    'External services live on this dedicated screen. Pick a provider to enter its credentials, upload an archive, and probe the live API. Settings only keeps app-level preferences.',
  'guide.cv.title': 'CV synchronisation',
  'guide.cv.body':
    'This screen drives a real browser session over your job-platform profiles: it reads each CV, compares them field by field, and only writes when you apply a sync. Sign in to each platform once in the browser profile the local server uses — no API keys exist for most of these boards.',
  'guide.settings.title': 'Settings',
  'guide.settings.body':
    'App-level preferences live here. Provider credentials, archive imports, and live probes live on the dedicated Connections screen.',
  'connections.title': 'Connections',
  'connections.intro':
    'Pick a provider to enter credentials, import an archive, and probe the live API.',
  'connections.state.connected': 'Connected',
  'connections.state.notConnected': 'Not connected',
  'connections.state.actionRequired': 'Action required',
  'connections.state.browserSession': 'Browser session',
  'connections.session.login': 'Open the sign-in page',
  'connections.session.profile': 'Open the profile page',
  'connections.session.openCv': 'Open the CV screen',
  'connections.openDetail': 'Set up',
  'connections.controlsTitle': 'Connection controls',
  // BEGIN setup-steps (issue #25 R-N8) — auto-generated
  'connections.email.setup.step1.title': 'Prepare your Email credential',
  'connections.email.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.email.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.email.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.email.setup.step3.title': 'Run the probe',
  'connections.email.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.telegram.setup.step1.title': 'Prepare your Telegram credential',
  'connections.telegram.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.telegram.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.telegram.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.telegram.setup.step3.title': 'Run the probe',
  'connections.telegram.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.vk.setup.step1.title': 'Prepare your VK credential',
  'connections.vk.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.vk.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.vk.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.vk.setup.step3.title': 'Run the probe',
  'connections.vk.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.x.setup.step1.title': 'Prepare your X (Twitter) credential',
  'connections.x.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.x.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.x.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.x.setup.step3.title': 'Run the probe',
  'connections.x.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.whatsapp.setup.step1.title': 'Prepare your WhatsApp credential',
  'connections.whatsapp.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.whatsapp.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.whatsapp.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.whatsapp.setup.step3.title': 'Run the probe',
  'connections.whatsapp.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.facebook.setup.step1.title': 'Prepare your Facebook credential',
  'connections.facebook.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.facebook.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.facebook.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.facebook.setup.step3.title': 'Run the probe',
  'connections.facebook.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.linkedin.setup.step1.title': 'Prepare your LinkedIn credential',
  'connections.linkedin.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.linkedin.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.linkedin.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.linkedin.setup.step3.title': 'Run the probe',
  'connections.linkedin.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.habr-career.setup.step1.title':
    'Prepare your career.habr.com credential',
  'connections.habr-career.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.habr-career.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.habr-career.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.habr-career.setup.step3.title': 'Run the probe',
  'connections.habr-career.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.hh.setup.step1.title': 'Prepare your hh.ru credential',
  'connections.hh.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.hh.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.hh.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.hh.setup.step3.title': 'Run the probe',
  'connections.hh.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.github.setup.step1.title': 'Prepare your GitHub credential',
  'connections.github.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.github.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.github.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.github.setup.step3.title': 'Run the probe',
  'connections.github.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.upwork.setup.step1.title': 'Prepare your Upwork credential',
  'connections.upwork.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.upwork.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.upwork.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.upwork.setup.step3.title': 'Run the probe',
  'connections.upwork.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.peopleperhour.setup.step1.title':
    'Prepare your PeoplePerHour credential',
  'connections.peopleperhour.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.peopleperhour.setup.step2.title':
    'Save it inside meta-sovereign',
  'connections.peopleperhour.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.peopleperhour.setup.step3.title': 'Run the probe',
  'connections.peopleperhour.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.superjob.setup.step1.title': 'Prepare your SuperJob credential',
  'connections.superjob.setup.step1.body':
    'Open the linked docs and create an API token, OAuth credential, or developer key as the upstream service requires.',
  'connections.superjob.setup.step2.title': 'Save it inside meta-sovereign',
  'connections.superjob.setup.step2.body':
    'Paste the credential into the field on this screen. The value is stored under a `secret:*` key and never leaves your browser.',
  'connections.superjob.setup.step3.title': 'Run the probe',
  'connections.superjob.setup.step3.body':
    'Tap "Probe connection" — a successful response confirms the credential. Failures surface a translated hint with the exact next action.',
  'connections.naukri.setup.step1.title': 'Install the browser driver',
  'connections.naukri.setup.step1.body':
    'Naukri publishes no public API. Install Playwright on the machine that runs the local server so browser-commander can drive a real session.',
  'connections.naukri.setup.step2.title': 'Sign in once',
  'connections.naukri.setup.step2.body':
    'Open the CV screen and run a read. The browser opens naukri.com — sign in there once; the browser profile directory keeps the session for later runs.',
  'connections.naukri.setup.step3.title': 'Read, compare, sync',
  'connections.naukri.setup.step3.body':
    'Read the CV, review the differences against the other boards, then plan a sync. Every run is recorded under cv:telemetry with a markup fingerprint, so a broken selector is easy to spot.',
  'connections.vietnamworks.setup.step1.title': 'Install the browser driver',
  'connections.vietnamworks.setup.step1.body':
    'VietnamWorks publishes no public API. Install Playwright on the machine that runs the local server so browser-commander can drive a real session.',
  'connections.vietnamworks.setup.step2.title': 'Sign in once',
  'connections.vietnamworks.setup.step2.body':
    'Open the CV screen and run a read. The browser opens vietnamworks.com — sign in there once; the browser profile directory keeps the session for later runs.',
  'connections.vietnamworks.setup.step3.title': 'Read, compare, sync',
  'connections.vietnamworks.setup.step3.body':
    'Read the CV, review the differences against the other boards, then plan a sync. Every run is recorded under cv:telemetry with a markup fingerprint, so a broken selector is easy to spot.',
  'connections.topcv.setup.step1.title': 'Install the browser driver',
  'connections.topcv.setup.step1.body':
    'TopCV publishes no public API. Install Playwright on the machine that runs the local server so browser-commander can drive a real session.',
  'connections.topcv.setup.step2.title': 'Sign in once',
  'connections.topcv.setup.step2.body':
    'Open the CV screen and run a read. The browser opens topcv.vn — sign in there once; the browser profile directory keeps the session for later runs.',
  'connections.topcv.setup.step3.title': 'Read, compare, sync',
  'connections.topcv.setup.step3.body':
    'Read the CV, review the differences against the other boards, then plan a sync. Every run is recorded under cv:telemetry with a markup fingerprint, so a broken selector is easy to spot.',
  // END setup-steps
  'connections.back': 'Back to connections',
  'connections.email.label': 'Email',
  'connections.email.archive.title': 'Import .eml or mbox mail exports',
  'connections.email.archive.hint':
    'Export mail from your provider as .eml files or an mbox archive, including Gmail Takeout mbox files. Drop the file into the import box with source "email".',
  'connections.email.archive.fileHint': '*.eml, *.mbox',
  'connections.email.api.title': 'Connect email APIs and protocols',
  'connections.email.api.hint':
    'Use JMAP, Gmail API, or Microsoft Graph directly from the browser when CORS allows it. IMAP, POP3, and SMTP require the local server because browsers cannot open raw TCP/TLS mail sockets.',
  'connections.email.fields.token.label': 'OAuth access token',
  'connections.email.errorHints.401':
    'Token rejected. Re-issue an OAuth token with the gmail.readonly scope.',
  'connections.email.errorHints.403':
    'Insufficient scope. Re-issue the token with gmail.readonly or jmap permissions.',
  'connections.telegram.label': 'Telegram',
  'connections.telegram.archive.title': 'Import a Telegram Desktop archive',
  'connections.telegram.archive.hint':
    'Telegram Desktop -> Settings -> Advanced -> Export Telegram data. Pick "Personal chats" + "JSON" and drop the resulting "result.json" into the import box below.',
  'connections.telegram.archive.fileHint': 'result.json',
  'connections.telegram.api.title': 'Connect the Telegram Bot API',
  'connections.telegram.api.hint':
    'Talk to @BotFather inside Telegram, run /newbot, copy the bot token and paste it as the secret named "secret:telegram:bot-token".',
  'connections.telegram.fields.token.label': 'Bot token',
  'connections.telegram.errorHints.401':
    'Token rejected. Ask @BotFather for a fresh token or revoke the leaked one.',
  'connections.telegram.errorHints.404':
    'Endpoint not found. Double-check there is no whitespace in the bot token.',
  'connections.vk.label': 'VK',
  'connections.vk.archive.title': 'Import a VK conversations archive',
  'connections.vk.archive.hint':
    'Open https://vk.com/data_protection, request your archive, unzip it and load the "messages" JSON files.',
  'connections.vk.archive.fileHint': 'messages*.json',
  'connections.vk.api.title': 'Connect the VK API',
  'connections.vk.api.hint':
    'New VK apps can no longer get the messages right, and Kate Mobile tokens stopped working on 2026-09-08. Prefer the archive import below. For community chats, paste a community token (community settings -> API usage). A legacy user token issued for VK\'s own web client (client_id 6287487 via oauth.vk.ru) may still work, at your own risk of an account freeze. The value is stored as "secret:vk:access-token".',
  'connections.vk.fields.token.label': 'Access token',
  'connections.vk.errorHints.401':
    'VK rejected the token (error 5). Issue a new one: tokens of blocked clients such as Kate Mobile or VK Admin will not recover.',
  'connections.x.label': 'X (Twitter)',
  'connections.x.archive.title': 'Import an X data archive',
  'connections.x.archive.hint':
    'Settings -> Your account -> Download an archive of your data. Once the archive is ready, unzip it and select the JSON files under data/ for tweets and direct messages.',
  'connections.x.archive.fileHint': 'tweets.js, direct-messages.js',
  'connections.x.api.title': 'Connect the X API v2',
  'connections.x.api.hint':
    'Create an app at https://developer.x.com/, generate a user-context bearer token, and paste it as "secret:x:token".',
  'connections.x.fields.token.label': 'Bearer token',
  'connections.x.errorHints.401':
    'Bearer token rejected. Generate a new one in the X developer portal.',
  'connections.x.errorHints.403':
    'Token is valid but lacks the users.read scope.',
  'connections.whatsapp.label': 'WhatsApp',
  'connections.whatsapp.archive.title': 'Import a WhatsApp chat export',
  'connections.whatsapp.archive.hint':
    'In the WhatsApp app, open a chat -> ... -> More -> Export chat (no media). Drop the resulting "WhatsApp Chat with NAME.txt" into the import box.',
  'connections.whatsapp.archive.fileHint': 'WhatsApp Chat with *.txt',
  'connections.whatsapp.api.title': 'Connect the WhatsApp Cloud API',
  'connections.whatsapp.api.hint':
    'Create a Meta for Developers app, add the WhatsApp product, copy the temporary or system-user access token and the phone number id (WHATSAPP_PHONE_NUMBER_ID).',
  'connections.whatsapp.fields.token.label': 'Access token',
  'connections.whatsapp.fields.phoneNumberId.label': 'Phone number ID',
  'connections.whatsapp.errorHints.400':
    'Meta returned 400. Re-check the access token and that the app is in Live mode.',
  'connections.whatsapp.errorHints.401':
    'Access token rejected. Generate a new system-user token in Meta Business.',
  'connections.facebook.label': 'Facebook',
  'connections.facebook.archive.title': 'Import a Facebook download',
  'connections.facebook.archive.hint':
    'Settings & privacy -> Settings -> Your information -> Download your information. Choose "JSON" and select the categories you need (messages, posts).',
  'connections.facebook.archive.fileHint': 'messages_*.json, posts_*.json',
  'connections.facebook.api.title': 'Connect the Facebook Graph API',
  'connections.facebook.api.hint':
    'In your Meta for Developers app, add a Facebook Page, generate a page access token (FACEBOOK_PAGE_ACCESS_TOKEN) and note the page id (FACEBOOK_PAGE_ID).',
  'connections.facebook.fields.token.label': 'Page access token',
  'connections.facebook.fields.pageId.label': 'Page ID',
  'connections.facebook.errorHints.400':
    'Graph returned 400. Verify the access token has not expired (page tokens are short-lived).',
  'connections.facebook.errorHints.401':
    'Access token rejected. Re-issue a fresh page token in Graph API Explorer.',
  'connections.linkedin.label': 'LinkedIn',
  'connections.linkedin.archive.title': 'Import a LinkedIn data export',
  'connections.linkedin.archive.hint':
    'Settings & Privacy -> Data privacy -> Get a copy of your data. Pick "Want something in particular?" and request "Messages" + "Posts".',
  'connections.linkedin.archive.fileHint': 'messages.csv, Shares.csv',
  'connections.linkedin.api.title': 'Connect the LinkedIn REST API',
  'connections.linkedin.api.hint':
    'Create an app at https://www.linkedin.com/developers/, request the "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products, and paste the OAuth2 access token plus your author URN (LINKEDIN_AUTHOR_URN).',
  'connections.linkedin.fields.token.label': 'Access token',
  'connections.linkedin.fields.authorUrn.label': 'Author URN',
  'connections.linkedin.errorHints.401':
    'OAuth2 access token rejected. Re-run the auth code flow.',
  'connections.habr-career.label': 'career.habr.com',
  'connections.habr-career.archive.title':
    'Import a career.habr.com applications JSON',
  'connections.habr-career.archive.hint':
    'On career.habr.com, open your account, go to "Отклики на вакансии" and use the export-to-JSON action. Save the file and load it into the SPA.',
  'connections.habr-career.archive.fileHint': 'applications.json',
  'connections.habr-career.api.title':
    'Connect the career.habr.com private API',
  'connections.habr-career.api.hint':
    'Generate a personal access token from career.habr.com -> Settings -> Tokens, and paste it as "secret:habr-career:token".',
  'connections.habr-career.fields.token.label': 'Personal access token',
  'connections.habr-career.errorHints.401':
    'career.habr.com rejected the token. Re-issue it from Settings -> Tokens.',
  'connections.hh.label': 'hh.ru',
  'connections.hh.archive.title': 'Import an hh.ru negotiations archive',
  'connections.hh.archive.hint':
    'Open https://hh.ru/applicant/negotiations, use the JSON export, save the file and load it here.',
  'connections.hh.archive.fileHint': 'negotiations.json',
  'connections.hh.api.title': 'Connect the hh.ru API',
  'connections.hh.api.hint':
    'Register an app at https://dev.hh.ru/, run the OAuth2 client-credentials/authorisation-code flow and paste the access token as "secret:hh:token".',
  'connections.hh.fields.token.label': 'Access token',
  'connections.hh.errorHints.401':
    'hh.ru rejected the token. Refresh it via your app at https://dev.hh.ru/.',
  'connections.github.label': 'GitHub',
  'connections.github.archive.title': 'Import a gh api JSON dump',
  'connections.github.archive.hint':
    'Save a JSON dump from `gh api` (e.g. `gh api repos/OWNER/REPO/issues --paginate > issues.json`) or an envelope `{ issues, comments, pulls, reviews, reviewComments, discussions }` and drop the file here.',
  'connections.github.archive.fileHint':
    'issues.json, pulls.json, comments.json, envelope.json',
  'connections.github.api.title': 'Connect the GitHub REST API',
  'connections.github.api.hint':
    'Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens with read access to issues, pull requests, and the repositories you want to clone, plus write access to issues if you intend to post comments. Paste it as "secret:github:access-token".',
  'connections.github.fields.token.label': 'Personal access token',
  'connections.github.errorHints.401':
    'Token rejected. Re-issue a personal access token at https://github.com/settings/personal-access-tokens.',
  'connections.github.errorHints.403':
    'GitHub returned 403. The token may be missing scopes (issues:read, pull_requests:read, contents:read) or hitting a secondary rate limit.',
  'connections.github.errorHints.404':
    'Repository not found or not visible. Confirm the token has access to the target owner/repo.',
  'connections.upwork.label': 'Upwork',
  'connections.upwork.archive.title': 'Import an Upwork data export',
  'connections.upwork.archive.hint':
    'Upwork lets you export transaction history (Reports → Transaction History → Download CSV), per-job archives, and internal admin envelopes (`{ jobs, contracts, rooms, messages, transactions }`). Drop the resulting CSV or JSON file here with source "upwork".',
  'connections.upwork.archive.fileHint':
    'transactions.csv, jobs.json, contracts.json, envelope.json',
  'connections.upwork.api.title': 'Connect the Upwork GraphQL API',
  'connections.upwork.api.hint':
    'Register an OAuth2 application at https://www.upwork.com/services/api/apply, run the 3-legged authorisation-code flow, and paste the access token as "secret:upwork:access-token". Store the optional refresh token at "secret:upwork:refresh-token".',
  'connections.upwork.fields.token.label': 'OAuth access token',
  'connections.upwork.fields.refreshToken.label': 'Refresh token',
  'connections.upwork.fields.organizationId.label': 'Organization (tenant) ID',
  'connections.upwork.errorHints.401':
    'Upwork rejected the access token. Refresh it via your registered OAuth2 app or re-run the authorisation-code flow.',
  'connections.upwork.errorHints.403':
    'Token valid but missing scope. Re-issue with the messaging, search, and reports scopes you need.',
  'connections.upwork.errorHints.429':
    'Upwork rate-limited the call. Back off; the adapter caches results for 24 hours per the API ToS.',
  'connections.peopleperhour.label': 'PeoplePerHour',
  'connections.peopleperhour.archive.title':
    'Import a PeoplePerHour data export',
  'connections.peopleperhour.archive.hint':
    'PeoplePerHour exposes account-level exports through the GDPR data-subject access request bundle (Settings → Privacy → Request my data) and the Earnings CSV (Reports → Earnings → Export). Drop the resulting JSON or CSV here with source "peopleperhour".',
  'connections.peopleperhour.archive.fileHint':
    'projects.json, proposals.json, workstreams.json, earnings.csv',
  'connections.peopleperhour.api.title': 'Connect the PeoplePerHour REST API',
  'connections.peopleperhour.api.hint':
    'Register an OAuth2 application via the PeoplePerHour developer portal (https://www.peopleperhour.com/site/developers), run the authorisation-code flow, and paste the access token as "secret:peopleperhour:access-token". Store the optional refresh token at "secret:peopleperhour:refresh-token". The adapter caches every response for 24 hours per the PPH API ToS.',
  'connections.peopleperhour.fields.accessToken.label': 'OAuth access token',
  'connections.peopleperhour.fields.refreshToken.label': 'Refresh token',
  'connections.peopleperhour.errorHints.401':
    'PeoplePerHour rejected the access token. Refresh it via your registered OAuth2 app or re-run the authorisation-code flow.',
  'connections.peopleperhour.errorHints.403':
    'Token valid but missing scope. Re-issue with the projects, proposals, and workstreams scopes you need.',
  'connections.peopleperhour.errorHints.429':
    'PeoplePerHour rate-limited the call. Back off; the adapter caches results for 24 hours per the API ToS.',
  'connections.superjob.label': 'superjob.ru',
  'connections.superjob.archive.title': 'Import a SuperJob responses archive',
  'connections.superjob.archive.hint':
    'On superjob.ru, open your applicant cabinet -> "Отклики" and use the JSON export action. Save the file and load it here.',
  'connections.superjob.archive.fileHint': 'responses.json',
  'connections.superjob.api.title': 'Connect the SuperJob API',
  'connections.superjob.api.hint':
    'Register an application at https://api.superjob.ru/register/, copy the secret key as SUPERJOB_APP_ID and the access token as "secret:superjob:token".',
  'connections.superjob.fields.appId.label': 'App ID (X-Api-App-Id)',
  'connections.superjob.fields.token.label': 'Access token',
  'connections.superjob.errorHints.401':
    'SuperJob rejected the App ID. Re-check it in your applicant cabinet.',
  'connections.naukri.label': 'naukri.com',
  'connections.naukri.archive.title': 'Import a Naukri recruiter inbox export',
  'connections.naukri.archive.hint':
    'Open naukri.com -> "Recruiter messages", use the browser export (or save the JSON the network tab returns) and load the file here.',
  'connections.naukri.archive.fileHint': 'inbox.json',
  'connections.naukri.session.title':
    'Sign in once in the local browser session',
  'connections.naukri.session.hint':
    'Start the local server, open the CV screen and run a read. The browser opens naukri.com; sign in there once and the profile directory keeps the session for later runs.',
  'connections.vietnamworks.label': 'vietnamworks.com',
  'connections.vietnamworks.archive.title':
    'Import a VietnamWorks message centre export',
  'connections.vietnamworks.archive.hint':
    'Open vietnamworks.com -> "My Jobs" -> messages, save the JSON payload the page loads and import it here.',
  'connections.vietnamworks.archive.fileHint': 'messages.json',
  'connections.vietnamworks.session.title':
    'Sign in once in the local browser session',
  'connections.vietnamworks.session.hint':
    'Start the local server, open the CV screen and run a read. The browser opens vietnamworks.com; sign in there once and the profile directory keeps the session for later runs.',
  'connections.topcv.label': 'topcv.vn',
  'connections.topcv.archive.title': 'Import a TopCV employer message export',
  'connections.topcv.archive.hint':
    'Open topcv.vn -> "Tin nhắn", save the JSON payload the page loads and import it here.',
  'connections.topcv.archive.fileHint': 'messages.json',
  'connections.topcv.session.title':
    'Sign in once in the local browser session',
  'connections.topcv.session.hint':
    'Start the local server, open the CV screen and run a read. The browser opens topcv.vn; sign in there once and the profile directory keeps the session for later runs.',
  'tutorial.button': 'Tutorial',
  'tutorial.skip': 'Skip step',
  'tutorial.next': 'Next',
  'tutorial.finish': 'Finish',
  'tutorial.off': 'Turn off tutorial',
  'tutorial.progress': 'Step {current} of {total}',
  'tutorial.connect.title': 'Connect a service first',
  'tutorial.connect.body':
    'meta-sovereign is empty until you plug in at least one provider. Tap the highlighted "Connections" entry to open the per-provider setup screen — you can come back to this tour any time.',
  'tutorial.welcome.title': 'Welcome to meta-sovereign',
  'tutorial.welcome.body':
    'This is your local-first personal CRM and unified inbox. Nothing leaves your browser unless you point it at a server. Hit "Next" to walk through the headline flows.',
  'tutorial.chat.title': 'Chat — your unified inbox',
  'tutorial.chat.body':
    'Every chat from every connected service shows up here. If a section is empty, it explains how to plug in a provider — try opening the "Chat" tab once you finish the tour.',
  'tutorial.contacts.title': 'Contacts — one row per person',
  'tutorial.contacts.body':
    'Contacts are merged across networks. Connect at least one provider to populate this list.',
  'tutorial.automation.title': 'Automation — patterns to replies',
  'tutorial.automation.body':
    'Build node graphs that route incoming messages from a regex pattern to a reply variation. Patterns + reply groups feed this graph editor.',
  'tutorial.backup.title': 'Backup — encrypted at rest',
  'tutorial.backup.body':
    'Backups encrypt the local store with a passphrase. If you started a local server, the archive lives next to the server data directory.',
  'tutorial.connections.title': 'Connect a service first',
  'tutorial.connections.body':
    'Tap Connections to pick a provider. Each provider walks you through how to obtain credentials in-app — no external instructions needed.',
  'tutorial.connectionDetail.title': 'Follow the per-service walkthrough',
  'tutorial.connectionDetail.body':
    'The provider screen lists every step needed to obtain credentials, plus the live API probe to confirm the connection works.',

  // CV synchronisation screen (issue #29).
  'cv.title': 'CV synchronisation',
  'cv.intro':
    'Read your CV from every supported job platform through the local browser session, compare the versions field by field, then plan and apply an update. Nothing is written until you press Apply.',
  'cv.use': 'Use',
  'cv.platform': 'Platform',
  'cv.markup': 'Markup access',
  'cv.steps': 'Plan steps',
  'cv.snapshot': 'Last snapshot',
  'cv.confidence': '{verified} verified / {draft} draft',
  'cv.noSnapshot': 'never read',
  'cv.loginPlaceholder': 'profile login or id',
  'cv.read': 'Read selected',
  'cv.compare': 'Compare',
  'cv.planSync': 'Plan sync',
  'cv.applySync': 'Apply sync',
  'cv.busy': 'Working — the browser session is driving the platform…',
  'cv.differences': 'Differences',
  'cv.field': 'Field',
  'cv.values': 'Values',
  'cv.missing': 'Missing on',
  'cv.noConflicts':
    'No conflicts: every platform agrees on the fields that were read.',
  'cv.syncTitle': 'Sync plan',
  'cv.dryRun': 'Dry run — nothing was written to any platform.',
  'cv.applied': 'Applied — the listed platforms were updated.',
  'cv.action':
    '{platform}: {writable} writable, {unsupported} unsupported — {paths}',
  'cv.morePaths': '(+{count} more)',
  'cv.telemetry': 'Recent runs',
  'cv.noRuns': 'No runs recorded yet.',
  'cv.unavailable':
    'This server does not provide the CV routes. Start the JS server (`meta-sovereign serve`) or use the `meta-sovereign cv-*` commands, which drive the browser locally.',
  'chat.search': 'Search chats and messages',
  'chat.noMatches': 'No chats match.',
  'chat.you': 'You',
  'chat.group.today': 'Today',
  'chat.group.yesterday': 'Yesterday',
  'chat.group.week': 'This week',
  'chat.group.older': 'Older',
  'chat.typing': '{names} typing…',
  'chat.typingAutomation': '{name} is typing for you…',
  'chat.subtitle.personal': '{source} · personal chat',
  'chat.subtitle.group': '{source} · {count} people',
  'chat.automations': 'Automations',
  'chat.automation.none':
    'No automation is offered in chats yet. Add the "chat menu" trigger to one under Automation.',
  'chat.automation.test': 'Test in this chat',
  'chat.automation.run': 'Run with its conditions',
  'chat.automation.confirmAuto':
    '"{name}" sends without review. Run it in this chat now?',
  'chat.empty': 'No messages in this chat yet.',
  'chat.form.informal': 'informal ("ты")',
  'chat.form.formal': 'formal ("вы")',
  'chat.draft.title': 'Draft from {name} · {form}',
  'chat.draft.text': 'Message',
  'chat.draft.send': 'Send',
  'chat.draft.switchTo': 'Switch to {form}',
  'chat.draft.open': 'Open chat',
  'chat.draft.openFilled': 'Open with the text filled in',
  'chat.draft.markSent': 'I sent it myself',
  'chat.draft.skip': 'Skip',
  'chat.notice.queued': '{count} draft(s) ready below: review, then send.',
  'chat.notice.nothing': 'Nothing to send here: {reason}.',
  'chat.notice.sentAuto': 'Sent {count} message(s).',
  'chat.notice.stored':
    'No local server: the message is saved in this browser only. Start the server to deliver it.',
  'chat.notice.sent': 'Sent.',
  'chat.notice.manual': 'Marked as sent.',
  'chat.notice.skipped': 'Skipped; it will not be offered again for a while.',
  'chat.notice.failed':
    'Not sent: {error}. Retry, edit, send it yourself or skip.',
  'chat.suggest.reply': 'Replies you gave to this message before',
  'chat.suggest.word': 'Next words from your own messages',
  'chat.suggest.count': 'Used {count} time(s)',
  'automations.mode.safe': 'safe: drafts to confirm',
  'automations.mode.auto': 'automatic',
  'automations.reason.none': 'no one matched',
  'automations.reason.network': 'another network',
  'automations.reason.not-personal': 'not a personal chat',
  'automations.reason.not-mutual': 'you never wrote there',
  'automations.reason.talked-recently': 'talked recently',
  'automations.reason.last-from-me': 'the last message is yours',
  'automations.reason.last-from-contact': 'the last message is theirs',
  'automations.reason.last-from-nobody': 'no messages',
  'automations.reason.draft-pending': 'a draft is already waiting',
  'automations.reason.already-sent': 'already sent recently',
  'automations.reason.already-skipped': 'skipped recently',
  'automations.title': 'Automations',
  'automations.intro':
    'Each automation says who to message, when, on what conditions and with which text. Safe mode leaves a draft in each chat for you to confirm; automatic mode sends with typing and pauses.',
  'automations.new': 'New automation',
  'automations.newName': 'New automation',
  'automations.pick':
    'Pick an automation to edit, preview or run it, or start a new one.',
  'automations.preset': 'preset',
  'automations.off': 'off',
  'automations.edit': 'Edit {name}',
  'automations.close': 'close',
  'automations.delete': 'delete',
  'automations.confirmDelete': 'Delete the automation "{name}"?',
  'automations.preview': 'preview',
  'automations.runSafe': 'save and queue drafts',
  'automations.runAuto': 'save and send now',
  'automations.history': 'History',
  'automations.useSelection': 'the {count} selected',
  'automations.section.about': 'Automation',
  'automations.section.triggers': 'When it runs',
  'automations.section.audience': 'Who',
  'automations.section.conditions': 'Conditions',
  'automations.section.message': 'Message',
  'automations.section.pacing': 'Pacing',
  'automations.field.name': 'Name',
  'automations.field.description': 'Description',
  'automations.field.enabled':
    'enabled (schedules and incoming messages fire it)',
  'automations.field.mode': 'Mode',
  'automations.field.audience': 'Audience',
  'automations.field.silentDays': 'Silent for at least (days)',
  'automations.field.cooldownDays': 'Not again for (days)',
  'automations.field.mutual': 'only chats where you wrote too',
  'automations.field.personal': 'only personal chats',
  'automations.field.lastFrom': 'Last message from',
  'automations.field.networks': 'Networks (empty: all)',
  'automations.field.form': 'Address form',
  'automations.field.limit': 'At most per run',
  'automations.field.dailyCap': 'At most per day',
  'automations.field.minDelay': 'Pause from (seconds)',
  'automations.field.maxDelay': 'Pause up to (seconds)',
  'automations.field.typing': 'show typing before each message',
  'automations.trigger.manual': 'by hand',
  'automations.trigger.chat-menu': "from a chat's menu",
  'automations.trigger.schedule': 'every',
  'automations.trigger.incoming': 'on an incoming message matching',
  'automations.hint.schedule': '30m, 12h, 1d or 2w; empty: no schedule',
  'automations.hint.incoming': 'a regular expression; empty: not on messages',
  'automations.hint.audience':
    'personal, friends:vk, chat:vk:<id>, community:vk:<id>, list:<id>, audience:<id>, person:vk:<id>; join with | (or), & (and), - (except) and brackets',
  'automations.hint.template':
    '{name}, {days} and {network} are filled in for each person',
  'automations.form.auto': 'detect ты/вы',
  'automations.form.informal': 'informal (ты)',
  'automations.form.formal': 'formal (вы)',
  'automations.lastFrom.any': 'anyone',
  'automations.lastFrom.me': 'me',
  'automations.lastFrom.contact': 'them',
  'automations.status.sent': 'sent',
  'automations.status.failed': 'not sent',
  'automations.status.skipped': 'skipped',
  'automations.plan.title': '{count} to message',
  'automations.plan.nothingSent': 'A preview: nothing was sent or queued.',
  'automations.plan.leftOut': 'Left out: {reasons}',
  'automations.notice.saved': 'Saved "{name}".',
  'automations.notice.deleted': 'Deleted "{name}".',
  'automations.notice.queued':
    '{count} draft(s) wait in their chats: open each chat to review and send.',
  'automations.notice.listSaved': 'Saved the list "{name}" ({count} people).',
  'automations.notice.audienceSaved':
    'Saved the audience "{name}" ({count} people).',
  'automations.error.name': 'Give the automation a name',
  'automations.error.number': 'Numbers must be zero or more',
  'automations.error.audience': 'The audience does not parse',
  'automations.error.trigger': 'Choose at least one way to run it',
  'automations.error.invalid': 'The automation is not valid',
  'automations.people.title': 'People',
  'automations.people.search': 'Search people by name, handle or network',
  'automations.people.sameAs': 'also on {count} more network(s)',
  'automations.people.selected': '{count} selected',
  'automations.people.test': 'test: ignore the conditions',
  'automations.people.run': 'run "{name}" on them',
  'automations.people.pickAutomation':
    'Open an automation to run it on the selected people.',
  'automations.people.listName': 'List name',
  'automations.people.saveList': 'save as a list',
  'automations.people.clear': 'clear the selection',
  'automations.audiences.title': 'Audiences',
  'automations.audiences.use': 'use',
  'automations.audiences.count': 'count',
  'automations.audiences.resolved': '{count} people: {names}',
  'settings.appearance.title': 'Appearance',
  'settings.appearance.intro':
    'The theme and skin apply to every screen and are kept in this browser. The Theme button in the header switches between light and dark.',
  'settings.appearance.theme': 'Theme',
  'settings.appearance.skin': 'Skin',
  'settings.theme.system': 'follow the system',
  'settings.theme.light': 'light',
  'settings.theme.dark': 'dark',
  'settings.theme.auto': 'auto: light by day (7–19), dark at night',
  'settings.skin.t3': 'like t3.codes (default)',
  'settings.skin.telegram': 'like Telegram',
  'settings.skin.whatsapp': 'like WhatsApp',
  'settings.skin.signal': 'like Signal',
};
