export const ruTelegramGreetings = {
  'telegram.group.title': 'Лично приветствовать участников группы',
  'telegram.group.note':
    'Сначала соберите и проверьте список. Исключаются вы, боты, удалённые, поддельные, мошеннические, проверенные аккаунты и аккаунты с видимыми бизнес-данными. Непроверенные бизнес-профили исключаются. Подтверждённое приветствие — не чаще раза в 24 часа; неопределённый исход блокирует повтор.',
  'telegram.group.target': 'Точное имя, ID или ссылка группы Telegram',
  'telegram.group.participantsLimit':
    'Лимит сбора участников (0: все доступные)',
  'telegram.group.limit': 'Лимит приветствий (0: все подходящие)',
  'telegram.group.delayMs': 'Пауза между получателями (миллисекунды)',
  'telegram.group.scan': 'Собрать участников группы',
  'telegram.group.preview': 'Проверить личные приветствия',
  'telegram.group.apply': 'Отправить {count} личных приветствий',
  'telegram.group.planDelay':
    'Пауза между получателями: {seconds} с. Остановка при первой неудачной или неопределённой отправке.',
  'telegram.group.sample':
    'Показаны первые 100 получателей из проверенного списка.',
  'telegram.group.processed': 'Обработано {count} из {total} получателей',
  'telegram.group.checkingBusiness': 'Проверка видимых бизнес-профилей…',
  'telegram.group.nextAt': 'Следующий получатель после {at}',
  'telegram.group.stopped':
    'Рассылка остановлена. Проверьте результаты перед новым сбором.',
  'telegram.group.uncertain':
    'Ответ сервера потерян. Обновите задание и проверьте Telegram и исходящие перед новой попыткой. Запрос не будет повторён автоматически.',
  'telegram.group.unavailable':
    'Операция не завершена. Проверьте соединение и результаты задания.',
  'telegram.group.result.sent': 'Подтверждено Telegram',
  'telegram.group.result.failed': 'Не отправлено',
  'telegram.group.result.unknown': 'Исход неопределён',
  'telegram.group.result.skipped': 'Пропущено',
  'telegram.group.reason.verified': 'Проверенный аккаунт',
  'telegram.group.reason.business': 'Бизнес-аккаунт',
  'telegram.group.reason.business-unavailable': 'Бизнес-профиль недоступен',
  'telegram.group.reason.not-participant': 'Нет в собранном списке участников',
  'telegram.group.reason.group-required':
    'Выберите доступную группу или супергруппу вместо пользователя или вещательного канала.',
  'telegram.group.reason.group-scan-required':
    'Сначала завершите сбор участников этой группы.',
  'telegram.group.reason.preview-expired':
    'Срок проверки истёк или список изменился. Проверьте новый выбор.',
  'telegram.group.reason.account-changed':
    'Аккаунт изменился. Повторите сбор и проверку.',
  'telegram.group.reason.target-changed':
    'Группа или получатель изменились. Повторите сбор и проверку.',
  'telegram.group.reason.recipient-ineligible':
    'Получатель больше не подходит.',
  'telegram.group.reason.already-greeted':
    'Уже приветствовали за последние 24 часа',
  'telegram.group.reason.previous-outcome-unknown':
    'Предыдущий исход не выяснен',
  'telegram.greeting.title': 'Отправить одно приветствие в Telegram',
  'telegram.greeting.note':
    'Проверьте аккаунт, адресата и сообщение перед отправкой. Стикеры-приветствия ограничены одним за последние 24 часа в каждом чате.',
  'telegram.greeting.userRequired':
    'Подключите пользовательский аккаунт Telegram к серверу с поддержкой подтверждённой отправки приветствий.',
  'telegram.greeting.target':
    'Точное имя пользователя, ID чата или ссылка Telegram',
  'telegram.greeting.operation': 'Сообщение',
  'telegram.greeting.operation.greeting-sticker': 'Стикер-приветствие',
  'telegram.greeting.operation.bot-start': 'Запустить бота (/start)',
  'telegram.greeting.random':
    'Приветствие выбирается из кэша при предпросмотре. Можно выбрать стикер ниже.',
  'telegram.greeting.useRandom': 'Выбрать случайно при предпросмотре',
  'telegram.greeting.chosen': 'Стикер: {sticker}',
  'telegram.greeting.preview': 'Предпросмотр сообщения',
  'telegram.greeting.send': 'Отправить это сообщение',
  'telegram.greeting.review': 'Аккаунт {owner} → {target}',
  'telegram.greeting.expires': 'Предпросмотр действует до: {at}',
  'telegram.greeting.busy': 'Ожидание Telegram…',
  'telegram.greeting.reload': 'Проверить подключение для приветствий',
  'telegram.greeting.result.sent': 'Telegram подтвердил сообщение {id}.',
  'telegram.greeting.result.failed':
    'Сообщение не отправлено. Проверьте адресата и подключение перед новым предпросмотром.',
  'telegram.greeting.result.unknown':
    'Доставка не подтверждена. Проверьте чат и укажите результат в исходящих перед новой отправкой.',
  'telegram.greeting.result.skipped':
    'Этот чат уже получил приветствие за последние 24 часа. Ничего не отправлено.',
  'telegram.greeting.error.bad-request':
    'Проверьте точного адресата и выбранный стикер.',
  'telegram.greeting.error.busy': 'Приветствие уже отправляется.',
  'telegram.greeting.error.stopped':
    'Аккаунт останавливается. Подключитесь заново.',
  'telegram.greeting.error.cancelled':
    'Предпросмотр или отправка отменены до доставки.',
  'telegram.greeting.error.plan-expired':
    'Предпросмотр истёк или уже использован. Создайте новый.',
  'telegram.greeting.error.account-changed':
    'Аккаунт изменился. Проверьте новый предпросмотр.',
  'telegram.greeting.error.target-changed':
    'Адресат изменился после предпросмотра. Проверьте его заново.',
  'telegram.greeting.error.bot-required':
    'Для /start выберите доступного бота Telegram.',
  'telegram.greeting.error.target-unavailable': 'Этот адресат недоступен.',
  'telegram.greeting.error.sticker-unavailable':
    'Приветствие недоступно в кэше аккаунта. Обновите кэш или выберите другой стикер.',
  'telegram.greeting.error.user-account-required':
    'Подключите пользовательский аккаунт Telegram.',
  'telegram.greeting.error.already-greeted':
    'Этот чат уже получил приветствие за последние 24 часа.',
  'telegram.greeting.error.previous-outcome-unknown':
    'Результат предыдущей отправки неизвестен. Проверьте чат и укажите результат в исходящих.',
  'telegram.greeting.error.unavailable':
    'Не удалось выполнить запрос. Адресат и выбранный стикер сохранены.',
  'telegram.catalog.title': 'Стикеры-приветствия Telegram',
  'telegram.catalog.note':
    'Найдите стикеры для подключённого аккаунта. Обновление читает рекомендуемые наборы, маски, недавние и избранные стикеры. Сообщения не отправляются.',
  'telegram.catalog.userRequired':
    'Подключите пользовательский аккаунт Telegram к серверу с поддержкой поиска стикеров-приветствий.',
  'telegram.catalog.refresh': 'Обновить кэш стикеров',
  'telegram.catalog.reload': 'Проверить подключение и кэш',
  'telegram.catalog.maxSets': 'Максимум наборов стикеров',
  'telegram.catalog.maxDocuments': 'Максимум стикеров',
  'telegram.catalog.busy': 'Чтение стикеров Telegram…',
  'telegram.catalog.count':
    'Стикеров-приветствий: {greetings}, всего в кэше: {total}.',
  'telegram.catalog.updated': 'Кэш обновлён: {at}',
  'telegram.catalog.stale':
    'Кэш старше десяти минут. Последнее обновление: {at}',
  'telegram.catalog.empty':
    'Кэша пока нет. Обновите его для поиска стикеров-приветствий.',
  'telegram.catalog.greetingsOnly':
    'Только hi, hello и стикеры с машущей рукой',
  'telegram.catalog.previous': 'Предыдущие стикеры',
  'telegram.catalog.next': 'Следующие стикеры',
  'telegram.catalog.select': 'Выбрать стикер',
  'telegram.catalog.selected': 'Выбран',
  'telegram.catalog.cancel': 'Остановить обновление',
  'telegram.catalog.complete': 'Полностью',
  'telegram.catalog.unavailable': 'Недоступно',
  'telegram.catalog.partial': 'Неполно',
  'telegram.catalog.source.featured': 'Рекомендуемые наборы',
  'telegram.catalog.source.masks': 'Наборы масок',
  'telegram.catalog.source.recent': 'Недавние стикеры',
  'telegram.catalog.source.faved': 'Избранные стикеры',
  'telegram.catalog.source.set': 'Набор стикеров',
  'telegram.catalog.state.running': 'Обновление… Сохранённые стикеры доступны.',
  'telegram.catalog.state.cancelling': 'Остановка после текущего запроса…',
  'telegram.catalog.state.cancelled':
    'Обновление остановлено. Прежний кэш сохранён.',
  'telegram.catalog.state.done': 'Обновление завершено.',
  'telegram.catalog.state.partial':
    'Обновление неполное. Доступные стикеры сохранены; проверьте охват источников.',
  'telegram.catalog.state.failed': 'Не удалось обновить. Прежний кэш сохранён.',
  'telegram.catalog.error.busy': 'Стикеры уже обновляются.',
  'telegram.catalog.error.bad-request':
    'Проверьте ограничения стикеров и наборов.',
  'telegram.catalog.error.user-account-required':
    'Подключите пользовательский аккаунт Telegram.',
  'telegram.catalog.error.stopped':
    'Подключитесь к серверу заново перед обновлением.',
  'telegram.catalog.error.read-failed':
    'Не удалось прочитать кэш. Проверьте подключение и повторите попытку.',
  'telegram.catalog.error.offline':
    'Сервер недоступен. Проверьте подключение для восстановления кэша.',
};
