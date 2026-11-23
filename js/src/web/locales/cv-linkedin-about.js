const entries = {
  en: {
    aboutStart: 'Prepare About in LinkedIn',
    aboutSaved: 'A fresh LinkedIn profile confirms the saved About text.',
    save: 'Save in LinkedIn',
    opening: 'Opening the LinkedIn profile…',
    prepared: 'Review the draft in the LinkedIn window.',
    verifying: 'Checking the updated LinkedIn profile…',
    failed:
      'The review could not proceed. Check the LinkedIn window and the current export.',
    unconfirmed:
      'The result is unconfirmed. Check the LinkedIn profile before trying again.',
    interrupted:
      'The review was interrupted. Check the LinkedIn window and the current export.',
  },
  ru: {
    aboutStart: 'Подготовить раздел «О себе» в LinkedIn',
    aboutSaved:
      'Свежие данные профиля LinkedIn подтверждают сохранение текста «О себе».',
    save: 'Сохранить в LinkedIn',
    opening: 'Открываем профиль LinkedIn…',
    prepared: 'Проверьте черновик в окне LinkedIn.',
    verifying: 'Проверяем обновлённый профиль LinkedIn…',
    failed:
      'Не удалось продолжить проверку. Проверьте окно LinkedIn и текущий экспорт.',
    unconfirmed:
      'Результат не подтверждён. Перед повтором проверьте профиль LinkedIn.',
    interrupted:
      'Проверка прервана. Проверьте окно LinkedIn и текущий экспорт.',
  },
  zh: {
    aboutStart: '在 LinkedIn 中准备个人简介',
    aboutSaved: '重新读取的 LinkedIn 资料已确认保存的简介。',
    save: '在 LinkedIn 中保存',
    opening: '正在打开 LinkedIn 资料…',
    prepared: '请在 LinkedIn 窗口中检查草稿。',
    verifying: '正在检查更新后的 LinkedIn 资料…',
    failed: '无法继续审阅。请检查 LinkedIn 窗口和当前导出。',
    unconfirmed: '结果尚未确认。请在重试前检查 LinkedIn 资料。',
    interrupted: '审阅已中断。请检查 LinkedIn 窗口和当前导出。',
  },
  hi: {
    aboutStart: 'LinkedIn में परिचय तैयार करें',
    aboutSaved:
      'दोबारा पढ़ी गई LinkedIn प्रोफ़ाइल सहेजे गए परिचय की पुष्टि करती है।',
    save: 'LinkedIn में सहेजें',
    opening: 'LinkedIn प्रोफ़ाइल खोली जा रही है…',
    prepared: 'LinkedIn विंडो में मसौदे की समीक्षा करें।',
    verifying: 'अपडेट की गई LinkedIn प्रोफ़ाइल की जाँच हो रही है…',
    failed:
      'समीक्षा जारी नहीं रह सकी। LinkedIn विंडो और वर्तमान निर्यात देखें।',
    unconfirmed:
      'नतीजे की पुष्टि नहीं हुई। फिर कोशिश करने से पहले LinkedIn प्रोफ़ाइल देखें।',
    interrupted: 'समीक्षा रुक गई। LinkedIn विंडो और वर्तमान निर्यात देखें।',
  },
};

export const linkedinAboutLocale = (language) =>
  Object.fromEntries(
    Object.entries(entries[language]).map(([key, text]) => [
      `linkedinAbout.${key}`,
      text,
    ])
  );
