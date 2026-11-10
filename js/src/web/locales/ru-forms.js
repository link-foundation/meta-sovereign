export const ruForms = {
  'nav.forms': 'Анкеты',
  'forms.title': 'Просмотр анкеты',
  'forms.hint':
    'Прочитайте видимые вопросы и текущие значения в отдельном слоте браузера. Просмотр сохраняет ответы без изменений и закрывает окно по завершении.',
  'forms.loading': 'Проверка доступности браузера…',
  'forms.unavailable':
    'Подключите сервер с автоматизацией браузера для просмотра анкеты.',
  'forms.retry': 'Проверить снова',
  'forms.url': 'Адрес анкеты',
  'forms.slot': 'Слот браузера',
  'forms.slotHint':
    'Именованный слот хранит собственный профиль входа. Видимость окна определяется настройками анкет и слота.',
  'forms.read': 'Прочитать текущую страницу',
  'forms.reading': 'Чтение…',
  'forms.report': 'Отчёт о просмотре',
  'forms.count': 'Прочитано полей: {fields}; документов: {frames}.',
  'forms.scope':
    'Снимок содержит видимые поля текущих страниц. На следующих страницах и в закрытых элементах могут быть другие вопросы. Номера строк действуют только в этом снимке.',
  'forms.partial': 'Часть содержимого не удалось прочитать:',
  'forms.download': 'Скачать отчёт',
  'forms.empty':
    'Видимые поля не найдены. Проверьте страницу в браузере, включая требования входа и CAPTCHA.',
  'forms.unlabelled': 'Поле без подписи',
  'forms.group': 'Группа вопросов: {label}',
  'forms.source': 'Подпись: {source} · {type} · {frame}',
  'forms.required': 'Обязательное',
  'forms.disabled': 'Недоступно',
  'forms.readOnly': 'Только чтение',
  'forms.value': 'Текущее значение: {value}',
  'forms.mixed': 'Смешанный выбор',
  'forms.checked': 'Выбрано',
  'forms.unchecked': 'Не выбрано',
  'forms.omitted': 'Содержимое поля {type} не читалось.',
  'forms.label.aria-labelledby': 'связанный доступный текст',
  'forms.label.aria-label': 'доступная подпись',
  'forms.label.label': 'подпись поля',
  'forms.label.placeholder': 'подсказка поля',
  'forms.label.title': 'всплывающая подсказка',
  'forms.label.legend': 'заголовок группы',
  'forms.label.heading': 'предшествующий заголовок',
  'forms.label.unlabelled': 'подпись не найдена',
  'forms.reason.unlabelled-controls':
    'У части полей не найдена читаемая подпись вопроса.',
  'forms.reason.text-limit':
    'Часть подписей или описаний превышает предел длины.',
  'forms.reason.value-limit': 'Часть текущих значений превышает предел длины.',
  'forms.reason.control-scan-limit': 'Достигнут предел поиска элементов.',
  'forms.reason.field-limit': 'Достигнут предел количества полей.',
  'forms.reason.option-limit': 'Часть вариантов превышает лимит.',
  'forms.reason.unexpanded-options':
    'Список вариантов закрыт; просмотр его не открывал.',
  'forms.reason.shadow-scan-limit':
    'Достигнут предел просмотра нестандартных элементов.',
  'forms.reason.custom-elements':
    'Нестандартные элементы или теневой DOM могут содержать непрочитанные поля.',
  'forms.reason.frame-limit': 'Достигнут предел количества фреймов.',
  'forms.reason.parent-frame-unavailable': 'Родительский фрейм недоступен.',
  'forms.reason.hidden-frame': 'Скрытый фрейм оставлен непрочитанным.',
  'forms.reason.frame-unavailable': 'Не удалось прочитать фрейм.',
  'forms.error.form-url':
    'Введите адрес HTTP или HTTPS без встроенных учётных данных.',
  'forms.error.form-busy':
    'Другой просмотр ещё выполняется. Дождитесь завершения и повторите.',
  'forms.error.form-changed':
    'Страница анкеты изменилась во время чтения. Прочитайте текущую страницу снова.',
  'forms.error.form-timeout':
    'Время просмотра истекло. Проверьте страницу и повторите.',
  'forms.error.form-stopped':
    'Просмотр остановлен до получения снимка. Повторите на доступном сервере.',
  'forms.error.browser-unavailable':
    'Автоматизация браузера на сервере недоступна. Проверьте его настройку.',
  'forms.error.bad-browser-policy':
    'Имя слота может содержать строчные латинские буквы, цифры, дефисы и подчёркивания.',
  'forms.error.server-required':
    'Для чтения анкеты подключите сервер с автоматизацией браузера.',
  'forms.error.form-read-failed':
    'Не удалось прочитать анкету. Адрес и последний отчёт сохранены; проверьте страницу и повторите.',
  'forms.plan.title': 'Предложения ответов',
  'forms.plan.hint':
    'Подготовьте предложения для каждого поля по сохранённым ответам и выбранному профилю владельца.',
  'forms.plan.reloadProfiles': 'Обновить профили',
  'forms.plan.profile': 'Профиль владельца',
  'forms.plan.savedOnly': 'Только сохранённые ответы',
  'forms.plan.profilesLoading': 'Загрузка профилей…',
  'forms.plan.profilesFailed':
    'Не удалось загрузить профили. Сохранённые ответы доступны.',
  'forms.plan.approximate':
    'Предлагать похожие сохранённые вопросы для проверки',
  'forms.plan.action': 'Предложить ответы',
  'forms.plan.planning': 'Подготовка…',
  'forms.plan.proposal': 'Предложение: {value}',
  'forms.plan.unresolved': 'Нужен ответ',
  'forms.plan.source': 'Источник ответа: {source}',
  'forms.plan.similarity': 'Сходство вопросов: {percent}%',
  'forms.plan.missing': 'Не хватает значений профиля: {keys}',
  'forms.plan.keys': 'Использованы значения профиля: {keys}',
  'forms.plan.rule': 'Сохранённый вопрос: {question}',
  'forms.plan.evidence': 'Подтверждение: {source}',
  'forms.plan.count':
    'Предложений: {proposed} · Без ответа: {unresolved} · Сохранено текущих значений: {preserved}',
  'forms.plan.review':
    'Проверьте каждое предложение. Подготовка не меняет форму, не отправляет и не запоминает ответы.',
  'forms.plan.profileSource': 'Профиль: {name} · версия {revision}',
  'forms.plan.modelUnavailable':
    'Предложения модели пока недоступны в этом планировщике.',
  'forms.plan.source.profile': 'Профиль владельца',
  'forms.plan.source.exact': 'Точный сохранённый вопрос',
  'forms.plan.source.template': 'Шаблон сохранённого вопроса',
  'forms.plan.source.approximate': 'Похожий сохранённый вопрос',
  'forms.plan.source.salary': 'Настройки зарплаты',
  'forms.plan.source.assembled': 'Объединённые сохранённые ответы',
  'forms.plan.source.unresolved': 'Нет подходящего ответа',
  'forms.plan.reason.protected-field':
    'Поле защищено или имеет смешанное состояние; изменение не предложено.',
  'forms.plan.reason.missing-label':
    'Для предложения ответа нужна понятная подпись вопроса.',
  'forms.plan.reason.missing-profile': 'В профиле не хватает нужных значений.',
  'forms.plan.reason.choice-mismatch':
    'Ответ не указывает ровно один доступный вариант.',
  'forms.plan.reason.field-format':
    'Проверьте соответствие ответа формату или вариантам поля.',
  'forms.plan.reason.no-answer': 'Подходящий сохранённый ответ не найден.',
  'forms.plan.reason.current-value':
    'Текущее значение сохранено. Сравните его с предложением.',
  'forms.plan.reason.review': 'Проверьте предложение перед изменением формы.',
  'forms.plan.reason.planning-limit':
    'Достигнут предел сопоставления. Поле осталось без ответа.',
  'forms.plan.error.form-report':
    'Прочитайте текущую форму заново, чтобы получить действительную отчётную копию.',
  'forms.plan.error.answer-profile-missing':
    'Выбранный профиль отсутствует. Обновите список и выберите другой.',
  'forms.plan.error.form-stopped':
    'Подготовка остановлена. Повторите на доступном сервере.',
  'forms.plan.error.server-required':
    'Подключите сервер для подготовки ответов.',
  'forms.plan.error.form-plan-failed':
    'Не удалось подготовить ответы. Отчёт, настройки и предыдущие предложения сохранены; повторите попытку.',
  'forms.review.title': 'Браузеры для проверки',
  'forms.review.hint':
    'Оставьте браузер на сервере открытым для проверки. Пройдите вход, CAPTCHA и следующие страницы в этом браузере, затем прочитайте текущую страницу. Сессии закрываются через 24 часа без активности или при остановке сервера. Эти элементы не меняют ответы и ничего не отправляют.',
  'forms.review.open': 'Открыть для проверки',
  'forms.review.opening': 'Открываем…',
  'forms.review.refresh': 'Обновить сессии',
  'forms.review.loading': 'Загрузка сессий проверки…',
  'forms.review.count': 'Открыто сессий: {count} из {limit}',
  'forms.review.read': 'Прочитать текущую страницу',
  'forms.review.focus': 'Показать браузер',
  'forms.review.close': 'Закрыть браузер',
  'forms.review.headless':
    'Браузер работает без видимого окна. Перед открытием новой сессии измените настройки видимости форм.',
  'forms.review.headed': 'Видимый браузер на сервере',
  'forms.review.visibilityPending': 'Проверяем видимость браузера…',
  'forms.review.expires': 'Закроется без активности до {time}',
  'forms.review.state.opening': 'Открывается',
  'forms.review.state.open': 'Открыт для проверки',
  'forms.review.state.closing': 'Закрывается',
  'forms.review.state.close-failed': 'Закрытие не подтверждено',
  'forms.review.error.form-slot-in-use':
    'Этот слот уже открыт. Используйте его элементы управления или выберите другой.',
  'forms.review.error.form-session-limit':
    'Закройте браузер проверки перед открытием нового.',
  'forms.review.error.form-session-missing':
    'Эта сессия больше недоступна. Обновите список.',
  'forms.review.error.form-session-closed':
    'Браузер закрыт. Откройте новую сессию проверки.',
  'forms.review.error.form-close-failed':
    'Очистка браузера не подтверждена. Сохраните сессию в списке и повторите закрытие.',
  'forms.review.error.form-focus-unavailable':
    'Этот браузер не может показать окно проверки.',
  'forms.review.error.form-busy':
    'Другая операция проверки ещё выполняется. Дождитесь её окончания.',
  'forms.review.error.form-timeout':
    'Время проверки истекло. Обновите список и повторите, когда будете готовы.',
  'forms.review.error.form-stopped':
    'Проверка останавливается. Подключите доступный сервер.',
  'forms.review.error.server-required':
    'Подключите сервер для управления браузерами проверки.',
  'forms.review.error.form-review-failed':
    'Операцию проверки не удалось подтвердить. URL и отчёт сохранены. Перед повтором обновите список.',
};
