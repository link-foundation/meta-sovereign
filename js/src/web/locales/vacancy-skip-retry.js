const messages = {
  en: {
    hint: 'Refusals are private to this browser workspace. A disabled control or confirmed click refusal permits one attempt on a later application run. Close the open review before clearing; clearing never sends or resolves uncertain delivery.',
    'until-cleared': 'Blocked until you clear this refusal.',
    'next-run':
      'One further attempt is available on a later application run. Uncertain sends remain reserved.',
    'retry-exhausted':
      'Recorded on two runs; blocked until you clear this refusal.',
    apply_button_disabled: 'The native Apply control is disabled',
    button_disabled: 'The native form Send control is disabled',
    apply_click_failed: 'The native Apply click was refused before dispatch',
    click_failed: 'The native form Send click was refused before dispatch',
    'clear-apply_button_disabled': 'Clear disabled Apply controls',
    'clear-button_disabled': 'Clear disabled Send controls',
    'clear-apply_click_failed': 'Clear refused Apply clicks',
    'clear-click_failed': 'Clear refused Send clicks',
  },
  ru: {
    hint: 'Отказы сохраняются только в этом браузерном пространстве. Неактивная кнопка или подтверждённый отказ до нажатия допускает ещё одну попытку при следующем запуске откликов. Перед очисткой закройте проверку. Очистка ничего не отправляет и не отменяет неизвестный результат отправки.',
    'until-cleared': 'Заблокировано до очистки этого отказа.',
    'next-run':
      'При следующем запуске откликов доступна ещё одна попытка. Отправки с неизвестным результатом остаются зарезервированы.',
    'retry-exhausted':
      'Отказ записан в двух запусках; заблокировано до очистки.',
    apply_button_disabled: 'Кнопка «Откликнуться» на площадке неактивна',
    button_disabled: 'Кнопка отправки формы на площадке неактивна',
    apply_click_failed: 'Нажатие «Откликнуться» отклонено до отправки',
    click_failed: 'Нажатие отправки формы отклонено до отправки',
    'clear-apply_button_disabled': 'Очистить неактивные кнопки отклика',
    'clear-button_disabled': 'Очистить неактивные кнопки отправки',
    'clear-apply_click_failed': 'Очистить отклонённые нажатия отклика',
    'clear-click_failed': 'Очистить отклонённые нажатия отправки',
  },
  hi: {
    hint: 'रुकावटें इसी ब्राउज़र कार्यक्षेत्र में निजी रहती हैं। निष्क्रिय बटन या भेजने से पहले पुष्ट अस्वीकृति के बाद, अगले आवेदन रन में एक और प्रयास मिलता है। मिटाने से पहले खुली समीक्षा बंद करें। मिटाने से कुछ भेजा नहीं जाता और अनिश्चित भेजने का आरक्षण नहीं हटता।',
    'until-cleared': 'यह रुकावट मिटाने तक बंद है।',
    'next-run':
      'अगले आवेदन रन में एक और प्रयास उपलब्ध है। अनिश्चित भेजने का आरक्षण बना रहता है।',
    'retry-exhausted': 'दो रन में रुकावट दर्ज हुई; मिटाने तक बंद है।',
    apply_button_disabled: 'मूल आवेदन बटन निष्क्रिय है',
    button_disabled: 'मूल फ़ॉर्म का भेजें बटन निष्क्रिय है',
    apply_click_failed: 'भेजने से पहले आवेदन क्लिक अस्वीकार हुआ',
    click_failed: 'भेजने से पहले फ़ॉर्म का भेजें क्लिक अस्वीकार हुआ',
    'clear-apply_button_disabled': 'निष्क्रिय आवेदन बटन की रुकावटें मिटाएँ',
    'clear-button_disabled': 'निष्क्रिय भेजें बटन की रुकावटें मिटाएँ',
    'clear-apply_click_failed': 'अस्वीकृत आवेदन क्लिक मिटाएँ',
    'clear-click_failed': 'अस्वीकृत भेजें क्लिक मिटाएँ',
  },
  zh: {
    hint: '拒绝记录仅保存在此浏览器工作区。按钮不可用或已确认在发送前拒绝点击时，下次申请运行可再尝试一次。清除前请关闭当前审阅；清除不会发送申请，也不会解除结果未知的发送保留。',
    'until-cleared': '清除此记录前保持阻止。',
    'next-run': '下次申请运行可再尝试一次。结果未知的发送仍保持保留。',
    'retry-exhausted': '已在两次运行中记录拒绝；清除前保持阻止。',
    apply_button_disabled: '平台申请按钮不可用',
    button_disabled: '平台表单发送按钮不可用',
    apply_click_failed: '平台申请点击在发送前被拒绝',
    click_failed: '平台表单发送点击在发送前被拒绝',
    'clear-apply_button_disabled': '清除不可用的申请按钮记录',
    'clear-button_disabled': '清除不可用的发送按钮记录',
    'clear-apply_click_failed': '清除被拒绝的申请点击记录',
    'clear-click_failed': '清除被拒绝的发送点击记录',
  },
};

export const vacancySkipRetryLocale = (locale) =>
  Object.fromEntries(
    Object.entries(messages[locale]).map(([key, value]) => [
      `vacancySkip.${key}`,
      value,
    ])
  );
