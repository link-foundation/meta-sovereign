export const ruFollowBacklink = {
  'followBacklink.title': 'Follow: публикация и проверка обратных ссылок',
  'followBacklink.hint':
    'Проверьте ссылку Telegram или приглашение VK перед отправкой в выбранные группы VK. Проверка продолжается на подключённом сервере после ухода со страницы. Сообщения с неизвестным результатом сохраняются для проверки и автоматически не отправляются повторно.',
  'followBacklink.chats': 'ID групп VK (peer ID), через запятую',
  'followBacklink.backlink': 'Ваша ссылка Telegram или приглашение VK',
  'followBacklink.monitorMs': 'Длительность проверки (миллисекунды)',
  'followBacklink.intervalMs': 'Интервал проверок (миллисекунды)',
  'followBacklink.delayMs': 'Пауза между сообщениями (миллисекунды)',
  'followBacklink.deleteIncoming':
    'Удалять входящие сообщения только у меня после успешной проверки',
  'followBacklink.historyLimit': 'Последних сообщений для очистки (1–200)',
  'followBacklink.attempts': 'Попыток чтения при таймауте (1–10)',
  'followBacklink.retryDelayMs': 'Начальная пауза повтора (миллисекунды)',
  'followBacklink.retryMaxDelayMs': 'Максимальная пауза повтора (миллисекунды)',
  'followBacklink.preview': 'Проверить перед отправкой',
  'followBacklink.apply': 'Подтвердить сообщения и параметры очистки',
  'followBacklink.list': 'Загрузить сохранённые запуски',
  'followBacklink.status': 'Обновить результат',
  'followBacklink.resume': 'Продолжить оставшиеся безопасные шаги',
  'followBacklink.cancel': 'Остановить оставшиеся шаги',
  'followBacklink.working': 'Выполняется…',
  'followBacklink.review': 'Проверьте аккаунт, группы и параметры',
  'followBacklink.owner': 'Аккаунт VK {owner}',
  'followBacklink.window':
    'Проверять {duration} мс с интервалом {interval} мс.',
  'followBacklink.cleanupHint':
    'После подтверждения проверить до {limit} последних сообщений и удалить входящие только у этого аккаунта. Исходящие и служебные сообщения сохраняются.',
  'followBacklink.message': 'Сообщение {id}',
  'followBacklink.providerCode': 'Ошибка VK {code}',
  'followBacklink.cleanupResult':
    'Очистка: {status}; подтверждено удалений: {count}.',
  'followBacklink.skipNotice':
    'Недавнее сообщение чата просит дождаться пяти чужих ссылок. Удалённое сообщение не будет автоматически повторяться.',
  'followBacklink.history':
    'Сохранённых запусков: {count}. Перед новой публикацией проверьте существующий запуск.',
  'followBacklink.next': 'Следующие сохранённые запуски',
  'followBacklink.queued': 'В очереди',
  'followBacklink.running': 'Отправка или проверка',
  'followBacklink.paused': 'Приостановлено; подтверждения сохранены',
  'followBacklink.confirmed': 'Подтверждено',
  'followBacklink.rejected': 'Сообщение удалено',
  'followBacklink.unknown': 'Результат неизвестен; нужна проверка',
  'followBacklink.failed':
    'Операция не выполнена. Подтверждения сохранены; проверьте подключение и права.',
  'followBacklink.ready': 'Готово к проверке',
  'followBacklink.sending': 'Запрос отправлен; ожидается подтверждение',
  'followBacklink.monitoring': 'Доставка подтверждена; проверяется сохранность',
  'followBacklink.survived': 'Сохранено после периода проверки',
  'followBacklink.skipped': 'Пропущено',
  'followBacklink.bad-request':
    'Проверьте ID групп, ссылку, числовые пределы и параметры повторов.',
  'followBacklink.not-connected':
    'Подключите пользовательский аккаунт VK на этом сервере.',
  'followBacklink.account-changed':
    'Подключённый аккаунт изменился. Подтверждения сохранены.',
  'followBacklink.not-writable':
    'В одну из выбранных групп нельзя отправлять сообщения.',
  'followBacklink.provider-response':
    'VK вернул непригодное подтверждение. Успех не предполагается.',
  'followBacklink.timeout':
    'Время чтения истекло после заданного числа попыток. Можно продолжить оставшиеся проверки.',
  'followBacklink.rate-limited':
    'VK ограничивает запросы. Подождите перед продолжением проверок.',
  'followBacklink.captcha': 'VK требует капчу. Решите её в Подключениях.',
  'followBacklink.provider-refused':
    'VK отклонил операцию. Проверьте код ошибки и права.',
  'followBacklink.outcome-unknown':
    'Изменение не подтверждено. Проверьте сохранённый запуск; автоматического повтора не будет.',
  'followBacklink.read-failed':
    'Проверка не выполнена. Результаты сохранены; обновите их перед продолжением.',
  'followBacklink.follow-server-required':
    'Подключите сервер с пользовательским аккаунтом VK для отправки и проверки ссылок.',
  'followBacklink.busy':
    'На сервере уже выполняется другой запуск. Проверьте его перед новым.',
  'followBacklink.plan-expired':
    'Проверка устарела или уже использована. Проверьте параметры заново.',
  'followBacklink.not-running':
    'Этот запуск здесь не выполняется. Обновите сохранённый результат.',
  'followBacklink.unsupported':
    'Этот сервис или подключение не поддерживает такой процесс.',
  'followBacklink.cancelled':
    'Оставшиеся шаги остановлены; результаты отправленных запросов сохранены.',
  'followBacklink.stopped': 'Сервер завершает работу; подтверждения сохранены.',
  'followBacklink.not-found':
    'Сохранённый запуск не найден на подключённом сервере.',
  'followBacklink.confirmation-required':
    'Сначала проверьте и явно подтвердите операцию.',
};
