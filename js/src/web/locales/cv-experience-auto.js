const entries = {
  en: {
    title: 'Acquire both profiles and compare',
    hint: 'Use the latest available HeadHunter résumé or enter a specific hash. Review the translated comparison before preparing any provider change.',
    start: 'Acquire and compare',
    status: 'Recover status',
    stop: 'Stop preparation',
    new: 'New request',
    open: 'Open comparison',
    'acquiring-hh': 'Acquiring HeadHunter experience…',
    'acquiring-linkedin': 'Acquiring LinkedIn experience…',
    'waiting-login':
      'Sign in in the dedicated LinkedIn browser window to continue.',
    planning: 'Comparing experience and translations…',
    completed: 'The translated comparison is ready for review.',
    stopped: 'Preparation stopped. Any completed snapshots are retained.',
    failed: 'Preparation failed. Any completed snapshots are retained.',
    interrupted:
      'Preparation was interrupted. Start a new request to try again.',
    unknown: 'Checking the existing request by ID. You can stop it here.',
    openError:
      'The exact comparison could not be opened. The previous plan is retained.',
  },
  ru: {
    title: 'Получить и сравнить оба профиля',
    hint: 'Используйте последнее доступное резюме HeadHunter или укажите хеш. Проверьте сравнение с переводами перед подготовкой изменений.',
    start: 'Получить и сравнить',
    status: 'Восстановить статус',
    stop: 'Остановить подготовку',
    new: 'Новый запрос',
    open: 'Открыть сравнение',
    'acquiring-hh': 'Получаем опыт с HeadHunter…',
    'acquiring-linkedin': 'Получаем опыт из LinkedIn…',
    'waiting-login':
      'Для продолжения войдите в LinkedIn в отдельном окне браузера.',
    planning: 'Сравниваем опыт и переводы…',
    completed: 'Сравнение с переводами готово к проверке.',
    stopped: 'Подготовка остановлена. Полученные снимки сохранены.',
    failed: 'Не удалось завершить подготовку. Полученные снимки сохранены.',
    interrupted:
      'Подготовка прервана. Для повторной попытки создайте новый запрос.',
    unknown: 'Проверяем существующий запрос по ID. Здесь его можно остановить.',
    openError: 'Не удалось открыть это сравнение. Предыдущий план сохранён.',
  },
  zh: {
    title: '获取并比较两份资料',
    hint: '使用最新可用的 HeadHunter 简历，或输入指定哈希值。准备修改前，请查看带译文的比较结果。',
    start: '获取并比较',
    status: '恢复状态',
    stop: '停止准备',
    new: '新请求',
    open: '打开比较结果',
    'acquiring-hh': '正在获取 HeadHunter 工作经历…',
    'acquiring-linkedin': '正在获取 LinkedIn 工作经历…',
    'waiting-login': '请在专用的 LinkedIn 浏览器窗口中登录后继续。',
    planning: '正在比较工作经历和译文…',
    completed: '带译文的比较结果已准备好，可以查看。',
    stopped: '准备已停止。已获取的快照已保留。',
    failed: '准备失败。已获取的快照已保留。',
    interrupted: '准备已中断。请发起新请求重试。',
    unknown: '正在按 ID 检查现有请求。您可以在此停止请求。',
    openError: '无法打开这份比较结果。之前的计划已保留。',
  },
  hi: {
    title: 'दोनों प्रोफ़ाइल हासिल करें और तुलना करें',
    hint: 'नवीनतम HeadHunter रिज़्यूमे इस्तेमाल करें या कोई हैश दर्ज करें। बदलाव तैयार करने से पहले अनुवाद सहित तुलना की समीक्षा करें।',
    start: 'प्रोफ़ाइल लें और तुलना करें',
    status: 'स्थिति फिर पाएँ',
    stop: 'तैयारी रोकें',
    new: 'नया अनुरोध',
    open: 'तुलना खोलें',
    'acquiring-hh': 'HeadHunter का अनुभव लिया जा रहा है…',
    'acquiring-linkedin': 'LinkedIn का अनुभव लिया जा रहा है…',
    'waiting-login':
      'आगे बढ़ने के लिए LinkedIn की अलग ब्राउज़र विंडो में साइन इन करें।',
    planning: 'अनुभव और अनुवाद की तुलना हो रही है…',
    completed: 'अनुवाद सहित तुलना समीक्षा के लिए तैयार है।',
    stopped: 'तैयारी रुकी। पूरे हो चुके स्नैपशॉट सुरक्षित हैं।',
    failed: 'तैयारी पूरी नहीं हुई। पूरे हो चुके स्नैपशॉट सुरक्षित हैं।',
    interrupted:
      'तैयारी बाधित हुई। फिर कोशिश करने के लिए नया अनुरोध शुरू करें।',
    unknown:
      'ID से मौजूदा अनुरोध की स्थिति देखी जा रही है। आप इसे यहाँ रोक सकते हैं।',
    openError: 'यह तुलना नहीं खुल सकी। पिछली योजना सुरक्षित है।',
  },
};
export const experienceAutoLocale = (locale) =>
  Object.fromEntries(
    Object.entries(entries[locale] ?? entries.en).map(([key, value]) => [
      `experienceAuto.${key}`,
      value,
    ])
  );
