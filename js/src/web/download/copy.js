/**
 * Strings for the download landing page (issue #37), in the four
 * locales the SPA ships (`js/src/web/locales/`). Kept separate from
 * the SPA dictionaries so the page loads without React or the app
 * bundle. Missing keys fall back to English (`translate` in
 * `model.js`).
 */

export const COPY = Object.freeze({
  en: {
    pageTitle: 'Download Meta Sovereign',
    eyebrow: 'Desktop and web app',
    tagline:
      'Personal CRM and unified messenger. Local-first: your contacts and messages stay on your device.',
    language: 'Language',
    statusLoading: 'Checking the latest release…',
    statusReady: 'Latest desktop release',
    statusFallback:
      'No desktop build found yet. Open the releases page for the newest files.',
    downloadFor: 'Download for {platform}',
    chooseOs: 'Choose your operating system',
    mobileNote:
      'Desktop apps run on Windows, macOS and Linux. On a phone or tablet, open the web app.',
    unavailable: 'Not in this release',
    notPublished: 'No desktop release yet',
    openReleases: 'Open GitHub Releases',
    otherSystems: 'Other systems',
    allDownloads: 'All downloads',
    allReleases: 'All releases',
    checksums: 'Checksums (SHA256SUMS.txt)',
    provenance: 'Build provenance',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    installer: 'installer',
    portable: 'portable',
    appleSilicon: 'Apple silicon',
    intel: 'Intel',
    webTitle: 'Use it in the browser',
    webBody:
      'The web app needs no install. Data stays in this browser. Features that need a server, such as mail and messenger imports, scheduled automations and sync, turn on when a local server is running.',
    openWebApp: 'Open the web app',
    serverTitle: 'Unlock every feature with a local server',
    serverBody:
      'Install Node.js 26.12.1 or newer and start the server. The web app finds it at http://127.0.0.1:8787 and switches to the full feature set.',
    serverGithubNote:
      'If npm answers 404 (the package is not published yet), run it straight from GitHub:',
    safariNote:
      'Safari blocks this HTTPS page from reaching the local HTTP API. Trust the local HTTPS certificate once with node js/bin/meta-sovereign.js trust, then keep using this hosted app. The localhost UI is optional (--local-ui=true).',
    installTitle: 'Installing',
    windowsHint:
      'Unsigned builds trigger Microsoft SmartScreen: choose “More info”, then “Run anyway”. The portable .exe runs without installing.',
    linuxHint:
      'AppImage: make it executable (chmod +x) and run it. Debian/Ubuntu: sudo apt install ./<file>.deb. tar.gz: extract and run meta-sovereign.',
    macHint:
      'Builds without an Apple Developer ID signature are blocked on first launch (“Apple could not verify…”). After checking the SHA-256 below, either open System Settings → Privacy & Security and click “Open Anyway”, or remove the quarantine flag:',
    verifyTitle: 'Verify your download',
    verifyIntro:
      'Pick the downloaded file and SHA256SUMS.txt from the same release. The hash is computed in this browser; nothing is uploaded.',
    verifyFile: 'Downloaded file',
    verifySums: 'SHA256SUMS.txt',
    verifyIdle: 'Choose both files to compare SHA-256 hashes.',
    verifyWorking: 'Computing SHA-256…',
    verifyMissing: 'SHA256SUMS.txt has no line for this file name.',
    verifyMatch: 'Checksum matches.',
    verifyMismatch: 'Checksum does NOT match. Do not install this file.',
    verifyCli: 'From a terminal:',
    sourceCode: 'Source code',
    userGuide: 'User guide',
  },
  ru: {
    pageTitle: 'Скачать Meta Sovereign',
    eyebrow: 'Десктопное и веб-приложение',
    tagline:
      'Личная CRM и единый мессенджер. Local-first: контакты и сообщения остаются на вашем устройстве.',
    language: 'Язык',
    statusLoading: 'Проверяем последний релиз…',
    statusReady: 'Последний десктопный релиз',
    statusFallback:
      'Десктопная сборка пока не найдена. Откройте страницу релизов, чтобы увидеть новые файлы.',
    downloadFor: 'Скачать для {platform}',
    chooseOs: 'Выберите операционную систему',
    mobileNote:
      'Десктопные приложения работают в Windows, macOS и Linux. На телефоне или планшете откройте веб-приложение.',
    unavailable: 'Нет в этом релизе',
    notPublished: 'Десктопного релиза пока нет',
    openReleases: 'Открыть релизы на GitHub',
    otherSystems: 'Другие системы',
    allDownloads: 'Все загрузки',
    allReleases: 'Все релизы',
    checksums: 'Контрольные суммы (SHA256SUMS.txt)',
    provenance: 'Происхождение сборки',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    installer: 'установщик',
    portable: 'портативная версия',
    appleSilicon: 'Apple silicon',
    intel: 'Intel',
    webTitle: 'Работа в браузере',
    webBody:
      'Веб-приложение не нужно устанавливать. Данные хранятся в этом браузере. Функции, которым нужен сервер (импорт почты и мессенджеров, автоматизации по расписанию, синхронизация), включаются, когда запущен локальный сервер.',
    openWebApp: 'Открыть веб-приложение',
    serverTitle: 'Все функции с локальным сервером',
    serverBody:
      'Установите Node.js 26.12.1 или новее и запустите сервер. Веб-приложение найдёт его по адресу http://127.0.0.1:8787 и включит все функции.',
    serverGithubNote:
      'Если npm отвечает 404 (пакет ещё не опубликован), запустите прямо из GitHub:',
    safariNote:
      'Safari блокирует обращения этой HTTPS-страницы к локальному HTTP API. Один раз выполните node js/bin/meta-sovereign.js trust, чтобы доверять локальному HTTPS-сертификату, и продолжайте пользоваться размещённым приложением. Localhost-интерфейс необязателен (--local-ui=true).',
    installTitle: 'Установка',
    windowsHint:
      'Неподписанные сборки вызывают предупреждение Microsoft SmartScreen: нажмите «Подробнее», затем «Выполнить в любом случае». Портативный .exe работает без установки.',
    linuxHint:
      'AppImage: сделайте файл исполняемым (chmod +x) и запустите. Debian/Ubuntu: sudo apt install ./<файл>.deb. tar.gz: распакуйте и запустите meta-sovereign.',
    macHint:
      'Сборки без подписи Apple Developer ID блокируются при первом запуске («Apple не удалось проверить…»). Сверив SHA-256 ниже, откройте Системные настройки → Конфиденциальность и безопасность и нажмите «Всё равно открыть» или снимите карантин:',
    verifyTitle: 'Проверка загрузки',
    verifyIntro:
      'Выберите скачанный файл и SHA256SUMS.txt из того же релиза. Хеш считается в браузере, файлы никуда не отправляются.',
    verifyFile: 'Скачанный файл',
    verifySums: 'SHA256SUMS.txt',
    verifyIdle: 'Выберите оба файла, чтобы сравнить SHA-256.',
    verifyWorking: 'Считаем SHA-256…',
    verifyMissing: 'В SHA256SUMS.txt нет строки для этого имени файла.',
    verifyMatch: 'Контрольная сумма совпадает.',
    verifyMismatch:
      'Контрольная сумма НЕ совпадает. Не устанавливайте этот файл.',
    verifyCli: 'В терминале:',
    sourceCode: 'Исходный код',
    userGuide: 'Руководство пользователя',
  },
  zh: {
    pageTitle: '下载 Meta Sovereign',
    eyebrow: '桌面应用与网页应用',
    tagline:
      '个人 CRM 与统一消息中心。本地优先：联系人和消息保存在你的设备上。',
    language: '语言',
    statusLoading: '正在检查最新版本…',
    statusReady: '最新桌面版本',
    statusFallback: '尚未找到桌面版本。请打开发布页面获取最新文件。',
    downloadFor: '下载 {platform} 版',
    chooseOs: '请选择你的操作系统',
    mobileNote:
      '桌面应用支持 Windows、macOS 和 Linux。在手机或平板上请使用网页应用。',
    unavailable: '此版本未提供',
    notPublished: '尚无桌面版本',
    openReleases: '打开 GitHub 发布页面',
    otherSystems: '其他系统',
    allDownloads: '全部下载',
    allReleases: '所有版本',
    checksums: '校验和（SHA256SUMS.txt）',
    provenance: '构建来源',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    installer: '安装程序',
    portable: '便携版',
    appleSilicon: 'Apple 芯片',
    intel: 'Intel',
    webTitle: '在浏览器中使用',
    webBody:
      '网页应用无需安装，数据保存在当前浏览器中。需要服务器的功能（邮件和消息导入、定时自动化、同步）会在本地服务器运行时启用。',
    openWebApp: '打开网页应用',
    serverTitle: '运行本地服务器以解锁全部功能',
    serverBody:
      '安装 Node.js 26.12.1 或更高版本并启动服务器。网页应用会在 http://127.0.0.1:8787 找到它并启用全部功能。',
    serverGithubNote:
      '如果 npm 返回 404（软件包尚未发布），可直接从 GitHub 运行：',
    safariNote:
      'Safari 阻止此 HTTPS 页面访问本地 HTTP API。运行一次 node js/bin/meta-sovereign.js trust 以信任本地 HTTPS 证书，然后继续使用此托管应用。localhost 界面是可选的（--local-ui=true）。',
    installTitle: '安装说明',
    windowsHint:
      '未签名的版本会触发 Microsoft SmartScreen：点击“更多信息”，然后点击“仍要运行”。便携版 .exe 无需安装即可运行。',
    linuxHint:
      'AppImage：添加可执行权限（chmod +x）后运行。Debian/Ubuntu：sudo apt install ./<文件>.deb。tar.gz：解压后运行 meta-sovereign。',
    macHint:
      '没有 Apple Developer ID 签名的版本首次启动时会被拦截（“Apple 无法验证…”）。核对下方的 SHA-256 后，可打开“系统设置 → 隐私与安全性”并点击“仍要打开”，或移除隔离标记：',
    verifyTitle: '校验下载文件',
    verifyIntro:
      '选择下载的文件和同一版本的 SHA256SUMS.txt。哈希在浏览器中本地计算，不会上传任何内容。',
    verifyFile: '下载的文件',
    verifySums: 'SHA256SUMS.txt',
    verifyIdle: '选择两个文件以比较 SHA-256 哈希。',
    verifyWorking: '正在计算 SHA-256…',
    verifyMissing: 'SHA256SUMS.txt 中没有该文件名的记录。',
    verifyMatch: '校验和一致。',
    verifyMismatch: '校验和不一致。请不要安装此文件。',
    verifyCli: '在终端中：',
    sourceCode: '源代码',
    userGuide: '用户指南',
  },
  hi: {
    pageTitle: 'Meta Sovereign डाउनलोड करें',
    eyebrow: 'डेस्कटॉप और वेब ऐप',
    tagline:
      'निजी CRM और एकीकृत मैसेंजर। लोकल-फ़र्स्ट: आपके संपर्क और संदेश आपके डिवाइस पर ही रहते हैं।',
    language: 'भाषा',
    statusLoading: 'नवीनतम रिलीज़ की जाँच हो रही है…',
    statusReady: 'नवीनतम डेस्कटॉप रिलीज़',
    statusFallback:
      'अभी तक कोई डेस्कटॉप बिल्ड नहीं मिला। नई फ़ाइलों के लिए रिलीज़ पेज खोलें।',
    downloadFor: '{platform} के लिए डाउनलोड करें',
    chooseOs: 'अपना ऑपरेटिंग सिस्टम चुनें',
    mobileNote:
      'डेस्कटॉप ऐप Windows, macOS और Linux पर चलते हैं। फ़ोन या टैबलेट पर वेब ऐप खोलें।',
    unavailable: 'इस रिलीज़ में नहीं है',
    notPublished: 'अभी कोई डेस्कटॉप रिलीज़ नहीं',
    openReleases: 'GitHub रिलीज़ खोलें',
    otherSystems: 'अन्य सिस्टम',
    allDownloads: 'सभी डाउनलोड',
    allReleases: 'सभी रिलीज़',
    checksums: 'चेकसम (SHA256SUMS.txt)',
    provenance: 'बिल्ड का स्रोत',
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    installer: 'इंस्टॉलर',
    portable: 'पोर्टेबल',
    appleSilicon: 'Apple silicon',
    intel: 'Intel',
    webTitle: 'ब्राउज़र में उपयोग करें',
    webBody:
      'वेब ऐप को इंस्टॉल करने की ज़रूरत नहीं है। डेटा इसी ब्राउज़र में रहता है। जिन सुविधाओं को सर्वर चाहिए, जैसे मेल और मैसेंजर इम्पोर्ट, शेड्यूल किए गए ऑटोमेशन और सिंक, वे लोकल सर्वर चलने पर चालू होती हैं।',
    openWebApp: 'वेब ऐप खोलें',
    serverTitle: 'लोकल सर्वर से सभी सुविधाएँ पाएँ',
    serverBody:
      'Node.js 26.12.1 या नया संस्करण इंस्टॉल करें और सर्वर शुरू करें। वेब ऐप उसे http://127.0.0.1:8787 पर ढूँढ लेता है और सभी सुविधाएँ चालू कर देता है।',
    serverGithubNote:
      'अगर npm 404 देता है (पैकेज अभी प्रकाशित नहीं हुआ है), तो सीधे GitHub से चलाएँ:',
    safariNote:
      'Safari इस HTTPS पेज को local HTTP API तक पहुँचने नहीं देता। एक बार node js/bin/meta-sovereign.js trust से local HTTPS certificate पर भरोसा करें, फिर इसी hosted app का उपयोग करें। Localhost UI वैकल्पिक है (--local-ui=true)।',
    installTitle: 'इंस्टॉल करना',
    windowsHint:
      'बिना हस्ताक्षर वाले बिल्ड पर Microsoft SmartScreen चेतावनी देता है: “More info” और फिर “Run anyway” चुनें। पोर्टेबल .exe बिना इंस्टॉल किए चलता है।',
    linuxHint:
      'AppImage: फ़ाइल को एक्ज़ीक्यूटेबल बनाएँ (chmod +x) और चलाएँ। Debian/Ubuntu: sudo apt install ./<फ़ाइल>.deb। tar.gz: निकालें और meta-sovereign चलाएँ।',
    macHint:
      'Apple Developer ID हस्ताक्षर के बिना बिल्ड पहली बार खोलने पर रोके जाते हैं (“Apple could not verify…”)। नीचे SHA-256 जाँचने के बाद System Settings → Privacy & Security में “Open Anyway” दबाएँ, या क्वारंटीन फ़्लैग हटाएँ:',
    verifyTitle: 'डाउनलोड की जाँच करें',
    verifyIntro:
      'डाउनलोड की गई फ़ाइल और उसी रिलीज़ की SHA256SUMS.txt चुनें। हैश इसी ब्राउज़र में निकाला जाता है; कुछ भी अपलोड नहीं होता।',
    verifyFile: 'डाउनलोड की गई फ़ाइल',
    verifySums: 'SHA256SUMS.txt',
    verifyIdle: 'SHA-256 हैश मिलाने के लिए दोनों फ़ाइलें चुनें।',
    verifyWorking: 'SHA-256 निकाला जा रहा है…',
    verifyMissing: 'SHA256SUMS.txt में इस फ़ाइल नाम की कोई पंक्ति नहीं है।',
    verifyMatch: 'चेकसम मेल खाता है।',
    verifyMismatch: 'चेकसम मेल नहीं खाता। यह फ़ाइल इंस्टॉल न करें।',
    verifyCli: 'टर्मिनल से:',
    sourceCode: 'सोर्स कोड',
    userGuide: 'उपयोगकर्ता गाइड',
  },
});

/** Endonyms for the language switcher. */
export const LOCALE_NAMES = Object.freeze({
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  hi: 'हिन्दी',
});
