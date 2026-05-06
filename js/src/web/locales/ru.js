// Russian locale (issue #18). Keys must mirror ./en.js exactly; the
// parity test in js/tests/i18n.test.js fails the build if they
// drift. Reviewed against the Telegram Desktop ru.strings file
// (https://github.com/telegramdesktop/tdesktop) for terminology
// consistency on common UI verbs.

export const ru = {
  appName: 'meta-sovereign',
  skipLink: 'Перейти к основному содержимому',
  'header.theme': 'Тема',
  'header.themeAria': 'Переключить тёмный режим',
  'header.tutorial': 'Руководство',
  'header.tutorialAria': 'Открыть руководство',
  'header.language': 'Язык',
  'header.languageAria': 'Выбрать язык интерфейса',
  'header.systemDefault': 'Системный',
  'header.online': 'онлайн',
  'header.offline': 'оффлайн',
  'nav.chat': 'Чат',
  'nav.operator': 'Оператор',
  'nav.contacts': 'Контакты',
  'nav.automation': 'Автоматизация',
  'nav.patterns': 'Шаблоны',
  'nav.replies': 'Ответы',
  'nav.facts': 'Факты',
  'nav.audience': 'Аудитория',
  'nav.broadcast': 'Рассылка',
  'nav.outreach': 'Точечная рассылка',
  'nav.profile': 'Профиль',
  'nav.backup': 'Резервная копия',
  'nav.status': 'Статус',
  'nav.settings': 'Настройки',
  'common.loading': 'Загрузка...',
  'common.refresh': 'обновить',
  'common.save': 'сохранить',
  'common.send': 'отправить',
  'common.cancel': 'отменить',
  'common.preview': 'предпросмотр',
  'common.queue': 'в очередь',
  'common.evaluate': 'выполнить',
  'common.infer': 'вывести',
  'chat.aside': 'Чаты',
  'chat.placeholder': 'Введите сообщение...',
  'operator.title': 'Оператор',
  'operator.next': 'ДАЛЕЕ (N)',
  'operator.done': 'ГОТОВО (D)',
  'operator.progress': '{current} / {total}',
  'contacts.title': 'Контакты ({count})',
  'contacts.identity': 'Идентификатор',
  'contacts.networks': 'Сети',
  'contacts.chats': 'Чаты',
  'contacts.messages': 'Сообщения',
  'contacts.lastSeen': 'Последняя активность',
  'automation.title': 'Графы автоматизации',
  'automation.edges': 'Связей: {count}',
  'patterns.title': 'Шаблоны',
  'patterns.inferTitle': 'Вывести регулярку из примеров',
  'patterns.examplesPlaceholder': 'один пример в строке',
  'patterns.modeSimple': 'простой',
  'patterns.modeLcs': 'lcs (переменные пропуски)',
  'patterns.idPlaceholder': 'идентификатор шаблона (например, greet)',
  'patterns.labelPlaceholder': 'метка',
  'patterns.colId': 'идентификатор',
  'patterns.colRegex': 'регулярка',
  'replies.title': 'Группы вариаций ответов',
  'replies.newTitle': 'Создать или обновить группу',
  'replies.idPlaceholder': 'идентификатор группы (например, thanks)',
  'replies.variationsPlaceholder': 'одна вариация в строке',
  'replies.saveGroup': 'сохранить группу',
  'facts.title': 'Факты ({count})',
  'facts.colQuestion': 'Вопрос',
  'facts.colAnswer': 'Ответ',
  'facts.colPattern': 'Шаблон',
  'audience.title': 'Конструктор аудитории',
  'audience.hint':
    'Операторы: AND, OR, NOT, скобки. Измерения: network:, chat:, sender:, kind:, fact:',
  'audience.queryPlaceholder': 'например, network:telegram AND chat:general',
  'audience.contactsCount': 'Контактов: {count}',
  'broadcast.title': 'Рассылка',
  'outreach.title': 'Точечная рассылка',
  'outreach.hint':
    'Массово-персональная рассылка. Предпросмотр всегда; очередь действительно отправляет.',
  'outreach.queryPlaceholder':
    'запрос аудитории, например, network:telegram AND chat:vip',
  'outreach.bodyPlaceholder':
    'Текст. Используйте {name}, {networks}, {chats} для персонализации каждому получателю.',
  'profile.title': 'Профиль',
  'profile.namePlaceholder': 'имя',
  'profile.bioPlaceholder': 'био',
  'profile.saveProfile': 'сохранить профиль',
  'profile.resumeTitle': 'Резюме',
  'profile.titlePlaceholder': 'должность',
  'profile.bodyPlaceholder': 'опыт работы',
  'profile.saveResume': 'сохранить резюме',
  'backup.title': 'Резервная копия',
  'backup.hint': 'Зашифрованные архивы хранятся в каталоге данных сервера.',
  'backup.passphrasePlaceholder': 'необязательная парольная фраза',
  'backup.keepPlaceholder': 'оставить N (необязательно)',
  'backup.create': 'создать резервную копию',
  'backup.restore': 'восстановить',
  'backup.itemMeta': '{size} байт — {timestamp} — {state}',
  'backup.encrypted': 'зашифровано',
  'backup.plain': 'без шифрования',
  'status.title': 'Статус',
  'settings.title': 'Настройки',
  'settings.intro':
    'Все подключения провайдеров здесь. Вставьте учётные данные, загрузите архив и проверьте API. Учётные данные хранятся как зашифрованные ссылки secret:* и никогда не передаются другим узлам.',
  'settings.credentials': 'Учётные данные',
  'settings.optional': '(необязательно)',
  'settings.storedAs': 'Сохраняется как {id}',
  'settings.saveCredentials': 'Сохранить учётные данные',
  'settings.saving': 'сохранение...',
  'settings.saved': 'сохранено.',
  'settings.forget': 'Забыть',
  'settings.forgetting': 'забываем {label}...',
  'settings.forgotten': '{label} забыто.',
  'settings.archive': 'Импорт архива',
  'settings.archivePasteHint': 'или вставьте содержимое архива ниже:',
  'settings.archivePastePlaceholder': 'Вставьте содержимое архива сюда',
  'settings.archivePasteWith': 'Вставьте содержимое {label}',
  'settings.importPasted': 'Импортировать вставленное',
  'settings.importing': 'импортируем {label}...',
  'settings.importedCount': 'импортировано {count} сообщений из {label}.',
  'settings.importFailed': 'импорт не удался: {message}',
  'settings.nothingToImport': 'нечего импортировать.',
  'settings.docsLink': 'Как получить учётные данные ↗',
  'settings.credentialsSaved': 'учётные данные сохранены',
  'settings.noCredentials': 'учётных данных пока нет',
  'settings.probe.idle': 'Эндпоинт: {url}',
  'settings.probe.notReady': 'Введите токен, чтобы включить проверку',
  'settings.probe.button': 'Проверить напрямую',
  'settings.probe.probing': 'проверяем...',
  'settings.probe.connected': 'Подключено (HTTP {status})',
  'settings.probe.httpHint': 'API ответил {status}. {hint}',
  'settings.probe.httpNoHint': 'API ответил {status}.',
  'settings.probe.cors':
    'Браузер заблокировал запрос (CORS). Запустите локальный сервер ниже, чтобы проксировать вызов.',
  'settings.probe.network': 'Сетевая ошибка: {message}.',
  'settings.probe.fetchFailed': 'fetch не удался',
  'guide.connectFirstHint':
    'Сначала подключите провайдер, иначе здесь не будет данных.',
  'guide.openSettings': 'Открыть {target}',
  'guide.openSettingsTarget': 'Настройки → Подключения → {label}',
  'guide.openSettingsRoot': 'Настройки → Подключения',
  'guide.probeDisabled':
    'Введите учётные данные в Настройках, чтобы включить проверку {label}.',
  'guide.useThisServer': 'Использовать этот сервер',
  'guide.fallbackTitle': 'Здесь пока ничего нет.',
  'guide.filesLabel': 'Файлы: {hint}',
  'guide.envVarLabel': 'Переменная окружения: {name}',
  'guide.localServer.title':
    'Запустите локальный сервер, чтобы разблокировать этот провайдер',
  'guide.localServer.body':
    'Локальный сервер на том же источнике проксирует запрос к провайдеру и обходит правило CORS браузера. Выберите подходящую среду выполнения.',
  'guide.localServer.rust': 'Rust (рекомендуется)',
  'guide.localServer.rustHint':
    'Использует чисто Rust-бинарник из этого репозитория. По умолчанию http://127.0.0.1:8787.',
  'guide.localServer.node': 'Node / Bun / Deno',
  'guide.localServer.nodeHint':
    'Использует опубликованный JS-сервер. По умолчанию http://127.0.0.1:8787.',
  'guide.localServer.docker': 'Docker',
  'guide.localServer.dockerHint':
    'Запускает тот же JS-сервер в контейнере. См. docker/web.Dockerfile.',
  'guide.localServer.overrideHint':
    'Когда сервер запущен, вставьте его URL ниже и нажмите «Использовать этот сервер» — SPA сохранит адрес и перезагрузится.',
  'guide.chat.title': 'Ваш единый ящик пока пуст.',
  'guide.chat.body':
    'meta-sovereign хранит все чаты со всех подключённых сервисов в одном месте. Подключите провайдера ниже или импортируйте экспортированный архив, чтобы заполнить этот раздел.',
  'guide.operator.title': 'Очередь оператора пуста.',
  'guide.operator.body':
    'Поток карточек оператора проводит вас по непрочитанным сообщениям чат за чатом. Подключите провайдера с поддержкой чатов, чтобы запустить очередь.',
  'guide.contacts.title': 'Контактов пока нет.',
  'guide.contacts.body':
    'Контакты собираются со всех подключённых провайдеров, поэтому один и тот же человек в разных сетях отображается одной строкой. Добавьте провайдера, чтобы заполнить список.',
  'guide.automation.title': 'Графов автоматизации пока нет.',
  'guide.automation.body':
    'Графы автоматизации направляют входящие сообщения от шаблона к вариации ответа. Добавьте узел выше или сначала импортируйте архив, чтобы было с чем работать.',
  'guide.patterns.title': 'Шаблонов пока нет.',
  'guide.patterns.body':
    'Шаблоны выводятся из примеров сообщений. Подключите провайдера или импортируйте архив, затем вернитесь сюда и накормите модуль вывода несколькими примерами.',
  'guide.replies.title': 'Групп вариаций ответов пока нет.',
  'guide.replies.body':
    'Группы ответов извлекаются из ваших предыдущих исходящих сообщений по нечёткому сходству. Подключите провайдера с поддержкой чатов, чтобы наполнить библиотеку ответов.',
  'guide.facts.title': 'Фактов пока не извлечено.',
  'guide.facts.body':
    'Факты — это пары «вопрос → ответ», извлечённые из сообщений вашими шаблонами. Добавьте шаблон с группой захвата или подключите чат-провайдера, чтобы начать сбор данных.',
  'guide.audience.title': 'Создайте свою первую аудиторию.',
  'guide.audience.body':
    'Перекрёстно фильтруйте контакты с помощью AND/OR/NOT и измерений вроде network:, chat:, sender:, kind:, fact:. Подключите хотя бы одного провайдера, чтобы было кого фильтровать.',
  'guide.broadcast.title': 'Целей рассылки пока нет.',
  'guide.broadcast.body':
    'Рассылка отправляет одно и то же сообщение во все подключённые ленты. Подключите провайдера с публичной публикацией ниже, чтобы появился флажок цели.',
  'guide.outreach.title': 'Поверхности точечной рассылки пока нет.',
  'guide.outreach.body':
    'Массово-персональная рассылка отправляет шаблонное сообщение 1:1 каждому контакту в запросе аудитории. Подключите провайдера с поддержкой чатов, чтобы включить точечную рассылку.',
  'guide.profile.title': 'Профиля пока нет.',
  'guide.profile.body':
    'Редактируйте профиль и резюме здесь; сохранения отправляются всем подключённым провайдерам. Подключите хотя бы одного провайдера, чтобы конверту синхронизации было куда уйти.',
  'guide.backup.title': 'Резервных архивов пока нет.',
  'guide.backup.body':
    'Резервные копии — это зашифрованные на диске архивы локального хранилища. Установите парольную фразу выше, нажмите «создать резервную копию», когда появятся данные, или сначала запустите локальный сервер, если хотите хранить копии на диске.',
  'guide.status.title': 'Статус показывает только локальное хранилище.',
  'guide.status.body':
    'Поля статуса появляются, когда сервер доступен. Запустите локальный сервер ниже или продолжайте работу полностью офлайн — SPA пишет напрямую в хранилище браузера.',
  'guide.settings.title': 'Настройки',
  'guide.settings.body':
    'Подключения провайдеров, учётные данные и импорт архивов хранятся здесь. Список ниже отражает все каталогизированные провайдеры; выберите одного, чтобы ввести учётные данные, загрузить архив и проверить API.',
  'connections.title': 'Подключения',
  'connections.intro':
    'Выберите провайдера, чтобы ввести учётные данные, импортировать архив и проверить API.',
  'connections.state.connected': 'Подключено',
  'connections.state.notConnected': 'Не подключено',
  'connections.state.actionRequired': 'Требуется действие',
  'connections.openDetail': 'Настроить',
  'connections.back': 'К подключениям',
  'connections.email.label': 'Электронная почта',
  'connections.email.archive.title': 'Импорт экспорта почты в .eml или mbox',
  'connections.email.archive.hint':
    'Экспортируйте почту от вашего провайдера в файлы .eml или архив mbox, включая mbox-файлы Gmail Takeout. Перетащите файл в окно импорта с источником «email».',
  'connections.email.archive.fileHint': '*.eml, *.mbox',
  'connections.email.api.title': 'Подключите API и протоколы почты',
  'connections.email.api.hint':
    'Используйте JMAP, Gmail API или Microsoft Graph прямо из браузера, когда CORS позволяет. IMAP, POP3 и SMTP требуют локального сервера, поскольку браузеры не открывают сырые TCP/TLS-сокеты для почты.',
  'connections.email.fields.token.label': 'OAuth-токен доступа',
  'connections.email.errorHints.401':
    'Токен отклонён. Перевыпустите OAuth-токен с областью gmail.readonly.',
  'connections.email.errorHints.403':
    'Недостаточно прав. Перевыпустите токен с правами gmail.readonly или jmap.',
  'connections.telegram.label': 'Telegram',
  'connections.telegram.archive.title': 'Импорт архива Telegram Desktop',
  'connections.telegram.archive.hint':
    'Telegram Desktop -> Настройки -> Дополнительно -> Экспорт данных Telegram. Выберите «Личные чаты» + «JSON» и перетащите получившийся «result.json» в окно импорта ниже.',
  'connections.telegram.archive.fileHint': 'result.json',
  'connections.telegram.api.title': 'Подключите Telegram Bot API',
  'connections.telegram.api.hint':
    'Напишите @BotFather в Telegram, выполните /newbot, скопируйте токен бота и вставьте его как секрет с именем «secret:telegram:bot-token».',
  'connections.telegram.fields.token.label': 'Токен бота',
  'connections.telegram.errorHints.401':
    'Токен отклонён. Запросите у @BotFather новый токен или отзовите утёкший.',
  'connections.telegram.errorHints.404':
    'Эндпоинт не найден. Проверьте, что в токене бота нет пробелов.',
  'connections.vk.label': 'ВКонтакте',
  'connections.vk.archive.title': 'Импорт архива переписок ВКонтакте',
  'connections.vk.archive.hint':
    'Откройте https://vk.com/data_protection, запросите архив, распакуйте его и загрузите JSON-файлы из папки messages.',
  'connections.vk.archive.fileHint': 'messages*.json',
  'connections.vk.api.title': 'Подключите API ВКонтакте',
  'connections.vk.api.hint':
    'Создайте Standalone-приложение по адресу https://vk.com/apps?act=manage и запросите access token с правом messages. Вставьте его как «secret:vk:token».',
  'connections.vk.fields.token.label': 'Токен доступа',
  'connections.vk.errorHints.401':
    'Access token истёк. Повторите неявный поток на id.vk.com.',
  'connections.x.label': 'X (Twitter)',
  'connections.x.archive.title': 'Импорт архива данных X',
  'connections.x.archive.hint':
    'Settings -> Your account -> Download an archive of your data. Когда архив готов, распакуйте его и выберите JSON-файлы в папке data/ для твитов и личных сообщений.',
  'connections.x.archive.fileHint': 'tweets.js, direct-messages.js',
  'connections.x.api.title': 'Подключите X API v2',
  'connections.x.api.hint':
    'Создайте приложение на https://developer.x.com/, сгенерируйте bearer-токен пользователя и вставьте его как «secret:x:token».',
  'connections.x.fields.token.label': 'Bearer-токен',
  'connections.x.errorHints.401':
    'Bearer-токен отклонён. Сгенерируйте новый в портале разработчика X.',
  'connections.x.errorHints.403':
    'Токен валиден, но не имеет области users.read.',
  'connections.whatsapp.label': 'WhatsApp',
  'connections.whatsapp.archive.title': 'Импорт экспорта чата WhatsApp',
  'connections.whatsapp.archive.hint':
    'В приложении WhatsApp откройте чат -> ... -> Ещё -> Экспорт чата (без медиа). Перетащите получившийся файл «WhatsApp Chat with NAME.txt» в окно импорта.',
  'connections.whatsapp.archive.fileHint': 'WhatsApp Chat with *.txt',
  'connections.whatsapp.api.title': 'Подключите WhatsApp Cloud API',
  'connections.whatsapp.api.hint':
    'Создайте приложение Meta for Developers, добавьте продукт WhatsApp, скопируйте временный или системный access token и идентификатор номера телефона (WHATSAPP_PHONE_NUMBER_ID).',
  'connections.whatsapp.fields.token.label': 'Токен доступа',
  'connections.whatsapp.fields.phoneNumberId.label': 'Идентификатор номера',
  'connections.whatsapp.errorHints.400':
    'Meta вернул 400. Проверьте access token и что приложение в режиме Live.',
  'connections.whatsapp.errorHints.401':
    'Access token отклонён. Сгенерируйте новый системный токен в Meta Business.',
  'connections.facebook.label': 'Facebook',
  'connections.facebook.archive.title': 'Импорт скачивания Facebook',
  'connections.facebook.archive.hint':
    'Settings & privacy -> Settings -> Your information -> Download your information. Выберите «JSON» и нужные категории (сообщения, посты).',
  'connections.facebook.archive.fileHint': 'messages_*.json, posts_*.json',
  'connections.facebook.api.title': 'Подключите Facebook Graph API',
  'connections.facebook.api.hint':
    'В вашем приложении Meta for Developers добавьте Facebook Page, сгенерируйте page access token (FACEBOOK_PAGE_ACCESS_TOKEN) и запишите идентификатор страницы (FACEBOOK_PAGE_ID).',
  'connections.facebook.fields.token.label': 'Токен доступа страницы',
  'connections.facebook.fields.pageId.label': 'Идентификатор страницы',
  'connections.facebook.errorHints.400':
    'Graph вернул 400. Проверьте, что access token не истёк (page-токены недолговечны).',
  'connections.facebook.errorHints.401':
    'Access token отклонён. Перевыпустите свежий page-токен в Graph API Explorer.',
  'connections.linkedin.label': 'LinkedIn',
  'connections.linkedin.archive.title': 'Импорт экспорта данных LinkedIn',
  'connections.linkedin.archive.hint':
    'Settings & Privacy -> Data privacy -> Get a copy of your data. Выберите «Want something in particular?» и запросите «Messages» + «Posts».',
  'connections.linkedin.archive.fileHint': 'messages.csv, Shares.csv',
  'connections.linkedin.api.title': 'Подключите LinkedIn REST API',
  'connections.linkedin.api.hint':
    'Создайте приложение на https://www.linkedin.com/developers/, запросите продукты «Share on LinkedIn» + «Sign In with LinkedIn using OpenID Connect» и вставьте OAuth2 access token и author URN (LINKEDIN_AUTHOR_URN).',
  'connections.linkedin.fields.token.label': 'Токен доступа',
  'connections.linkedin.fields.authorUrn.label': 'URN автора',
  'connections.linkedin.errorHints.401':
    'OAuth2 access token отклонён. Повторите authorization code flow.',
  'connections.habr-career.label': 'career.habr.com',
  'connections.habr-career.archive.title':
    'Импорт JSON откликов career.habr.com',
  'connections.habr-career.archive.hint':
    'На career.habr.com откройте свой аккаунт, перейдите в «Отклики на вакансии» и используйте экспорт в JSON. Сохраните файл и загрузите его в SPA.',
  'connections.habr-career.archive.fileHint': 'applications.json',
  'connections.habr-career.api.title': 'Подключите частный API career.habr.com',
  'connections.habr-career.api.hint':
    'Сгенерируйте персональный access token в career.habr.com -> Настройки -> Токены и вставьте его как «secret:habr-career:token».',
  'connections.habr-career.fields.token.label': 'Персональный токен доступа',
  'connections.habr-career.errorHints.401':
    'career.habr.com отклонил токен. Перевыпустите его в Настройках -> Токены.',
  'connections.hh.label': 'hh.ru',
  'connections.hh.archive.title': 'Импорт архива откликов hh.ru',
  'connections.hh.archive.hint':
    'Откройте https://hh.ru/applicant/negotiations, используйте JSON-экспорт, сохраните файл и загрузите его сюда.',
  'connections.hh.archive.fileHint': 'negotiations.json',
  'connections.hh.api.title': 'Подключите API hh.ru',
  'connections.hh.api.hint':
    'Зарегистрируйте приложение на https://dev.hh.ru/, выполните OAuth2 client-credentials/authorization-code и вставьте access token как «secret:hh:token».',
  'connections.hh.fields.token.label': 'Токен доступа',
  'connections.hh.errorHints.401':
    'hh.ru отклонил токен. Обновите его через своё приложение на https://dev.hh.ru/.',
  'connections.github.label': 'GitHub',
  'connections.github.archive.title': 'Импорт JSON-дампа gh api',
  'connections.github.archive.hint':
    'Сохраните JSON-дамп из `gh api` (например, `gh api repos/OWNER/REPO/issues --paginate > issues.json`) или конверт `{ issues, comments, pulls, reviews, reviewComments, discussions }` и перетащите файл сюда.',
  'connections.github.archive.fileHint':
    'issues.json, pulls.json, comments.json, envelope.json',
  'connections.github.api.title': 'Подключите GitHub REST API',
  'connections.github.api.hint':
    'Создайте fine-grained personal access token на https://github.com/settings/personal-access-tokens с правами на чтение issues, pull requests и репозиториев, плюс на запись issues, если планируете оставлять комментарии. Вставьте как «secret:github:access-token».',
  'connections.github.fields.token.label': 'Персональный токен доступа',
  'connections.github.errorHints.401':
    'Токен отклонён. Перевыпустите personal access token на https://github.com/settings/personal-access-tokens.',
  'connections.github.errorHints.403':
    'GitHub вернул 403. У токена могут отсутствовать области (issues:read, pull_requests:read, contents:read) или сработал вторичный rate limit.',
  'connections.github.errorHints.404':
    'Репозиторий не найден или недоступен. Подтвердите, что у токена есть доступ к нужному owner/repo.',
  'connections.upwork.label': 'Upwork',
  'connections.upwork.archive.title': 'Импорт экспорта данных Upwork',
  'connections.upwork.archive.hint':
    'Upwork позволяет экспортировать историю транзакций (Reports → Transaction History → Download CSV), архивы по работам и внутренние админ-конверты (`{ jobs, contracts, rooms, messages, transactions }`). Перетащите получившийся CSV или JSON сюда с источником «upwork».',
  'connections.upwork.archive.fileHint':
    'transactions.csv, jobs.json, contracts.json, envelope.json',
  'connections.upwork.api.title': 'Подключите Upwork GraphQL API',
  'connections.upwork.api.hint':
    'Зарегистрируйте OAuth2-приложение на https://www.upwork.com/services/api/apply, выполните 3-legged authorization-code flow и вставьте access token как «secret:upwork:access-token». Опциональный refresh token храните в «secret:upwork:refresh-token».',
  'connections.upwork.fields.token.label': 'OAuth-токен доступа',
  'connections.upwork.fields.refreshToken.label': 'Токен обновления',
  'connections.upwork.fields.organizationId.label':
    'Идентификатор организации (тенанта)',
  'connections.upwork.errorHints.401':
    'Upwork отклонил access token. Обновите его через зарегистрированное OAuth2-приложение или повторите authorization-code flow.',
  'connections.upwork.errorHints.403':
    'Токен валиден, но без нужной области. Перевыпустите его с областями messaging, search и reports.',
  'connections.upwork.errorHints.429':
    'Upwork ограничил частоту вызовов. Подождите; адаптер кеширует результаты на 24 часа согласно ToS API.',
  'connections.peopleperhour.label': 'PeoplePerHour',
  'connections.peopleperhour.archive.title':
    'Импорт экспорта данных PeoplePerHour',
  'connections.peopleperhour.archive.hint':
    'PeoplePerHour даёт экспорт на уровне аккаунта через GDPR-запрос данных (Settings → Privacy → Request my data) и Earnings CSV (Reports → Earnings → Export). Перетащите получившийся JSON или CSV сюда с источником «peopleperhour».',
  'connections.peopleperhour.archive.fileHint':
    'projects.json, proposals.json, workstreams.json, earnings.csv',
  'connections.peopleperhour.api.title': 'Подключите PeoplePerHour REST API',
  'connections.peopleperhour.api.hint':
    'Зарегистрируйте OAuth2-приложение через портал разработчика PeoplePerHour (https://www.peopleperhour.com/site/developers), выполните authorization-code flow и вставьте access token как «secret:peopleperhour:access-token». Опциональный refresh token храните в «secret:peopleperhour:refresh-token». Адаптер кеширует каждый ответ на 24 часа согласно ToS PPH API.',
  'connections.peopleperhour.fields.accessToken.label': 'OAuth-токен доступа',
  'connections.peopleperhour.fields.refreshToken.label': 'Токен обновления',
  'connections.peopleperhour.errorHints.401':
    'PeoplePerHour отклонил access token. Обновите его через зарегистрированное OAuth2-приложение или повторите authorization-code flow.',
  'connections.peopleperhour.errorHints.403':
    'Токен валиден, но без нужной области. Перевыпустите его с областями projects, proposals и workstreams.',
  'connections.peopleperhour.errorHints.429':
    'PeoplePerHour ограничил частоту вызовов. Подождите; адаптер кеширует результаты на 24 часа согласно ToS API.',
  'connections.superjob.label': 'superjob.ru',
  'connections.superjob.archive.title': 'Импорт архива откликов SuperJob',
  'connections.superjob.archive.hint':
    'На superjob.ru откройте кабинет соискателя -> «Отклики» и используйте экспорт в JSON. Сохраните файл и загрузите его сюда.',
  'connections.superjob.archive.fileHint': 'responses.json',
  'connections.superjob.api.title': 'Подключите API SuperJob',
  'connections.superjob.api.hint':
    'Зарегистрируйте приложение на https://api.superjob.ru/register/, скопируйте секретный ключ как SUPERJOB_APP_ID и access token как «secret:superjob:token».',
  'connections.superjob.fields.appId.label': 'App ID (X-Api-App-Id)',
  'connections.superjob.fields.token.label': 'Токен доступа',
  'connections.superjob.errorHints.401':
    'SuperJob отклонил App ID. Проверьте его в кабинете соискателя.',
  'tutorial.button': 'Руководство',
  'tutorial.skip': 'Пропустить шаг',
  'tutorial.next': 'Далее',
  'tutorial.finish': 'Завершить',
  'tutorial.off': 'Отключить руководство',
  'tutorial.progress': 'Шаг {current} из {total}',
  'tutorial.welcome.title': 'Добро пожаловать в meta-sovereign',
  'tutorial.welcome.body':
    'Это ваша локальная персональная CRM и единый почтовый ящик. Ничего не покидает браузер, пока вы сами не подключитесь к серверу. Нажмите «Далее», чтобы пройти основные сценарии.',
  'tutorial.chat.title': 'Чат — единый почтовый ящик',
  'tutorial.chat.body':
    'Все чаты из всех подключённых сервисов появляются здесь. Если раздел пуст, он подскажет, как подключить провайдера — откройте вкладку «Чат» после тура.',
  'tutorial.contacts.title': 'Контакты — одна строка на человека',
  'tutorial.contacts.body':
    'Контакты объединены по всем сетям. Подключите хотя бы одного провайдера, чтобы заполнить список.',
  'tutorial.automation.title': 'Автоматизация — от шаблонов к ответам',
  'tutorial.automation.body':
    'Стройте графы узлов, которые направляют входящие сообщения от регулярки к вариации ответа. Шаблоны и группы ответов питают этот редактор графов.',
  'tutorial.backup.title': 'Резервная копия — шифруется на диске',
  'tutorial.backup.body':
    'Резервные копии шифруют локальное хранилище парольной фразой. Если вы запустили локальный сервер, архив сохраняется рядом с его каталогом данных.',
  'tutorial.connections.title': 'Сначала подключите сервис',
  'tutorial.connections.body':
    'Откройте «Подключения», чтобы выбрать провайдера. Каждый провайдер прямо в приложении проведёт вас по шагам получения учётных данных — внешние инструкции не нужны.',
  'tutorial.connectionDetail.title': 'Следуйте инструкциям провайдера',
  'tutorial.connectionDetail.body':
    'На экране провайдера перечислены все шаги для получения учётных данных, а также живая проверка API, чтобы убедиться, что подключение работает.',
};
