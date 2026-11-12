export const ruVacancy = {
  'technology.working': 'Обработка сохранённых данных…',
  'technology.title': 'Анализ технологий вакансий',
  'technology.hint':
    'Сравните до 100 сохранённых описаний с явно выбранным проверенным экспортом резюме. Упоминания — текстовые свидетельства, а не подтверждение навыка. Распознаются только названия из справочника; неизвестные теги видны отдельно. Счётчики учитывают уникальные вакансии. Резюме не изменяется, отклики не отправляются.',
  'technology.catalog': 'Локальные названия и варианты технологий',
  'technology.catalogEdit':
    'Правка справочника (до 256 названий, по 8 вариантов)',
  'technology.entry': 'Запись справочника',
  'technology.new': 'Добавить название',
  'technology.canonical': 'Название технологии',
  'technology.aliases': 'Варианты названия, по одному в строке',
  'technology.caseSensitive': 'Учитывать регистр (для Go, BASIC и NPM)',
  'technology.updateDraft': 'Обновить черновик справочника',
  'technology.remove': 'Удалить из черновика',
  'technology.defaults': 'Загрузить исходные названия в черновик',
  'technology.save': 'Сохранить справочник',
  'technology.unsaved':
    'В черновике есть несохранённые изменения. Сохраните его перед анализом.',
  'technology.invalid':
    'Используйте уникальные названия до 80 символов и не более 8 вариантов на название.',
  'technology.resume': 'Проверенный экспорт резюме для сравнения',
  'technology.choose': 'Выберите экспортированное резюме',
  'technology.analyze': 'Проанализировать сохранённые вакансии',
  'technology.reload':
    'Загрузить сохранённые справочник и отчёт; сбросить черновик',
  'technology.loadError':
    'Часть сохранённых данных не загрузилась. Подключитесь к локальному серверу и загрузите снова.',
  'technology.failed':
    'Анализ или сохранение справочника не подтверждены. Предыдущие свидетельства и черновик сохранены. При конфликте справочника загрузите его снова перед сохранением.',
  'technology.saved': 'Сохранённый анализ',
  'technology.provenance': 'Проверенный источник резюме',
  'technology.stale':
    'В отчёте использована другая версия справочника. Повторите анализ с сохранённым справочником.',
  'technology.statistics': 'Статистика корпуса (уникальные вакансии)',
  'technology.evidence': 'Упоминания в резюме (20 на странице)',
  'technology.vacancy': 'Сохранённая вакансия для просмотра',
  'technology.mentioned': 'Упомянуто в резюме',
  'technology.missing': 'Не найдено в тексте резюме',
  'technology.requiredMissing':
    'Обязательные названия, отсутствующие в тексте резюме',
  'technology.preferredMissing':
    'Желательные названия, отсутствующие в тексте резюме',
  'technology.unrecognized':
    'Нераспознанные теги навыков (добавьте в справочник)',
  'technology.aliasSuggestions':
    'Наблюдаемые варианты уже упомянутых в резюме названий',
  'technology.spellingSuggestions':
    'Похожие написания для проверки (не совпадение)',
  'technology.vacancyEvidence': 'Упоминания в вакансии',
  'technology.prose': 'Исходное сохранённое описание работодателя',
  'technology.required': 'Обязательно',
  'technology.preferred': 'Желательно',
  'technology.unspecified': 'Обязательность не указана',
  'technology.ambiguous': 'Неоднозначный вариант',
  'technology.metadata.location': 'Местоположения',
  'technology.metadata.employment': 'Занятость',
  'technology.metadata.experience': 'Опыт',
  'technology.metadata.workFormat': 'Форматы работы',
  'vacancy.exports': 'Экспорт резюме HH',
  'vacancy.exportHint':
    'Прочитать последнее, выбранное или все резюме этого аккаунта HH. Исходные файлы могут содержать личные данные. Производные Markdown, текст, структурированные данные и Lino исключают контакты, зарплату и дату рождения; удалённые строки с личными данными подсчитываются. HTML нужен для проверенного извлечения. DOC содержит RTF.',
  'vacancy.exportSettings': 'Настройки экспорта',
  'vacancy.exportScope': 'Какие резюме экспортировать',
  'vacancy.exportScope.latest': 'Последнее наблюдаемое обновление',
  'vacancy.exportScope.selected': 'Резюме, выбранное для поиска',
  'vacancy.exportScope.all': 'Все наблюдаемые резюме (до 100)',
  'vacancy.exportStart': 'Прочитать и экспортировать резюме',
  'vacancy.exportRecover': 'Восстановить статус экспорта',
  'vacancy.exportUnknown':
    'Статус экспорта неизвестен. Восстановите или остановите сохранённый запрос перед новым экспортом.',
  'vacancy.exportProgress': 'Проверено резюме: {count} из {total}',
  'vacancy.exportState.running': 'Выполняется экспорт',
  'vacancy.exportState.completed': 'Экспорт завершён',
  'vacancy.exportState.failed':
    'Экспорт остановлен из-за ошибки; проверенные файлы сохранены',
  'vacancy.exportState.stopped':
    'Экспорт остановлен; проверенные файлы сохранены',
  'vacancy.exportState.interrupted':
    'Экспорт прерван; восстановление статуса его не перезапустит',
  'vacancy.exportRemoved':
    'Строк с личными данными удалено из производных файлов: {count}',
  'vacancy.exportNative': 'исходный · возможны личные данные',
  'vacancy.exportSanitized': 'без личных данных',
  'vacancy.title': 'Вакансии HH',
  'vacancy.hint':
    'Ищите вакансии в своём браузере HH и сохраняйте полное описание работодателя. Эти действия только читают вакансии и не отправляют отклик. Описания доступны при подготовке тестового задания.',
  'vacancy.settings': 'Настройки поиска и браузера',
  'vacancy.query': 'Слова для поиска',
  'vacancy.resume': 'Хеш выбранного резюме (необязательно)',
  'vacancy.area': 'ID региона HH (необязательно)',
  'vacancy.salary': 'Минимальная зарплата (необязательно)',
  'vacancy.currency': 'Валюта',
  'vacancy.order': 'Порядок',
  'vacancy.browserSlot': 'Слот браузера',
  'vacancy.mode': 'Видимость браузера',
  'vacancy.remote': 'Удалённая работа',
  'vacancy.inherit': 'Сохранённая политика браузера',
  'vacancy.visible': 'Видимый браузер',
  'vacancy.headless': 'Фоновый браузер',
  'vacancy.salary_desc': 'Сначала высокая зарплата',
  'vacancy.publication_time': 'Сначала новые',
  'vacancy.relevance': 'Сначала подходящие',
  'vacancy.search': 'Найти вакансии',
  'vacancy.stop': 'Остановить чтение',
  'vacancy.loading': 'Загружаем сохранённые вакансии…',
  'vacancy.unavailable':
    'Для чтения HH нужен подключённый сервер с поддержкой браузера. Сохранённые описания доступны.',
  'vacancy.working': 'Читаем в выделенном браузере…',
  'vacancy.failed':
    'Чтение не подтверждено. Проверьте вход или проверку в выделенном браузере. Предыдущие результаты сохранены.',
  'vacancy.page': 'Страница {page} · вакансий: {count}',
  'vacancy.collect': 'Сохранить полное описание',
  'vacancy.previous': 'Предыдущая страница',
  'vacancy.next': 'Следующая страница',
  'vacancy.responded': 'Уже откликнулись',
  'vacancy.cached': 'Сохранённые описания (последние 100)',
  'vacancy.empty':
    'Сохраните вакансию, чтобы её полное описание появилось здесь.',
  'vacancy.refresh': 'Прочитать описание заново',
  'vacancy.salaryValue': 'Зарплата',
  'vacancy.location': 'Местоположение',
  'vacancy.experience': 'Опыт',
  'vacancy.employment': 'Занятость',
  'vacancy.workFormat': 'Формат работы',
  'vacancy.published': 'Опубликовано',
  'vacancy.resumeLanguage': 'Предпочтение по названию резюме',
  'vacancy.ru': 'Сначала русское название',
  'vacancy.en': 'Сначала английское название',
  'vacancy.any': 'Любое название',
  'vacancy.resumes': 'Резюме в этом слоте браузера',
  'vacancy.readResumes': 'Прочитать список резюме',
  'vacancy.resumesHint':
    'Список только для чтения. Язык названия — подсказка, а не подтверждение языка резюме. Выбор здесь меняет настройки поиска; он не отправляет отклик и не изменяет резюме на сайте.',
  'vacancy.resumesCaptured':
    'Список сохранён {date}; прочитайте заново, чтобы проверить изменения аккаунта.',
  'vacancy.resumeSuggested': 'Выбрать {title} · {reason}',
  'vacancy.resumesEmpty': 'В этом списке резюме не обнаружены.',
  'vacancy.resumeUnknownDate': 'Дата обновления неизвестна',
  'vacancy.resumeUse': 'Использовать для поиска',
  'vacancy.resumeSelected': 'Выбрано для поиска',
  'vacancy.resumeReason.updated': 'последнее наблюдаемое обновление',
  'vacancy.resumeReason.latest': 'пометка HH «последнее»',
  'vacancy.resumeReason.list-order': 'порядок в списке HH',
  'cvTechnology.title': 'Двуязычная проверка технологий в резюме',
  'cvTechnology.hint':
    'Выберите проверенные экспорты на русском и английском. Проверьте предложения для каждого поля и сохраните выбранные изменения как локальную проверку. Резюме у провайдера останется прежним.',
  'cvTechnology.ru': 'Русский экспорт',
  'cvTechnology.en': 'Английский экспорт',
  'cvTechnology.generate': 'Подготовить локальную проверку',
  'cvTechnology.reload': 'Загрузить сохранённую проверку',
  'cvTechnology.loadError':
    'Не удалось загрузить проверку. Текущая проверка сохранена на экране.',
  'cvTechnology.before': 'Исходный текст',
  'cvTechnology.after': 'Предлагаемый текст',
  'cvTechnology.draft': 'Черновик локальной проверки',
  'cvTechnology.saved':
    'Выбранные изменения сохранены как локальная проверка. Резюме у провайдера не изменено.',
  'cvTechnology.complete':
    'Оба сохранённых экспорта уже содержат проверенные технологии.',
  'cvTechnology.blocked':
    'Устраните неоднозначность данных перед сохранением проверки.',
  'cvTechnology.coverage': 'Покрытие по полям',
  'cvTechnology.raw': 'Исходные списки и повторы',
  'cvTechnology.duplicates': 'Повторы',
  'cvTechnology.save': 'Сохранить выбранное локально',
  'cvTechnology.counterpart-ambiguous':
    'Этой позиции соответствуют несколько мест работы',
  'cvTechnology.counterpart-missing':
    'Для этой позиции не найдено место работы',
  'cvTechnology.counterpart-unresolved':
    'Соответствие места работы не установлено',
  'cvTechnology.about-layout':
    'Структура раздела «О себе» требует проверки; исходный текст сохранён',
  'cvTechnology.alias-ambiguous':
    'Название технологии имеет несколько значений',
  'cvTechnology.moreChanges': 'Показать ещё изменения',
  'cvTechnology.moreEvidence': 'Показать ещё исходные данные',
  'cvTechnology.about': 'О себе',
  'cvTechnology.skills': 'Навыки',
  'cvTechnology.position': 'Место работы',
  'cvTechnology.current': 'настоящее время',
};
