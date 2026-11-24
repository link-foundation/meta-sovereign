const entries = {
  en: {
    title: 'HH sign-in browser',
    hint: 'Use the selected slot to sign in or complete CAPTCHA yourself. Close this window before reading vacancies. Login is not verified automatically; cookies stay in this workspace’s private browser profile. The window closes after 30 minutes.',
    open: 'Open sign-in browser',
    close: 'Close sign-in browser',
    reload: 'Check browser state',
    none: 'No sign-in window has been opened.',
    unknown:
      'Browser state is not confirmed. Check its state before opening another window.',
    opening: 'Opening the visible browser.',
    'browser-open':
      'The browser is open for manual sign-in. Authentication is unverified.',
    'close-failed':
      'Browser closure is unconfirmed. The slot remains reserved; close it again.',
    closed: 'The sign-in browser is closed. Authentication remains unverified.',
    expired: 'The sign-in window expired and closed.',
    cancelled: 'The sign-in browser was stopped.',
    failed: 'The sign-in browser could not open.',
    interrupted:
      'The sign-in request was interrupted. It will not reopen automatically.',
    visible:
      'Choose Visible browser for manual sign-in, or change the saved visibility preference.',
    error:
      'This operation was not confirmed. Check browser state; opening is never replayed.',
    'attention.waiting':
      'Finish HeadHunter sign-in in {slot}, then close the browser.',
    'attention.notification':
      'A HeadHunter browser is open for manual sign-in.',
  },
  ru: {
    title: 'Браузер входа HH',
    hint: 'Войдите или пройдите CAPTCHA самостоятельно в выбранном слоте. Закройте это окно перед чтением вакансий. Вход автоматически не проверяется; cookies хранятся в личном профиле браузера этого рабочего пространства. Окно закроется через 30 минут.',
    open: 'Открыть браузер входа',
    close: 'Закрыть браузер входа',
    reload: 'Проверить состояние браузера',
    none: 'Окно входа ещё не открывалось.',
    unknown:
      'Состояние браузера не подтверждено. Проверьте его перед открытием нового окна.',
    opening: 'Открывается видимый браузер.',
    'browser-open':
      'Браузер открыт для ручного входа. Авторизация не проверена.',
    'close-failed':
      'Закрытие не подтверждено. Слот остаётся занят; повторите закрытие.',
    closed: 'Браузер входа закрыт. Авторизация остаётся непроверенной.',
    expired: 'Время входа истекло, окно закрыто.',
    cancelled: 'Браузер входа остановлен.',
    failed: 'Не удалось открыть браузер входа.',
    interrupted: 'Запрос входа прерван. Окно не откроется автоматически.',
    visible:
      'Выберите видимый браузер для ручного входа или измените сохранённую настройку видимости.',
    error:
      'Операция не подтверждена. Проверьте состояние браузера; открытие не повторяется автоматически.',
    'attention.waiting':
      'Завершите вход в HeadHunter в слоте {slot}, затем закройте браузер.',
    'attention.notification': 'Открыт браузер для ручного входа в HeadHunter.',
  },
  zh: {
    title: 'HH 登录浏览器',
    hint: '请在所选槽位中自行登录或完成验证码。读取职位前请关闭此窗口。系统不会自动验证登录；Cookie 保留在此工作区的私有浏览器配置中。窗口将在 30 分钟后关闭。',
    open: '打开登录浏览器',
    close: '关闭登录浏览器',
    reload: '检查浏览器状态',
    none: '尚未打开登录窗口。',
    unknown: '浏览器状态未确认。打开新窗口前请先检查。',
    opening: '正在打开可见浏览器。',
    'browser-open': '浏览器已打开，可手动登录。身份验证尚未确认。',
    'close-failed': '尚未确认浏览器已关闭。槽位仍被保留，请再次关闭。',
    closed: '登录浏览器已关闭。身份验证仍未确认。',
    expired: '登录窗口已到期并关闭。',
    cancelled: '登录浏览器已停止。',
    failed: '无法打开登录浏览器。',
    interrupted: '登录请求已中断，不会自动重新打开。',
    visible: '请为手动登录选择可见浏览器，或修改已保存的可见性设置。',
    error: '操作尚未确认。请检查浏览器状态；系统不会重放打开请求。',
    'attention.waiting':
      '请在 {slot} 槽位完成 HeadHunter 登录，然后关闭浏览器。',
    'attention.notification': '已打开浏览器，可手动登录 HeadHunter。',
  },
  hi: {
    title: 'HH साइन-इन ब्राउज़र',
    hint: 'चुने स्लॉट में स्वयं साइन इन करें या CAPTCHA पूरा करें। रिक्तियाँ पढ़ने से पहले यह विंडो बंद करें। लॉगिन अपने आप सत्यापित नहीं होता; कुकी इस कार्यक्षेत्र की निजी ब्राउज़र प्रोफ़ाइल में रहती हैं। विंडो 30 मिनट बाद बंद होगी।',
    open: 'साइन-इन ब्राउज़र खोलें',
    close: 'साइन-इन ब्राउज़र बंद करें',
    reload: 'ब्राउज़र स्थिति जाँचें',
    none: 'साइन-इन विंडो अभी नहीं खोली गई है।',
    unknown:
      'ब्राउज़र स्थिति अपुष्ट है। दूसरी विंडो खोलने से पहले स्थिति जाँचें।',
    opening: 'दृश्य ब्राउज़र खुल रहा है।',
    'browser-open':
      'ब्राउज़र मैन्युअल साइन-इन के लिए खुला है। प्रमाणीकरण अपुष्ट है।',
    'close-failed':
      'ब्राउज़र बंद होने की पुष्टि नहीं हुई। स्लॉट आरक्षित है; फिर बंद करें।',
    closed: 'साइन-इन ब्राउज़र बंद है। प्रमाणीकरण अभी अपुष्ट है।',
    expired: 'साइन-इन की अवधि पूरी हुई और विंडो बंद हो गई।',
    cancelled: 'साइन-इन ब्राउज़र रोक दिया गया।',
    failed: 'साइन-इन ब्राउज़र नहीं खुल सका।',
    interrupted: 'साइन-इन अनुरोध बाधित हुआ। यह अपने आप फिर नहीं खुलेगा।',
    visible:
      'मैन्युअल साइन-इन के लिए दृश्य ब्राउज़र चुनें या सहेजी दृश्यता बदलें।',
    error:
      'कार्रवाई अपुष्ट है। ब्राउज़र स्थिति जाँचें; खोलने का अनुरोध दोहराया नहीं जाएगा।',
    'attention.waiting':
      '{slot} स्लॉट में HeadHunter साइन-इन पूरा करें, फिर ब्राउज़र बंद करें।',
    'attention.notification':
      'HeadHunter में मैन्युअल साइन-इन के लिए ब्राउज़र खुला है।',
  },
};
export const jobLoginLocale = (language) =>
  Object.fromEntries(
    Object.entries(entries[language] ?? entries.en).map(([key, value]) => [
      `jobLogin.${key}`,
      value,
    ])
  );
