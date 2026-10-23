// Russian locale (issue #18). Keys must mirror ./en.js exactly; the
// parity test in js/tests/i18n.test.js fails the build if they
// drift. Reviewed against the Telegram Desktop ru.strings file
// (https://github.com/telegramdesktop/tdesktop) for terminology
// consistency on common UI verbs.

import { ruChat } from './ru-chat.js';
import { ruChatMore } from './ru-chat-more.js';
import { ruChatAccount } from './ru-chat-account.js';

export const ru = {
  ...ruChat,
  ...ruChatMore,
  ...ruChatAccount,
  appName: 'meta-sovereign',
  skipLink: 'Перейти к основному содержимому',
  'header.theme': 'Тема',
  'header.themeAria': 'Переключить тёмный режим',
  'header.tutorial': 'Руководство',
  'header.tutorialAria': 'Открыть руководство',
  'header.language': 'Язык',
  'header.languageAria': 'Выбрать язык интерфейса',
  'header.systemDefault': 'Системный',
  'header.online': 'Онлайн',
  'header.offline': 'Оффлайн',
  'header.telegramOffline':
    'Telegram какое-то время недоступен; попытки продолжаются. Открыть подключение Telegram',
  'header.telegramSignIn': 'Telegram завершил этот сеанс; войдите снова',
  'webMode.title': 'Режим только браузера',
  'webMode.body':
    'Локальный сервер не найден, поэтому приложение работает с данными, сохранёнными в этом браузере. Импорт из почты и мессенджеров, автоматизации по расписанию, синхронизация между устройствами, синхронизация резюме и приветствия включатся, когда будет запущен локальный сервер. Запустите его с Node.js 20 или новее:',
  'webMode.retry': 'Проверить снова',
  'webMode.checking': 'Ищем локальный сервер…',
  'webMode.notFound':
    'Сервер на http://127.0.0.1:8787 всё ещё не отвечает. Запустите его и проверьте снова.',
  'webMode.download': 'Скачать десктопное приложение (сервер внутри)',
  'webMode.dismiss': 'Скрыть',
  'webMode.safari':
    'Safari не пускает https-страницы на http://127.0.0.1, но обращается к серверу по https, когда доверяет его сертификату: один раз выполните npx -y meta-sovereign trust. До тех пор откройте приложение с сервера по ссылке ниже или используйте десктопное приложение.',
  'webMode.openLocal': 'Открыть приложение с сервера',
  'webMode.localFound':
    'Сервер работает на {origin}, но этот браузер не даёт этой странице обращаться к нему. Откройте приложение с сервера по ссылке ниже.',
  'webMode.trust':
    'Чтобы Safari подключался отсюда, один раз доверьтесь серверу: выполните {command} или нажмите «Доверять серверу», выберите «Показать подробности» → «посетить этот веб-сайт» и введите пароль. Затем нажмите «Проверить снова».',
  'webMode.trustLink': 'Доверять серверу',
  'webMode.localOff':
    'Сервер работает на {origin}, но Safari не даёт этой странице обращаться к нему, а копия приложения на сервере выключена. Запустите сервер без --local-ui=false или откройте эту страницу в Chrome или Firefox.',
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
  'nav.connections': 'Подключения',
  // Shorter labels for the phone's bottom bar and the tablet rail.
  'nav.short.automation': 'Сценарии',
  'nav.short.cv': 'Резюме',
  'nav.short.connections': 'Аккаунты',
  'nav.cv': 'Синхронизация CV',
  'nav.greetings': 'Приветствия',
  'nav.settings': 'Настройки',
  'shell.primaryNavAria': 'Основная навигация',
  'shell.more': 'Ещё',
  'shell.moreAria': 'Другие разделы',
  'common.loading': 'Загрузка…',
  'common.save': 'Сохранить',
  'common.send': 'Отправить',
  'common.cancel': 'Отменить',
  'common.preview': 'Предпросмотр',
  'common.queue': 'В очередь',
  'common.evaluate': 'Выполнить',
  'common.infer': 'Вывести',
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
  'contacts.actions': 'Действия',
  'contacts.message': 'Написать',
  'contacts.messageTo': 'Написать {name}',
  'contacts.search': 'Поиск контактов',
  'automation.title': 'Графы автоматизации',
  'automation.edges': 'Связей: {count}',
  'patterns.title': 'Шаблоны',
  'patterns.inferTitle': 'Вывести регулярку из примеров',
  'patterns.examplesPlaceholder': 'Один пример в строке',
  'patterns.modeSimple': 'Простой',
  'patterns.modeLcs': 'Lcs (переменные пропуски)',
  'patterns.idPlaceholder': 'Идентификатор шаблона (например, greet)',
  'patterns.labelPlaceholder': 'Метка',
  'patterns.colId': 'Идентификатор',
  'patterns.colRegex': 'Регулярка',
  'replies.title': 'Группы вариаций ответов',
  'replies.newTitle': 'Создать или обновить группу',
  'replies.idPlaceholder': 'Идентификатор группы (например, thanks)',
  'replies.variationsPlaceholder': 'Одна вариация в строке',
  'replies.saveGroup': 'Сохранить группу',
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
  'broadcast.placeholder': 'Сообщение для всех выбранных сетей',
  'outreach.title': 'Точечная рассылка',
  'outreach.hint':
    'Массово-персональная рассылка. Предпросмотр всегда; очередь действительно отправляет.',
  'outreach.queryPlaceholder':
    'запрос аудитории, например, network:telegram AND chat:vip',
  'outreach.bodyPlaceholder':
    'Текст. Используйте {name}, {networks}, {chats} для персонализации каждому получателю.',
  'profile.title': 'Профиль',
  'profile.namePlaceholder': 'Имя',
  'profile.bioPlaceholder': 'Био',
  'profile.saveProfile': 'Сохранить профиль',
  'profile.resumeTitle': 'Резюме',
  'profile.titlePlaceholder': 'Должность',
  'profile.bodyPlaceholder': 'Опыт работы',
  'profile.saveResume': 'Сохранить резюме',
  'backup.title': 'Резервная копия',
  'backup.hint': 'Зашифрованные архивы хранятся в каталоге данных сервера.',
  'backup.passphrasePlaceholder': 'Необязательная парольная фраза',
  'backup.keepPlaceholder': 'Оставить N (необязательно)',
  'backup.create': 'Создать резервную копию',
  'backup.restore': 'Восстановить',
  'backup.itemMeta': '{size} байт — {timestamp} — {state}',
  'backup.encrypted': 'Зашифровано',
  'backup.plain': 'Без шифрования',
  'status.title': 'Статус',
  'settings.title': 'Настройки',
  'settings.intro':
    'Здесь находятся параметры приложения. Учётные данные провайдеров, импорт архивов и проверки API находятся на отдельном экране «Подключения».',
  'settings.openConnections': 'Открыть подключения',
  'settings.credentials': 'Учётные данные',
  'settings.optional': '(необязательно)',
  'settings.storedAs': 'Сохраняется как {id}',
  'settings.saveCredentials': 'Сохранить учётные данные',
  'settings.saving': 'Сохранение...',
  'settings.saved': 'Сохранено.',
  'settings.forget': 'Забыть',
  'settings.forgetting': 'Забываем {label}...',
  'settings.forgotten': '{label} забыто.',
  'settings.archive': 'Импорт архива',
  'settings.archivePasteHint': 'Или вставьте содержимое архива ниже:',
  'settings.archivePastePlaceholder': 'Вставьте содержимое архива сюда',
  'settings.archivePasteWith': 'Вставьте содержимое {label}',
  'settings.importPasted': 'Импортировать вставленное',
  'settings.importing': 'Импортируем {label}...',
  'settings.importedCount': 'Импортировано {count} сообщений из {label}.',
  'settings.importFailed': 'Импорт не удался: {message}',
  'settings.nothingToImport': 'Нечего импортировать.',
  'settings.docsLink': 'Как получить учётные данные ↗',
  'settings.credentialsSaved': 'Учётные данные сохранены',
  'settings.noCredentials': 'Учётных данных пока нет',
  'settings.probe.idle': 'Эндпоинт: {url}',
  'settings.probe.notReady': 'Введите токен, чтобы включить проверку',
  'settings.probe.button': 'Проверить напрямую',
  'settings.probe.probing': 'Проверяем...',
  'settings.probe.connected': 'Подключено (HTTP {status})',
  'settings.probe.httpHint': 'API ответил {status}. {hint}',
  'settings.probe.httpNoHint': 'API ответил {status}.',
  'settings.probe.cors':
    'Браузер заблокировал запрос (CORS). Запустите локальный сервер ниже, чтобы проксировать вызов.',
  'settings.probe.network': 'Сетевая ошибка: {message}.',
  'settings.probe.fetchFailed': 'Fetch не удался',
  'guide.connectFirstHint':
    'Сначала подключите провайдер, иначе здесь не будет данных.',
  'guide.openSettings': 'Открыть {target}',
  'guide.openSettingsTarget': 'Подключения → {label}',
  'guide.openSettingsRoot': 'Подключения',
  'guide.openConnections': 'Открыть {target}',
  'guide.openConnectionsTarget': 'Подключения → {label}',
  'guide.openConnectionsRoot': 'Подключения',
  'guide.probeDisabled':
    'Введите учётные данные в Подключениях, чтобы включить проверку {label}.',
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
  'guide.localServer.github': 'Напрямую из GitHub',
  'guide.localServer.githubHint':
    'Используйте, пока npm отвечает 404: npx загрузит тот же сервер из репозитория GitHub. По умолчанию http://127.0.0.1:8787.',
  'guide.localServer.docker': 'Docker',
  'guide.localServer.dockerHint':
    'Запускает тот же JS-сервер в контейнере. См. docker/web.Dockerfile.',
  'guide.localServer.overrideHint':
    'Когда сервер запущен, вставьте его URL ниже и нажмите «Использовать этот сервер» — SPA сохранит адрес и перезагрузится.',
  'guide.chat.title': 'Ваш единый ящик пока пуст.',
  'guide.chat.body':
    'meta-sovereign хранит все чаты со всех подключённых сервисов в одном месте. Откройте «Подключения», добавьте провайдера или импортируйте архив, затем вернитесь сюда.',
  'guide.operator.title': 'Очередь оператора пуста.',
  'guide.operator.body':
    'Поток карточек оператора проводит вас по непрочитанным сообщениям чат за чатом. Откройте «Подключения» и добавьте чат-провайдера, чтобы запустить очередь.',
  'guide.contacts.title': 'Контактов пока нет.',
  'guide.contacts.body':
    'Контакты собираются со всех подключённых провайдеров, поэтому один и тот же человек в разных сетях отображается одной строкой. Откройте «Подключения», чтобы добавить провайдера.',
  'guide.automation.title': 'Графов автоматизации пока нет.',
  'guide.automation.body':
    'Графы автоматизации направляют входящие сообщения от шаблона к вариации ответа. Откройте «Подключения» и импортируйте данные провайдера перед сборкой автоматизаций.',
  'guide.patterns.title': 'Шаблонов пока нет.',
  'guide.patterns.body':
    'Шаблоны выводятся из примеров сообщений. Откройте «Подключения», подключите провайдера или импортируйте архив, затем вернитесь сюда с примерами.',
  'guide.replies.title': 'Групп вариаций ответов пока нет.',
  'guide.replies.body':
    'Группы ответов извлекаются из ваших предыдущих исходящих сообщений по нечёткому сходству. Откройте «Подключения», чтобы добавить чат-провайдера и наполнить библиотеку ответов.',
  'guide.facts.title': 'Фактов пока не извлечено.',
  'guide.facts.body':
    'Факты — это пары «вопрос → ответ», извлечённые из сообщений вашими шаблонами. Откройте «Подключения», чтобы собрать данные, затем добавьте шаблон с группой захвата.',
  'guide.audience.title': 'Создайте свою первую аудиторию.',
  'guide.audience.body':
    'Перекрёстно фильтруйте контакты с помощью AND/OR/NOT и измерений вроде network:, chat:, sender:, kind:, fact:. Откройте «Подключения» и добавьте хотя бы одного провайдера.',
  'guide.broadcast.title': 'Целей рассылки пока нет.',
  'guide.broadcast.body':
    'Рассылка отправляет одно и то же сообщение во все подключённые ленты. Откройте «Подключения», чтобы добавить провайдера с публичной публикацией и включить цели.',
  'guide.outreach.title': 'Поверхности точечной рассылки пока нет.',
  'guide.outreach.body':
    'Массово-персональная рассылка отправляет шаблонное сообщение 1:1 каждому контакту в запросе аудитории. Откройте «Подключения», чтобы добавить чат-провайдера.',
  'guide.profile.title': 'Профиля пока нет.',
  'guide.profile.body':
    'Редактируйте профиль и резюме здесь; сохранения отправляются всем подключённым провайдерам. Откройте «Подключения», чтобы добавить хотя бы одного провайдера для синхронизации профиля.',
  'guide.backup.title': 'Резервных архивов пока нет.',
  'guide.backup.body':
    'Резервные копии — это зашифрованные на диске архивы локального хранилища. Установите парольную фразу выше, нажмите «создать резервную копию», когда появятся данные, или сначала запустите локальный сервер, если хотите хранить копии на диске.',
  'guide.status.title': 'Статус показывает только локальное хранилище.',
  'guide.status.body':
    'Поля статуса появляются, когда сервер доступен. Запустите локальный сервер ниже или продолжайте работу полностью офлайн — SPA пишет напрямую в хранилище браузера.',
  'guide.connections.title': 'Подключения',
  'guide.connections.body':
    'Внешние сервисы живут на этом отдельном экране. Выберите провайдера, чтобы ввести учётные данные, загрузить архив и проверить API. В настройках остаются только параметры самого приложения.',
  'guide.cv.title': 'Синхронизация резюме',
  'guide.cv.body':
    'Этот экран управляет настоящей сессией браузера в ваших профилях на площадках: он читает каждое резюме, сравнивает их поле за полем и записывает только тогда, когда вы применяете синхронизацию. Войдите на каждую площадку один раз в том профиле браузера, который использует локальный сервер, — API-ключей у большинства этих площадок просто нет.',
  'guide.greetings.title': 'Приветствия',
  'guide.greetings.body':
    'Начинайте диалоги пачкой: «привет» или приветственный стикер, как это делает konard/vk-bot во ВКонтакте. Сначала подключите сеть: живой список стикеров и отправка используют токены, которые хранит локальный сервер.',
  'guide.settings.title': 'Настройки',
  'guide.settings.body':
    'Здесь находятся параметры приложения. Учётные данные провайдеров, импорт архивов и проверки API находятся на отдельном экране «Подключения».',
  'connections.title': 'Подключения',
  'connections.intro':
    'Начните с «Импорт через браузер»: приложение откроет сервис, вы скачаете там свои данные, и они импортируются автоматически. Самые популярные сервисы — вверху.',
  'connections.state.connected': 'Подключено',
  'connections.state.notConnected': 'Не подключено',
  'connections.state.actionRequired': 'Требуется действие',
  'connections.state.browserSession': 'Сессия браузера',
  'connections.session.login': 'Открыть страницу входа',
  'connections.session.profile': 'Открыть страницу профиля',
  'connections.session.openCv': 'Открыть экран резюме',
  'connections.openDetail': 'Настроить',
  'connections.controlsTitle': 'Управление подключением',
  'autoImport.title': 'Импорт через браузер',
  'autoImport.intro':
    'Откроет {service} в отдельном окне браузера. Войдите, запустите там выгрузку данных — каждый скачанный файл импортируется автоматически. Вход сохранится до следующего раза.',
  'autoImport.introCapture':
    'Откроет {service} в отдельном окне браузера. Войдите, откройте чат и нажмите «Сохранить этот чат». Скачанные файлы выгрузки тоже импортируются автоматически.',
  'autoImport.start': 'Открыть браузер',
  'autoImport.capture': 'Сохранить этот чат',
  'autoImport.finish': 'Готово',
  'autoImport.state.launching': 'Открываем браузер…',
  'autoImport.state.waiting': 'Браузер открыт. Ждём вашу выгрузку…',
  'autoImport.state.importing': 'Импортируем…',
  'autoImport.state.done': 'Готово.',
  'autoImport.state.stopped': 'Остановлено после долгого простоя.',
  'autoImport.state.failed': 'Не удалось открыть браузер: {error}',
  'autoImport.imported': 'Импортировано сообщений: {count}',
  'autoImport.unavailable':
    'Для импорта через браузер нужен сервер meta-sovereign на этом компьютере.',
  'autoImport.unavailableReason': 'Импорт через браузер недоступен: {reason}',
  'common.cancelled': 'Отменено. Ничего не отправлено.',
  'outreach.send': 'Отправить',
  'outreach.confirmSend':
    'Отправить этим людям {count, plural, one {# сообщение} few {# сообщения} other {# сообщений}} сейчас?',
  'greetings.confirmSend':
    'Отправить {count, plural, one {# приветствие} few {# приветствия} other {# приветствий}} сейчас?',
  'cv.confirmApply':
    'Записать {count, plural, one {# изменение} few {# изменения} other {# изменений}} в резюме на площадках сейчас?',
  'profile.savedLocally':
    'Сохранено на этом устройстве. На других сервисах ничего не изменено.',
  'profile.publishTitle': 'Обновить на других сервисах',
  'profile.publishHint':
    'Сохранение оставляет профиль и резюме здесь. Чтобы изменить их на других сервисах, отметьте сети и подтвердите изменения.',
  'profile.publish.profile': 'Обновить профиль там',
  'profile.publish.resume': 'Обновить резюме там',
  'profile.confirmPublish.profile':
    'Обновить профиль в {networks}? Люди там увидят изменения.',
  'profile.confirmPublish.resume':
    'Обновить резюме в {networks}? Работодатели там увидят изменения.',
  'settings.privacy.title': 'Конфиденциальность',
  'settings.shareTyping': 'Показывать собеседнику, что я печатаю',
  'settings.shareTypingHint':
    'По умолчанию выключено. Когда включено, VK и Telegram показывают «печатает…» тому, кому вы пишете.',
  'settings.readReceipts': 'Отмечать чаты прочитанными, когда я их читаю',
  'settings.readReceiptsHint':
    'По умолчанию включено, как в приложениях Telegram. Когда выключено, чтение чата здесь не отмечает его прочитанным в Telegram: отправитель не видит ✓✓, счётчики непрочитанных остаются.',
  'settings.notify.title': 'Уведомления',
  'settings.notify.on': 'Показывать новые сообщения уведомлениями',
  'settings.notify.preview': 'Показывать отправителя и текст',
  'settings.notify.count': 'Число непрочитанных в заголовке страницы',
  'settings.notify.granted': 'Браузер показывает уведомления этой страницы.',
  'settings.notify.default':
    'Браузер спросит разрешение на уведомления, когда вы их включите.',
  'settings.notify.denied':
    'Уведомления для этой страницы запрещены в настройках браузера.',
  'settings.notify.unsupported':
    'Этот браузер не умеет показывать уведомления.',
  // Telegram notification settings (R-Y157).
  'settings.notifyTg.title': 'Уведомления Telegram',
  'settings.notifyTg.intro':
    'Хранятся в аккаунте Telegram, поэтому другие ваши устройства следуют им.',
  'settings.notifyTg.users': 'Личные чаты',
  'settings.notifyTg.chats': 'Группы',
  'settings.notifyTg.broadcasts': 'Каналы',
  'settings.notifyTg.on': 'Уведомления',
  'settings.notifyTg.preview': 'Предпросмотр сообщений',
  'settings.notifyTg.stories': 'Уведомления об историях',
  'settings.notifyTg.exceptions': 'Исключения: {count}',
  'settings.notifyTg.noExceptions': 'Нет исключений',
  'settings.notifyTg.muted': 'Без уведомлений',
  'settings.notifyTg.mutedUntil': 'Без уведомлений до {time}',
  'settings.notifyTg.unmuted': 'Включено',
  'settings.notifyTg.custom': 'Особая настройка',
  'settings.notifyTg.failed': 'Telegram не принял изменение.',
  'connections.enterManually': 'Ввести вручную',
  'connections.howToConnect': 'Как подключить',
  'connections.recommended': 'Рекомендуем',
  'connections.users': '{count} пользователей',
  'connections.signedInFrom': 'Вход выполнен в {browsers}',
  'autoImport.signedInFrom': 'Окно откроется с вашим входом из {browsers}.',
  'signIns.title': 'Входы из ваших браузеров',
  'signIns.intro':
    'Посмотрите, в какие сервисы вы уже вошли в Chrome, Safari, Firefox и других браузерах, и откройте окно импорта с выполненным входом. Браузеры только читаются, ничего не покидает этот компьютер.',
  'signIns.scan': 'Найти входы',
  'signIns.rescan': 'Проверить снова',
  'signIns.scanning': 'Просматриваем ваши браузеры…',
  'signIns.none': 'Браузеры на этом компьютере не найдены.',
  'signIns.default': 'браузер по умолчанию',
  'signIns.found': 'Вход выполнен: {services}',
  'signIns.nothing': 'Нет входа ни в один из этих сервисов',
  'signIns.needsAccess': 'Нужен полный доступ к диску',
  'signIns.error': 'Не удалось прочитать: {error}',
  'signIns.use': 'Использовать эти входы',
  'signIns.importing':
    'Копируем входы… Браузер или macOS могут запросить разрешение.',
  'signIns.ready':
    'Готово: {services}. Каждое окно импорта откроется с выполненным входом.',
  'signIns.readyNone': 'Ни один вход не скопирован.',
  'signIns.fdaTitle': 'Разрешите доступ к Safari',
  'signIns.fdaBody':
    'macOS защищает данные Safari. В «Системных настройках» → «Конфиденциальность и безопасность» → «Полный доступ к диску» включите {app}, затем перезапустите сервер meta-sovereign.',
  'signIns.fdaOpen': 'Открыть Системные настройки',

  // Поиск входов в Telegram (токены ботов и пользовательские сессии) на этом компьютере.
  'telegramSessions.title': 'Найти сессии Telegram на этом компьютере',
  'telegramSessions.intro':
    'Просматривает папки с проектами и находит уже имеющиеся входы в Telegram — токены ботов и пользовательские сессии — убирает повторы, проверяет, что каждый вход ещё работает, и показывает по одному на аккаунт. Всё остаётся на этом компьютере; подключаете только вы.',
  'telegramSessions.scan': 'Найти мои сессии Telegram',
  'telegramSessions.rescan': 'Искать снова',
  'telegramSessions.scanning': 'Ищу и проверяю сессии…',
  'telegramSessions.none': 'В этих папках входы в Telegram не найдены.',
  'telegramSessions.connect': 'Подключить',
  'telegramSessions.kindBot': 'токен бота',
  'telegramSessions.kindUser': 'пользовательская сессия',
  'telegramSessions.kindTelethon': 'файл сессии Telethon',
  'telegramSessions.badgeBot': 'Бот',
  'telegramSessions.badgeUser': 'Пользователь',
  'telegramSessions.verified': 'подтверждено через Telegram',
  'telegramSessions.telethonHint': 'откройте этот проект, чтобы войти',
  'telegramSessions.typeBot': 'Токен бота',
  'telegramSessions.typeSession': 'Вход по сессии',
  'telegramSessions.typePassword': 'Вход по телефону и паролю',
  'telegramSessions.more': '+ ещё {n}',
  'telegramSessions.less': 'Свернуть',
  'telegramSessions.signIn': 'Войти',
  'telegramSessions.connected': 'Подключено',

  // Вход в пользовательский аккаунт Telegram через MTProto (GramJS), как в konard/telegram-bot.
  'telegramLogin.title': 'Войти в свой аккаунт Telegram',
  'telegramLogin.intro':
    'Вход по номеру, как в Telegram Desktop — api_id, api_hash и номер, затем код из Telegram (и пароль 2FA, если он есть). Сессия сохраняется здесь на будущее.',
  'telegramLogin.apiId': 'API ID',
  'telegramLogin.apiHash': 'API hash',
  'telegramLogin.phone': 'Номер телефона',
  'telegramLogin.code': 'Код входа',
  'telegramLogin.password': 'Пароль 2FA (если есть)',
  'telegramLogin.sendCode': 'Отправить код',
  'telegramLogin.signIn': 'Войти',
  'telegramLogin.working': 'Выполняется…',
  'telegramLogin.connected': 'Вход выполнен',
  'telegramLogin.you': 'ваш аккаунт',
  'telegramLogin.codeSent':
    'Telegram отправил код в приложение. Введите его ниже.',
  'telegramLogin.twoFactor':
    'На аккаунте включён пароль двухфакторной защиты. Введите его, чтобы завершить.',
  // BEGIN setup-steps (issue #25 R-N8) — auto-generated
  'connections.email.setup.step1.title': 'Подготовьте учётные данные Email',
  'connections.email.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.email.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.email.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.email.setup.step3.title': 'Запустите проверку',
  'connections.email.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.telegram.setup.step1.title':
    'Подготовьте учётные данные Telegram',
  'connections.telegram.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.telegram.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.telegram.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.telegram.setup.step3.title': 'Запустите проверку',
  'connections.telegram.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.vk.setup.step1.title': 'Подготовьте учётные данные VK',
  'connections.vk.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.vk.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.vk.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.vk.setup.step3.title': 'Запустите проверку',
  'connections.vk.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.x.setup.step1.title': 'Подготовьте учётные данные X (Twitter)',
  'connections.x.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.x.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.x.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.x.setup.step3.title': 'Запустите проверку',
  'connections.x.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.whatsapp.setup.step1.title':
    'Подготовьте учётные данные WhatsApp',
  'connections.whatsapp.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.whatsapp.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.whatsapp.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.whatsapp.setup.step3.title': 'Запустите проверку',
  'connections.whatsapp.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.facebook.setup.step1.title':
    'Подготовьте учётные данные Facebook',
  'connections.facebook.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.facebook.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.facebook.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.facebook.setup.step3.title': 'Запустите проверку',
  'connections.facebook.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.linkedin.setup.step1.title':
    'Подготовьте учётные данные LinkedIn',
  'connections.linkedin.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.linkedin.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.linkedin.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.linkedin.setup.step3.title': 'Запустите проверку',
  'connections.linkedin.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.habr-career.setup.step1.title':
    'Подготовьте учётные данные career.habr.com',
  'connections.habr-career.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.habr-career.setup.step2.title':
    'Сохраните данные в meta-sovereign',
  'connections.habr-career.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.habr-career.setup.step3.title': 'Запустите проверку',
  'connections.habr-career.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.hh.setup.step1.title': 'Подготовьте учётные данные hh.ru',
  'connections.hh.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.hh.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.hh.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.hh.setup.step3.title': 'Запустите проверку',
  'connections.hh.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.github.setup.step1.title': 'Подготовьте учётные данные GitHub',
  'connections.github.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.github.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.github.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.github.setup.step3.title': 'Запустите проверку',
  'connections.github.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.upwork.setup.step1.title': 'Подготовьте учётные данные Upwork',
  'connections.upwork.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.upwork.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.upwork.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.upwork.setup.step3.title': 'Запустите проверку',
  'connections.upwork.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.peopleperhour.setup.step1.title':
    'Подготовьте учётные данные PeoplePerHour',
  'connections.peopleperhour.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.peopleperhour.setup.step2.title':
    'Сохраните данные в meta-sovereign',
  'connections.peopleperhour.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.peopleperhour.setup.step3.title': 'Запустите проверку',
  'connections.peopleperhour.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.superjob.setup.step1.title':
    'Подготовьте учётные данные SuperJob',
  'connections.superjob.setup.step1.body':
    'Откройте документацию по ссылке и создайте API-токен, OAuth-приложение или ключ разработчика так, как требует сервис.',
  'connections.superjob.setup.step2.title': 'Сохраните данные в meta-sovereign',
  'connections.superjob.setup.step2.body':
    'Вставьте полученное значение в поле на этом экране. Оно хранится под ключом `secret:*` и никогда не покидает браузер.',
  'connections.superjob.setup.step3.title': 'Запустите проверку',
  'connections.superjob.setup.step3.body':
    'Нажмите «Проверить соединение» — успешный ответ подтвердит учётные данные. При ошибке появится перевод подсказки со следующим действием.',
  'connections.naukri.setup.step1.title': 'Установите драйвер браузера',
  'connections.naukri.setup.step1.body':
    'Naukri не публикует общедоступный API. Установите Playwright на машине с локальным сервером, чтобы browser-commander мог открыть настоящую сессию.',
  'connections.naukri.setup.step2.title': 'Войдите один раз',
  'connections.naukri.setup.step2.body':
    'Откройте экран резюме и выполните чтение. Браузер откроет naukri.com — войдите там один раз; каталог профиля браузера сохранит сессию для следующих запусков.',
  'connections.naukri.setup.step3.title': 'Чтение, сравнение, синхронизация',
  'connections.naukri.setup.step3.body':
    'Прочитайте резюме, сравните различия с другими площадками и запланируйте синхронизацию. Каждый запуск записывается в cv:telemetry с отпечатком разметки, поэтому сломанный селектор легко заметить.',
  'connections.vietnamworks.setup.step1.title': 'Установите драйвер браузера',
  'connections.vietnamworks.setup.step1.body':
    'VietnamWorks не публикует общедоступный API. Установите Playwright на машине с локальным сервером, чтобы browser-commander мог открыть настоящую сессию.',
  'connections.vietnamworks.setup.step2.title': 'Войдите один раз',
  'connections.vietnamworks.setup.step2.body':
    'Откройте экран резюме и выполните чтение. Браузер откроет vietnamworks.com — войдите там один раз; каталог профиля браузера сохранит сессию для следующих запусков.',
  'connections.vietnamworks.setup.step3.title':
    'Чтение, сравнение, синхронизация',
  'connections.vietnamworks.setup.step3.body':
    'Прочитайте резюме, сравните различия с другими площадками и запланируйте синхронизацию. Каждый запуск записывается в cv:telemetry с отпечатком разметки, поэтому сломанный селектор легко заметить.',
  'connections.topcv.setup.step1.title': 'Установите драйвер браузера',
  'connections.topcv.setup.step1.body':
    'TopCV не публикует общедоступный API. Установите Playwright на машине с локальным сервером, чтобы browser-commander мог открыть настоящую сессию.',
  'connections.topcv.setup.step2.title': 'Войдите один раз',
  'connections.topcv.setup.step2.body':
    'Откройте экран резюме и выполните чтение. Браузер откроет topcv.vn — войдите там один раз; каталог профиля браузера сохранит сессию для следующих запусков.',
  'connections.topcv.setup.step3.title': 'Чтение, сравнение, синхронизация',
  'connections.topcv.setup.step3.body':
    'Прочитайте резюме, сравните различия с другими площадками и запланируйте синхронизацию. Каждый запуск записывается в cv:telemetry с отпечатком разметки, поэтому сломанный селектор легко заметить.',
  // END setup-steps
  'connections.back': 'К подключениям',
  'connections.email.label': 'Почта',
  'connections.email.archive.title': 'Импорт экспорта почты в .eml или mbox',
  'connections.email.archive.hint':
    'Экспортируйте почту от вашего провайдера в файлы .eml или архив mbox, включая mbox-файлы Gmail Takeout. Перетащите файл в окно импорта с источником «email».',
  'connections.email.archive.fileHint': '*.eml, *.mbox',
  'connections.email.api.title': 'Подключите API и протоколы почты',
  'connections.email.api.hint':
    'Используйте JMAP, Gmail API или Microsoft Graph прямо из браузера, когда CORS позволяет. IMAP, POP3 и SMTP требуют локального сервера, поскольку браузеры не открывают сырые TCP/TLS-сокеты для почты.',
  'connections.email.fields.token.label': 'OAuth-токен доступа',
  'connections.email.fields.host.label': 'Сервер IMAP/SMTP',
  'connections.email.fields.username.label': 'Логин (адрес почты)',
  'connections.email.fields.password.label': 'Пароль или пароль приложения',
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
    'Новым приложениям VK больше не выдаёт право messages, а токены Kate Mobile перестали работать 8 сентября 2026 года. Лучше импортируйте архив ниже. Для бесед сообщества вставьте ключ доступа сообщества (Управление → Дополнительно → Работа с API). Старый пользовательский токен веб-клиента VK (client_id 6287487 через oauth.vk.ru) может ещё работать — на ваш риск заморозки аккаунта. Значение хранится как «secret:vk:access-token».',
  'connections.vk.fields.token.label': 'Токен доступа',
  'connections.vk.errorHints.401':
    'VK отклонил токен (ошибка 5). Получите новый: токены заблокированных клиентов, таких как Kate Mobile или VK Admin, не восстановятся.',
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
  'connections.naukri.label': 'naukri.com',
  'connections.naukri.archive.title':
    'Импорт выгрузки входящих от рекрутеров Naukri',
  'connections.naukri.archive.hint':
    'Откройте naukri.com -> «Сообщения рекрутеров», используйте экспорт браузера (или сохраните JSON из вкладки сети) и загрузите файл здесь.',
  'connections.naukri.archive.fileHint': 'inbox.json',
  'connections.naukri.session.title':
    'Войдите один раз в локальной сессии браузера',
  'connections.naukri.session.hint':
    'Запустите локальный сервер, откройте экран резюме и выполните чтение. Браузер откроет naukri.com; войдите там один раз — каталог профиля сохранит сессию для следующих запусков.',
  'connections.vietnamworks.label': 'vietnamworks.com',
  'connections.vietnamworks.archive.title':
    'Импорт выгрузки центра сообщений VietnamWorks',
  'connections.vietnamworks.archive.hint':
    'Откройте vietnamworks.com -> «My Jobs» -> сообщения, сохраните JSON, который загружает страница, и импортируйте его здесь.',
  'connections.vietnamworks.archive.fileHint': 'messages.json',
  'connections.vietnamworks.session.title':
    'Войдите один раз в локальной сессии браузера',
  'connections.vietnamworks.session.hint':
    'Запустите локальный сервер, откройте экран резюме и выполните чтение. Браузер откроет vietnamworks.com; войдите там один раз — каталог профиля сохранит сессию для следующих запусков.',
  'connections.topcv.label': 'topcv.vn',
  'connections.topcv.archive.title':
    'Импорт выгрузки сообщений работодателей TopCV',
  'connections.topcv.archive.hint':
    'Откройте topcv.vn -> «Tin nhắn», сохраните JSON, который загружает страница, и импортируйте его здесь.',
  'connections.topcv.archive.fileHint': 'messages.json',
  'connections.topcv.session.title':
    'Войдите один раз в локальной сессии браузера',
  'connections.topcv.session.hint':
    'Запустите локальный сервер, откройте экран резюме и выполните чтение. Браузер откроет topcv.vn; войдите там один раз — каталог профиля сохранит сессию для следующих запусков.',
  'tutorial.button': 'Руководство',
  'tutorial.skip': 'Пропустить шаг',
  'tutorial.next': 'Далее',
  'tutorial.showMe': 'Показать',
  'tutorial.back': 'Назад',
  'tutorial.finish': 'Завершить',
  'tutorial.off': 'Отключить руководство',
  'tutorial.progress': 'Шаг {current} из {total}',
  'tutorial.connect.title': 'Подключите первый сервис',
  'tutorial.connect.body':
    'Соберите чаты и контакты в одном месте. Чтобы начать, откройте «Подключения».',
  'tutorial.connect.examples': 'Например:',
  'tutorial.connect.more': 'и другие',
  'tutorial.welcome.title': 'Добро пожаловать в meta-sovereign',
  'tutorial.welcome.body':
    'Ваша личная CRM и единый ящик для всех сообщений. Данные остаются на вашем устройстве, пока вы сами не подключите свой сервер.',
  'tutorial.chat.title': 'Чат',
  'tutorial.chat.body':
    'Переписка из всех подключённых сервисов в одном месте. Напишите ответ внизу и нажмите «Отправить»; строка под списком показывает подключённый аккаунт и время последней синхронизации; синхронизация идёт сама.',
  'tutorial.contacts.title': 'Контакты',
  'tutorial.contacts.body':
    'Все, с кем вы общаетесь, и ваши контакты Telegram — каждый человек один раз, даже в нескольких сервисах. Откройте «Контакты».',
  'tutorial.contactsOpen.title': 'Открыть чат',
  'tutorial.contactsOpen.body':
    'Нажмите «Написать» рядом с человеком, чтобы открыть чат с ним, даже если вы ещё не переписывались. Поиск находит по имени или @username.',
  'tutorial.automation.title': 'Автоматизация',
  'tutorial.automation.body':
    'Автоответы: если сообщение совпадает с шаблоном, приложение готовит черновик ответа. Ничего не отправляется без вашего подтверждения.',
  'tutorial.backup.title': 'Резервная копия',
  'tutorial.backup.body':
    'Сохраните зашифрованную копию данных. Открыть её можно только вашей парольной фразой.',
  'tutorial.connections.title': 'Выберите сервис',
  'tutorial.connections.body':
    'Здесь всё уже работает: «Найти входы» (рекомендуем, нужен локальный сервер) покажет, в какие сервисы вы уже вошли в своих браузерах. На любом сервисе «Импорт через браузер» (рекомендуем) — вы входите, а выгрузка импортируется сама; «Ввести вручную» — ключи API или файл. «Далее» откроет сервис, выбранный вами последним (сначала Email).',
  'tutorial.connectionDetail.title': 'Импорт или вручную',
  'tutorial.connectionDetail.body':
    'На вкладке «Импорт через браузер» нажмите «Открыть браузер» и войдите, запустите там выгрузку данных — скачанный файл импортируется автоматически. Хотите сами? Переключитесь на «Ввести вручную».',

  // CV synchronisation screen (issue #29).
  'cv.title': 'Синхронизация резюме',
  'cv.intro':
    'Прочитайте резюме со всех поддерживаемых площадок через локальную сессию браузера, сравните версии поле за полем, затем запланируйте и примените обновление. Ничего не записывается, пока вы не нажмёте «Применить».',
  'cv.use': 'Исп.',
  'cv.platform': 'Площадка',
  'cv.markup': 'Доступ к разметке',
  'cv.steps': 'Шаги плана',
  'cv.snapshot': 'Последний снимок',
  'cv.confidence': '{verified} проверено / {draft} черновых',
  'cv.noSnapshot': 'Не читалось',
  'cv.loginPlaceholder': 'Логин или id профиля',
  'cv.read': 'Прочитать выбранные',
  'cv.compare': 'Сравнить',
  'cv.planSync': 'Запланировать синхронизацию',
  'cv.applySync': 'Применить синхронизацию',
  'cv.busy': 'Работаем — сессия браузера управляет площадкой…',
  'cv.differences': 'Различия',
  'cv.field': 'Поле',
  'cv.values': 'Значения',
  'cv.missing': 'Отсутствует на',
  'cv.noConflicts':
    'Конфликтов нет: все площадки согласованы по прочитанным полям.',
  'cv.syncTitle': 'План синхронизации',
  'cv.dryRun': 'Пробный запуск — ни на одну площадку ничего не записано.',
  'cv.applied': 'Применено — перечисленные площадки обновлены.',
  'cv.action':
    '{platform}: {writable} записываемых, {unsupported} неподдерживаемых — {paths}',
  'cv.morePaths': '(ещё {count})',
  'cv.telemetry': 'Недавние запуски',
  'cv.noRuns': 'Запусков пока не записано.',
  'cv.unavailable':
    'Этот сервер не предоставляет маршруты CV. Запустите JS-сервер (`meta-sovereign serve`) или используйте команды `meta-sovereign cv-*`, которые управляют браузером локально.',
  'automations.mode.safe': 'безопасный: черновики на подтверждение',
  'automations.mode.auto': 'автоматический',
  'automations.reason.none': 'никто не подошёл',
  'automations.reason.network': 'другая сеть',
  'automations.reason.not-personal': 'не личный чат',
  'automations.reason.not-mutual': 'вы там ни разу не писали',
  'automations.reason.talked-recently': 'недавно общались',
  'automations.reason.last-from-me': 'последнее сообщение ваше',
  'automations.reason.last-from-contact': 'последнее сообщение от собеседника',
  'automations.reason.last-from-nobody': 'нет сообщений',
  'automations.reason.draft-pending': 'черновик уже ждёт',
  'automations.reason.already-sent': 'уже отправлено недавно',
  'automations.reason.already-skipped': 'недавно пропущено',
  'automations.title': 'Автоматизации',
  'automations.intro':
    'Каждая автоматизация задаёт, кому писать, когда, при каких условиях и каким текстом. В безопасном режиме в каждом чате остаётся черновик для подтверждения; в автоматическом сообщения уходят с набором текста и паузами.',
  'automations.new': 'Новая автоматизация',
  'automations.newName': 'Новая автоматизация',
  'automations.pick':
    'Выберите автоматизацию, чтобы изменить, проверить или запустить её, или создайте новую.',
  'automations.preset': 'шаблон',
  'automations.off': 'выключена',
  'automations.presets.reengage-dormant.name': 'Привет тем, кто молчит 90 дней',
  'automations.presets.reengage-dormant.description':
    'Личные чаты без сообщений 90 дней получают приветствие с вопросом, не нужна ли им или их друзьям помощь с автоматизацией.',
  'automations.presets.job-search.name': 'Спросить об открытых вакансиях',
  'automations.presets.job-search.description':
    'Расскажите контактам, что вы открыты к новым ролям; сочетайте с аудиторией коллег или рекрутеров.',
  'automations.presets.contract-search.name': 'Предложить работу по контракту',
  'automations.presets.contract-search.description':
    'Сообщите контактам, что берёте проекты на контракт; пересекайте списки, чтобы написать именно тем, кому нужно.',
  'automations.presets.greet-back.name': 'Ответить на приветствие',
  'automations.presets.greet-back.description':
    'Когда кто-то здоровается в личном чате, подготовить приветствие в нужной форме (не чаще раза в день).',
  'automations.edit': 'Изменить «{name}»',
  'automations.close': 'Закрыть',
  'automations.delete': 'Удалить',
  'automations.confirmDelete': 'Удалить автоматизацию «{name}»?',
  'automations.preview': 'Предпросмотр',
  'automations.runSafe': 'Сохранить и подготовить черновики',
  'automations.runAuto': 'Сохранить и отправить сейчас',
  'automations.history': 'История',
  'automations.useSelection': 'Выбранные ({count})',
  'automations.section.about': 'Автоматизация',
  'automations.section.triggers': 'Когда запускается',
  'automations.section.audience': 'Кому',
  'automations.section.conditions': 'Условия',
  'automations.section.message': 'Сообщение',
  'automations.section.pacing': 'Темп',
  'automations.field.name': 'Название',
  'automations.field.description': 'Описание',
  'automations.field.enabled':
    'Включена (срабатывает по расписанию и на входящие)',
  'automations.field.mode': 'Режим',
  'automations.field.audience': 'Аудитория',
  'automations.field.silentDays': 'Не общались не меньше (дней)',
  'automations.field.cooldownDays': 'Не повторять (дней)',
  'automations.field.mutual': 'Только чаты, где вы тоже писали',
  'automations.field.personal': 'Только личные чаты',
  'automations.field.lastFrom': 'Последнее сообщение от',
  'automations.field.networks': 'Сети (пусто: все)',
  'automations.field.form': 'Обращение',
  'automations.field.limit': 'Не больше за запуск',
  'automations.field.dailyCap': 'Не больше в день',
  'automations.field.minDelay': 'Пауза от (секунд)',
  'automations.field.maxDelay': 'Пауза до (секунд)',
  'automations.field.typing': 'Показывать набор текста перед сообщением',
  'automations.trigger.manual': 'вручную',
  'automations.trigger.chat-menu': 'из меню чата',
  'automations.trigger.schedule': 'каждые',
  'automations.trigger.incoming': 'на входящее сообщение по шаблону',
  'automations.hint.schedule': '30m, 12h, 1d или 2w; пусто: без расписания',
  'automations.hint.incoming':
    'Регулярное выражение; пусто: не реагировать на сообщения',
  'automations.hint.audience':
    'personal, friends:vk, chat:vk:<id>, community:vk:<id>, list:<id>, audience:<id>, person:vk:<id>; объединяйте через | (или), & (и), - (кроме) и скобки',
  'automations.hint.template':
    '{name}, {days} и {network} подставляются для каждого человека',
  'automations.form.auto': 'определять ты/вы',
  'automations.form.informal': 'на «ты»',
  'automations.form.formal': 'на «Вы»',
  'automations.lastFrom.any': 'Кого угодно',
  'automations.lastFrom.me': 'Меня',
  'automations.lastFrom.contact': 'Собеседника',
  'automations.status.sent': 'Отправлено',
  'automations.status.failed': 'Не отправлено',
  'automations.status.skipped': 'Пропущено',
  'automations.plan.title': 'Кому написать: {count}',
  'automations.plan.nothingSent':
    'Это предпросмотр: ничего не отправлено и не поставлено в очередь.',
  'automations.plan.leftOut': 'Не вошли: {reasons}',
  'automations.notice.saved': '«{name}» сохранена.',
  'automations.notice.deleted': '«{name}» удалена.',
  'automations.notice.queued':
    'Черновиков в чатах: {count}. Откройте чат, чтобы проверить и отправить.',
  'automations.notice.listSaved': 'Список «{name}» сохранён (людей: {count}).',
  'automations.notice.audienceSaved':
    'Аудитория «{name}» сохранена (людей: {count}).',
  'automations.error.name': 'Дайте автоматизации название',
  'automations.error.number': 'Числа должны быть не меньше нуля',
  'automations.error.audience': 'Не удалось разобрать аудиторию',
  'automations.error.trigger': 'Выберите хотя бы один способ запуска',
  'automations.error.invalid': 'Автоматизация заполнена неверно',
  'automations.people.title': 'Люди',
  'automations.people.search': 'Поиск по имени, нику или сети',
  'automations.people.sameAs': 'ещё в сетях: {count}',
  'automations.people.selected': 'Выбрано: {count}',
  'automations.people.test': 'Проверка: без условий',
  'automations.people.run': 'Запустить «{name}» для них',
  'automations.people.pickAutomation':
    'Откройте автоматизацию, чтобы запустить её для выбранных.',
  'automations.people.listName': 'Название списка',
  'automations.people.saveList': 'Сохранить списком',
  'automations.people.clear': 'Снять выбор',
  'automations.audiences.title': 'Аудитории',
  'automations.audiences.use': 'Использовать',
  'automations.audiences.count': 'Посчитать',
  'automations.audiences.resolved': 'Людей: {count}. {names}',
  'settings.appearance.title': 'Внешний вид',
  'settings.appearance.intro':
    'Тема и оформление действуют на всех экранах и сохраняются в этом браузере. Кнопка «Тема» в шапке переключает светлую и тёмную.',
  'settings.appearance.theme': 'Тема',
  'settings.appearance.skin': 'Оформление',
  'settings.theme.system': 'Как в системе',
  'settings.theme.light': 'Светлая',
  'settings.theme.dark': 'Тёмная',
  'settings.theme.auto': 'Авто: днём (7–19) светлая, ночью тёмная',
  'settings.skin.t3': 'Как в t3.codes (по умолчанию)',
  'settings.skin.telegram': 'Как в Telegram',
  'settings.skin.whatsapp': 'Как в WhatsApp',
  'settings.skin.signal': 'Как в Signal',
  'greetings.title': 'Приветствия',
  'greetings.intro':
    'Выберите стикеры и фразы для начала диалога, посмотрите, кого поприветствует план, и отправьте. Картинки стикеров загружаются прямо из сетей; в приложение ничего не копируется.',
  'greetings.stickers': 'Стикеры и фразы',
  'greetings.selected': 'Выбрано стикеров: {count} из {total}',
  'greetings.pick': 'Использовать {label}',
  'greetings.telegramDefault':
    'Стикеры, которые Telegram предлагает в пустом чате, приходят из пользовательского API ({method} «{emoticon}»), а бот его вызвать не может. Вместо этого получите стикеры из наборов ниже или добавьте свои наборы.',
  'greetings.sets': 'Наборы стикеров Telegram',
  'greetings.language': 'Язык приветствия',
  'greetings.prefer': 'Отправлять',
  'greetings.prefer.sticker': 'Стикер, где это возможно',
  'greetings.prefer.text': 'Текстовое приветствие',
  'greetings.listLive': 'Получить стикеры из сетей',
  'greetings.save': 'Сохранить выбор',
  'greetings.saved': 'Выбор сохранён.',
  'greetings.planTitle': 'Кого приветствовать',
  'greetings.mode': 'План',
  'greetings.mode.initiate': 'Начать новые диалоги',
  'greetings.mode.reply': 'Ответить на приветствия',
  'greetings.delay': 'Пауза между отправками, с',
  'greetings.preview': 'Показать план',
  'greetings.send': 'Отправить приветствия',
  'greetings.busy': 'Выполняется…',
  'greetings.noPlan':
    'Плана пока нет. Постройте его, чтобы увидеть, кого поприветствовать.',
  'greetings.emptyPlan':
    'Приветствовать некого: все известные чаты уже поприветствованы, отвечены или отфильтрованы.',
  'greetings.chat': 'Чат',
  'greetings.lang': 'Язык',
  'greetings.what': 'Приветствие',
  'greetings.status': 'Статус',
  'greetings.ready': 'Готово',
  'greetings.sent': 'Отправлено',
  'greetings.skipped': 'Пропущено: {reason}',
  'greetings.networks': 'Что разрешает каждая сеть',
  'greetings.network': 'Сеть',
  'greetings.addressing': 'Стикеры',
  'greetings.initiate': 'Можно начать диалог',
  'greetings.note': 'Примечание',
  'greetings.initiate.yes': 'Да',
  'greetings.initiate.window':
    'В течение {hours} ч после их последнего сообщения',
  'greetings.initiate.reply-only': 'Только ответы',
  'greetings.textOnly': 'Только текст',

  /* ---- Отображение сообщений Telegram ---- */
};
