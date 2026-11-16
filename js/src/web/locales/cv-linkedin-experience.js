const entries = {
  en: {
    title: 'Read native LinkedIn experience',
    hint: 'Open the full experience URL in a separate browser using your visibility settings. Manual sign-in needs a visible window; the export waits up to 30 minutes. Existing editors are preserved. Stop ends this export. Only readable, fully expanded results become a private snapshot.',
    url: 'LinkedIn full experience URL',
    requestId: 'Export request ID · keep for recovery',
    language: 'Source language',
    en: 'English',
    ru: 'Russian',
    start: 'Start LinkedIn export',
    status: 'Recover export status',
    stop: 'Stop export',
    new: 'New request',
    select: 'Select exported snapshot',
    txt: 'Download original text',
    json: 'Download parsing evidence',
    unknown:
      'The current export state is unknown. Recover status with this request ID; Start will not be repeated.',
    error:
      'The operation was not confirmed. Your URL, request ID and saved snapshots are retained.',
    loginRequired:
      'Switch the LinkedIn experience browser to visible mode to sign in, then start a new request.',
    'phase.opening': 'Opening the LinkedIn experience window…',
    'phase.waiting-login':
      'Sign in in the LinkedIn window. Waiting up to 30 minutes; you can stop at any time.',
    'phase.reading': 'Expanding and reading experience…',
    'phase.completed':
      'The private experience snapshot and parsing evidence were saved.',
    'phase.stopped': 'The export stopped.',
    'phase.failed':
      'The export could not be confirmed. Review the LinkedIn window before starting a new request.',
    'phase.interrupted':
      'The export was interrupted. Recovery did not restart it.',
  },
  ru: {
    title: 'Прочитать опыт из LinkedIn',
    hint: 'Откройте полный URL опыта в отдельном браузере с вашими настройками видимости. Для ручного входа нужно видимое окно: ожидание — до 30 минут. Открытые редакторы сохраняются. Остановка завершает экспорт. Личный снимок создаётся только из доступных и полностью раскрытых записей.',
    url: 'Полный URL опыта LinkedIn',
    requestId: 'ID запроса экспорта · сохраните для восстановления',
    language: 'Язык источника',
    en: 'Английский',
    ru: 'Русский',
    start: 'Начать экспорт LinkedIn',
    status: 'Восстановить статус',
    stop: 'Остановить экспорт',
    new: 'Новый запрос',
    select: 'Выбрать экспортированный снимок',
    txt: 'Скачать исходный текст',
    json: 'Скачать данные разбора',
    unknown:
      'Текущее состояние экспорта неизвестно. Проверьте статус по этому ID: запуск не будет повторён.',
    error:
      'Операция не подтверждена. URL, ID запроса и сохранённые снимки сохранены.',
    loginRequired:
      'Включите видимый режим браузера опыта LinkedIn для входа, затем создайте новый запрос.',
    'phase.opening': 'Открываем окно опыта LinkedIn…',
    'phase.waiting-login':
      'Войдите в окне LinkedIn. Ожидание до 30 минут; экспорт можно остановить.',
    'phase.reading': 'Раскрываем и читаем опыт…',
    'phase.completed': 'Личный снимок опыта и данные разбора сохранены.',
    'phase.stopped': 'Экспорт остановлен.',
    'phase.failed':
      'Экспорт не подтверждён. Проверьте окно LinkedIn перед новым запросом.',
    'phase.interrupted':
      'Экспорт прерван. Проверка статуса не запустила его повторно.',
  },
  hi: {
    title: 'LinkedIn से मूल अनुभव पढ़ें',
    hint: 'अनुभव का पूरा URL आपकी दृश्यता सेटिंग वाले अलग ब्राउज़र में खोलें। मैन्युअल साइन इन के लिए दिखाई देने वाली विंडो चाहिए; निर्यात 30 मिनट तक प्रतीक्षा करता है। खुले संपादक सुरक्षित रहते हैं। रोकने से यह निर्यात समाप्त होगा। केवल पढ़ने योग्य, पूरी तरह विस्तृत नतीजों का निजी स्नैपशॉट बनेगा।',
    url: 'LinkedIn के पूरे अनुभव का URL',
    requestId: 'निर्यात अनुरोध ID · पुनर्प्राप्ति के लिए रखें',
    language: 'स्रोत की भाषा',
    en: 'अंग्रेज़ी',
    ru: 'रूसी',
    start: 'LinkedIn निर्यात शुरू करें',
    status: 'निर्यात स्थिति पुनः प्राप्त करें',
    stop: 'निर्यात रोकें',
    new: 'नया अनुरोध',
    select: 'निर्यात किया स्नैपशॉट चुनें',
    txt: 'मूल पाठ डाउनलोड करें',
    json: 'पार्सिंग प्रमाण डाउनलोड करें',
    unknown:
      'निर्यात की वर्तमान स्थिति अज्ञात है। इसी अनुरोध ID से स्थिति प्राप्त करें; शुरुआत दोहराई नहीं जाएगी।',
    error:
      'कार्य की पुष्टि नहीं हुई। आपका URL, अनुरोध ID और सहेजे स्नैपशॉट सुरक्षित हैं।',
    loginRequired:
      'साइन इन करने के लिए LinkedIn अनुभव ब्राउज़र का दिखाई देने वाला मोड चुनें, फिर नया अनुरोध शुरू करें।',
    'phase.opening': 'LinkedIn अनुभव विंडो खुल रही है…',
    'phase.waiting-login':
      'LinkedIn विंडो में साइन इन करें। 30 मिनट तक प्रतीक्षा होगी; कभी भी रोक सकते हैं।',
    'phase.reading': 'अनुभव को विस्तृत करके पढ़ रहे हैं…',
    'phase.completed': 'निजी अनुभव स्नैपशॉट और पार्सिंग प्रमाण सहेजे गए।',
    'phase.stopped': 'निर्यात रोक दिया गया।',
    'phase.failed':
      'निर्यात की पुष्टि नहीं हुई। नया अनुरोध शुरू करने से पहले LinkedIn विंडो जाँचें।',
    'phase.interrupted':
      'निर्यात बाधित हुआ। स्थिति पुनर्प्राप्त करने से यह दोबारा शुरू नहीं हुआ।',
  },
  zh: {
    title: '读取 LinkedIn 原生工作经历',
    hint: '在单独的浏览器中按您的可见性设置打开完整工作经历网址。手动登录需要可见窗口；导出最多等待 30 分钟。现有编辑器会保留。停止将结束本次导出。只有可读且完全展开的结果才会保存为私有快照。',
    url: 'LinkedIn 完整工作经历网址',
    requestId: '导出请求 ID · 请保留以便恢复',
    language: '源语言',
    en: '英语',
    ru: '俄语',
    start: '开始 LinkedIn 导出',
    status: '恢复导出状态',
    stop: '停止导出',
    new: '新请求',
    select: '选择已导出的快照',
    txt: '下载原始文本',
    json: '下载解析证据',
    unknown: '当前导出状态未知。请使用此请求 ID 查询状态；不会重复启动。',
    error: '操作未获确认。网址、请求 ID 和已存快照均已保留。',
    loginRequired:
      '请将 LinkedIn 工作经历浏览器切换为可见模式并登录，然后开始新请求。',
    'phase.opening': '正在打开 LinkedIn 工作经历窗口…',
    'phase.waiting-login':
      '请在 LinkedIn 窗口登录。最多等待 30 分钟，可随时停止。',
    'phase.reading': '正在展开并读取工作经历…',
    'phase.completed': '私有工作经历快照与解析证据已保存。',
    'phase.stopped': '导出已停止。',
    'phase.failed': '导出未获确认。开始新请求前请检查 LinkedIn 窗口。',
    'phase.interrupted': '导出已中断。恢复状态并未重新启动导出。',
  },
};
export const linkedinExperienceLocale = (locale) =>
  Object.fromEntries(
    Object.entries(entries[locale] ?? entries.en).map(([key, value]) => [
      `linkedinExperience.${key}`,
      value,
    ])
  );
