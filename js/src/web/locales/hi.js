// Hindi locale (issue #18). Keys must mirror ./en.js exactly; the
// parity test in js/tests/i18n.test.js fails the build if they
// drift. Devanagari script renders correctly without bundled fonts on
// every modern OS, but the <html lang="hi"> attribute (set by
// applyLocale in i18n.js) is essential for screen readers and
// font-fallback in the platform Chrome / Safari / Firefox.

export const hi = {
  appName: 'meta-sovereign',
  skipLink: 'मुख्य सामग्री पर जाएँ',
  'header.theme': 'थीम',
  'header.themeAria': 'डार्क मोड टॉगल करें',
  'header.tutorial': 'ट्यूटोरियल',
  'header.tutorialAria': 'ट्यूटोरियल खोलें',
  'header.language': 'भाषा',
  'header.languageAria': 'इंटरफ़ेस की भाषा चुनें',
  'header.systemDefault': 'सिस्टम डिफ़ॉल्ट',
  'header.online': 'ऑनलाइन',
  'header.offline': 'ऑफ़लाइन',
  'nav.chat': 'चैट',
  'nav.operator': 'ऑपरेटर',
  'nav.contacts': 'संपर्क',
  'nav.automation': 'स्वचालन',
  'nav.patterns': 'पैटर्न',
  'nav.replies': 'जवाब',
  'nav.facts': 'तथ्य',
  'nav.audience': 'श्रोता',
  'nav.broadcast': 'प्रसारण',
  'nav.outreach': 'पहुँच',
  'nav.profile': 'प्रोफ़ाइल',
  'nav.backup': 'बैकअप',
  'nav.status': 'स्थिति',
  'nav.connections': 'कनेक्शन',
  'nav.settings': 'सेटिंग्स',
  'shell.primaryNavAria': 'मुख्य नेविगेशन',
  'common.loading': 'लोड हो रहा है...',
  'common.refresh': 'ताज़ा करें',
  'common.save': 'सहेजें',
  'common.send': 'भेजें',
  'common.cancel': 'रद्द करें',
  'common.preview': 'पूर्वावलोकन',
  'common.queue': 'क़तार में डालें',
  'common.evaluate': 'चलाएँ',
  'common.infer': 'निकालें',
  'chat.aside': 'चैट',
  'chat.placeholder': 'संदेश लिखें...',
  'operator.title': 'ऑपरेटर',
  'operator.next': 'अगला (N)',
  'operator.done': 'हो गया (D)',
  'operator.progress': '{current} / {total}',
  'contacts.title': 'संपर्क ({count})',
  'contacts.identity': 'पहचान',
  'contacts.networks': 'नेटवर्क',
  'contacts.chats': 'चैट',
  'contacts.messages': 'संदेश',
  'contacts.lastSeen': 'पिछली बार देखा',
  'automation.title': 'स्वचालन ग्राफ़',
  'automation.edges': '{count} किनारे',
  'patterns.title': 'पैटर्न',
  'patterns.inferTitle': 'उदाहरणों से रेगेक्स निकालें',
  'patterns.examplesPlaceholder': 'हर पंक्ति में एक उदाहरण',
  'patterns.modeSimple': 'सरल',
  'patterns.modeLcs': 'lcs (परिवर्तनशील अंतराल)',
  'patterns.idPlaceholder': 'पैटर्न ID (जैसे greet)',
  'patterns.labelPlaceholder': 'लेबल',
  'patterns.colId': 'ID',
  'patterns.colRegex': 'रेगेक्स',
  'replies.title': 'जवाब विविधता समूह',
  'replies.newTitle': 'नया / अद्यतन समूह',
  'replies.idPlaceholder': 'समूह ID (जैसे thanks)',
  'replies.variationsPlaceholder': 'हर पंक्ति में एक विविधता',
  'replies.saveGroup': 'समूह सहेजें',
  'facts.title': 'तथ्य ({count})',
  'facts.colQuestion': 'प्रश्न',
  'facts.colAnswer': 'उत्तर',
  'facts.colPattern': 'पैटर्न',
  'audience.title': 'श्रोता निर्माता',
  'audience.hint':
    'ऑपरेटर: AND, OR, NOT, कोष्ठक। आयाम: network:, chat:, sender:, kind:, fact:',
  'audience.queryPlaceholder': 'जैसे network:telegram AND chat:general',
  'audience.contactsCount': '{count} संपर्क',
  'broadcast.title': 'प्रसारण',
  'outreach.title': 'पहुँच',
  'outreach.hint':
    'सामूहिक-व्यक्तिगत पहुँच। पूर्वावलोकन हमेशा; क़तार वास्तव में भेजती है।',
  'outreach.queryPlaceholder':
    'श्रोता क्वेरी, जैसे network:telegram AND chat:vip',
  'outreach.bodyPlaceholder':
    'मुख्य पाठ। हर प्राप्तकर्ता के लिए वैयक्तिक करने हेतु {name}, {networks}, {chats} का उपयोग करें।',
  'profile.title': 'प्रोफ़ाइल',
  'profile.namePlaceholder': 'नाम',
  'profile.bioPlaceholder': 'परिचय',
  'profile.saveProfile': 'प्रोफ़ाइल सहेजें',
  'profile.resumeTitle': 'रिज़्यूमे',
  'profile.titlePlaceholder': 'पदनाम',
  'profile.bodyPlaceholder': 'अनुभव',
  'profile.saveResume': 'रिज़्यूमे सहेजें',
  'backup.title': 'बैकअप',
  'backup.hint': 'एन्क्रिप्टेड संग्रह सर्वर स्टोर निर्देशिका में रहते हैं।',
  'backup.passphrasePlaceholder': 'वैकल्पिक पासफ़्रेज़',
  'backup.keepPlaceholder': 'N रखें (वैकल्पिक)',
  'backup.create': 'बैकअप बनाएँ',
  'backup.restore': 'पुनर्स्थापित करें',
  'backup.itemMeta': '{size} बाइट — {timestamp} — {state}',
  'backup.encrypted': 'एन्क्रिप्टेड',
  'backup.plain': 'सादा',
  'status.title': 'स्थिति',
  'settings.title': 'सेटिंग्स',
  'settings.intro':
    'हर प्रदाता का कनेक्शन यहाँ रहता है। क्रेडेंशियल चिपकाएँ, संग्रह अपलोड करें और लाइव API जाँचें। क्रेडेंशियल एन्क्रिप्टेड secret:* लिंक के रूप में संग्रहीत होते हैं और कभी भी सहकर्मियों को प्रसारित नहीं किए जाते।',
  'settings.credentials': 'क्रेडेंशियल',
  'settings.optional': '(वैकल्पिक)',
  'settings.storedAs': '{id} के रूप में संग्रहीत',
  'settings.saveCredentials': 'क्रेडेंशियल सहेजें',
  'settings.saving': 'सहेज रहा है...',
  'settings.saved': 'सहेजा गया।',
  'settings.forget': 'भूल जाएँ',
  'settings.forgetting': '{label} भुलाया जा रहा है...',
  'settings.forgotten': '{label} भुला दिया।',
  'settings.archive': 'संग्रह आयात',
  'settings.archivePasteHint': 'या नीचे संग्रह की सामग्री चिपकाएँ:',
  'settings.archivePastePlaceholder': 'यहाँ संग्रह की सामग्री चिपकाएँ',
  'settings.archivePasteWith': '{label} की सामग्री चिपकाएँ',
  'settings.importPasted': 'चिपकाई सामग्री आयात करें',
  'settings.importing': '{label} आयात हो रहा है...',
  'settings.importedCount': '{label} से {count} संदेश आयात किए।',
  'settings.importFailed': 'आयात विफल: {message}',
  'settings.nothingToImport': 'आयात करने के लिए कुछ नहीं है।',
  'settings.docsLink': 'क्रेडेंशियल कैसे प्राप्त करें ↗',
  'settings.credentialsSaved': 'क्रेडेंशियल सहेजे गए',
  'settings.noCredentials': 'अभी कोई क्रेडेंशियल नहीं',
  'settings.probe.idle': 'एंडपॉइंट: {url}',
  'settings.probe.notReady': 'जाँच सक्षम करने के लिए टोकन दर्ज करें',
  'settings.probe.button': 'सीधे आज़माएँ',
  'settings.probe.probing': 'जाँच रहा है...',
  'settings.probe.connected': 'जुड़ा (HTTP {status})',
  'settings.probe.httpHint': 'API ने {status} लौटाया। {hint}',
  'settings.probe.httpNoHint': 'API ने {status} लौटाया।',
  'settings.probe.cors':
    'ब्राउज़र ने अनुरोध रोका (CORS)। नीचे लोकल सर्वर शुरू करें ताकि कॉल प्रॉक्सी हो सके।',
  'settings.probe.network': 'नेटवर्क त्रुटि: {message}।',
  'settings.probe.fetchFailed': 'fetch विफल',
  'guide.connectFirstHint': 'पहले प्रदाता जोड़ें, तभी यहाँ डेटा दिखेगा।',
  'guide.openSettings': '{target} खोलें',
  'guide.openSettingsTarget': 'सेटिंग्स → कनेक्शन → {label}',
  'guide.openSettingsRoot': 'सेटिंग्स → कनेक्शन',
  'guide.probeDisabled':
    '{label} जाँच सक्षम करने के लिए सेटिंग्स में क्रेडेंशियल दर्ज करें।',
  'guide.useThisServer': 'इस सर्वर का उपयोग करें',
  'guide.fallbackTitle': 'यहाँ अभी कुछ नहीं है।',
  'guide.filesLabel': 'फ़ाइलें: {hint}',
  'guide.envVarLabel': 'पर्यावरण चर: {name}',
  'guide.localServer.title':
    'इस प्रदाता को अनलॉक करने के लिए लोकल सर्वर शुरू करें',
  'guide.localServer.body':
    'समान-मूल लोकल सर्वर प्रदाता अनुरोध को प्रॉक्सी करता है और ब्राउज़र के CORS नियम को बायपास करता है। अपना उपलब्ध रनटाइम चुनें।',
  'guide.localServer.rust': 'Rust (अनुशंसित)',
  'guide.localServer.rustHint':
    'इस रिपॉज़िटरी की शुद्ध-Rust बाइनरी का उपयोग करता है। डिफ़ॉल्ट http://127.0.0.1:8787।',
  'guide.localServer.node': 'Node / Bun / Deno',
  'guide.localServer.nodeHint':
    'पब्लिश किए गए JS सर्वर का पुनः उपयोग करता है। डिफ़ॉल्ट http://127.0.0.1:8787।',
  'guide.localServer.docker': 'Docker',
  'guide.localServer.dockerHint':
    'कंटेनर में वही JS सर्वर शुरू करता है। docker/web.Dockerfile देखें।',
  'guide.localServer.overrideHint':
    'सर्वर चलने के बाद, उसका URL नीचे चिपकाएँ और "इस सर्वर का उपयोग करें" क्लिक करें — SPA उसे संग्रहीत करेगा और पुनः लोड होगा।',
  'guide.chat.title': 'आपका एकीकृत इनबॉक्स खाली है।',
  'guide.chat.body':
    'meta-sovereign हर जुड़ी सेवा की हर चैट को एक जगह रखता है। नीचे प्रदाता जोड़ें या निर्यात किया गया संग्रह आयात करें।',
  'guide.operator.title': 'ऑपरेटर क़तार खाली है।',
  'guide.operator.body':
    'ऑपरेटर कार्ड स्ट्रीम आपको चैट-दर-चैट अपठित संदेशों के बीच ले जाती है। क़तार शुरू करने के लिए चैट-सक्षम प्रदाता जोड़ें।',
  'guide.contacts.title': 'अभी कोई संपर्क नहीं।',
  'guide.contacts.body':
    'संपर्क सभी जुड़े प्रदाताओं से एकत्रित होते हैं ताकि नेटवर्क में एक ही व्यक्ति केवल एक बार दिखे। सूची भरने के लिए प्रदाता जोड़ें।',
  'guide.automation.title': 'अभी कोई स्वचालन ग्राफ़ नहीं।',
  'guide.automation.body':
    'स्वचालन ग्राफ़ आने वाले संदेशों को पैटर्न से जवाब विविधता तक रूट करते हैं। ऊपर एक नोड रखें, या पहले संग्रह आयात करें ताकि मेल खाने को डेटा हो।',
  'guide.patterns.title': 'अभी कोई पैटर्न नहीं।',
  'guide.patterns.body':
    'पैटर्न उदाहरण संदेशों से निकाले जाते हैं। प्रदाता जोड़ें या संग्रह आयात करें, फिर यहाँ लौटकर अनुमानक को कुछ उदाहरण दें।',
  'guide.replies.title': 'अभी कोई जवाब विविधता समूह नहीं।',
  'guide.replies.body':
    'जवाब समूह आपके पिछले बाहर जाने वाले संदेशों से धुँधली समानता द्वारा निकाले जाते हैं। अपनी जवाब लाइब्रेरी भरने के लिए चैट-सक्षम प्रदाता जोड़ें।',
  'guide.facts.title': 'अभी कोई तथ्य नहीं निकाले।',
  'guide.facts.body':
    'तथ्य आपके पैटर्न द्वारा संदेशों में पाए गए "प्रश्न -> उत्तर" युग्म हैं। कैप्चर समूह वाला पैटर्न जोड़ें, या डेटा एकत्रित करना शुरू करने के लिए चैट प्रदाता जोड़ें।',
  'guide.audience.title': 'अपना पहला श्रोता बनाएँ।',
  'guide.audience.body':
    'AND/OR/NOT तथा network:, chat:, sender:, kind:, fact: जैसे आयामों से संपर्कों को क्रॉस-रेफरेंस करें। फ़िल्टर करने के लिए कम से कम एक प्रदाता जोड़ें।',
  'guide.broadcast.title': 'अभी कोई प्रसारण लक्ष्य नहीं।',
  'guide.broadcast.body':
    'प्रसारण समान संदेश हर जुड़े फ़ीड पर पोस्ट करते हैं। लक्ष्य चेकबॉक्स सक्षम करने के लिए नीचे सार्वजनिक-पोस्टिंग प्रदाता जोड़ें।',
  'guide.outreach.title': 'अभी कोई पहुँच लक्ष्य नहीं।',
  'guide.outreach.body':
    'सामूहिक-व्यक्तिगत पहुँच श्रोता क्वेरी के हर संपर्क को टेम्प्लेटयुक्त संदेश 1:1 भेजती है। पहुँच सक्षम करने के लिए चैट-सक्षम प्रदाता जोड़ें।',
  'guide.profile.title': 'अभी कोई प्रोफ़ाइल नहीं।',
  'guide.profile.body':
    'अपनी प्रोफ़ाइल और रिज़्यूमे यहाँ संपादित करें; सहेजने पर हर जुड़े प्रदाता तक पुश हो जाते हैं। कम से कम एक प्रदाता जोड़ें ताकि सिंक लिफ़ाफ़े का गंतव्य हो।',
  'guide.backup.title': 'अभी कोई बैकअप संग्रह नहीं।',
  'guide.backup.body':
    'बैकअप लोकल स्टोर के एन्क्रिप्टेड-एट-रेस्ट संग्रह हैं। ऊपर पासफ़्रेज़ सेट करें, सहेजने योग्य डेटा होने पर "बैकअप बनाएँ" क्लिक करें, या डिस्क पर बैकअप रखने के लिए पहले लोकल सर्वर शुरू करें।',
  'guide.status.title': 'स्थिति केवल लोकल स्टोर दिखा रही है।',
  'guide.status.body':
    'स्थिति फ़ील्ड तब दिखती हैं जब सर्वर पहुँच में हो। नीचे लोकल सर्वर शुरू करें, या पूरी तरह ऑफ़लाइन काम करते रहें — SPA सीधे ब्राउज़र स्टोर में लिखता है।',
  'guide.connections.title': 'कनेक्शन',
  'guide.connections.body':
    'बाहरी सेवाएँ इस अलग स्क्रीन पर रहती हैं। प्रदाता चुनें ताकि उसके क्रेडेंशियल दर्ज करें, संग्रह अपलोड करें और लाइव API जाँचें। सेटिंग्स में केवल ऐप-स्तरीय वरीयताएँ रहती हैं।',
  'guide.settings.title': 'सेटिंग्स',
  'guide.settings.body':
    'प्रदाता कनेक्शन, क्रेडेंशियल और संग्रह आयात यहाँ रहते हैं। नीचे की सूची हर सूचीबद्ध प्रदाता दिखाती है; एक चुनें ताकि उसके क्रेडेंशियल दर्ज करें, संग्रह अपलोड करें और लाइव API जाँचें।',
  'connections.title': 'कनेक्शन',
  'connections.intro':
    'क्रेडेंशियल दर्ज करने, संग्रह आयात करने और लाइव API जाँचने के लिए प्रदाता चुनें।',
  'connections.state.connected': 'जुड़ा',
  'connections.state.notConnected': 'जुड़ा नहीं',
  'connections.state.actionRequired': 'कार्रवाई आवश्यक',
  'connections.openDetail': 'सेट अप',
  'connections.back': 'कनेक्शन पर वापस',
  'connections.email.label': 'ईमेल',
  'connections.email.archive.title': '.eml या mbox मेल निर्यात आयात करें',
  'connections.email.archive.hint':
    'अपने प्रदाता से मेल को .eml फ़ाइल या mbox संग्रह के रूप में निर्यात करें (Gmail Takeout mbox फ़ाइल सहित)। फ़ाइल को आयात बॉक्स में डालें और स्रोत "email" चुनें।',
  'connections.email.archive.fileHint': '*.eml, *.mbox',
  'connections.email.api.title': 'ईमेल API और प्रोटोकॉल जोड़ें',
  'connections.email.api.hint':
    'जब CORS अनुमति दे, सीधे ब्राउज़र से JMAP, Gmail API या Microsoft Graph का उपयोग करें। IMAP, POP3 और SMTP को लोकल सर्वर चाहिए क्योंकि ब्राउज़र कच्चे TCP/TLS मेल सॉकेट नहीं खोल सकते।',
  'connections.email.fields.token.label': 'OAuth एक्सेस टोकन',
  'connections.email.errorHints.401':
    'टोकन अस्वीकृत। gmail.readonly स्कोप के साथ नया OAuth टोकन जारी करें।',
  'connections.email.errorHints.403':
    'अपर्याप्त स्कोप। gmail.readonly या jmap अनुमतियों के साथ टोकन फिर से जारी करें।',
  'connections.telegram.label': 'Telegram',
  'connections.telegram.archive.title': 'Telegram Desktop संग्रह आयात करें',
  'connections.telegram.archive.hint':
    'Telegram Desktop -> सेटिंग्स -> Advanced -> Export Telegram data। "Personal chats" + "JSON" चुनें और परिणामी result.json को नीचे आयात बॉक्स में डालें।',
  'connections.telegram.archive.fileHint': 'result.json',
  'connections.telegram.api.title': 'Telegram Bot API जोड़ें',
  'connections.telegram.api.hint':
    'Telegram में @BotFather से बात करें, /newbot चलाएँ, बॉट टोकन कॉपी करके "secret:telegram:bot-token" नाम के सीक्रेट के रूप में चिपकाएँ।',
  'connections.telegram.fields.token.label': 'बॉट टोकन',
  'connections.telegram.errorHints.401':
    'टोकन अस्वीकृत। @BotFather से नया टोकन माँगें या लीक हुए को रद्द करें।',
  'connections.telegram.errorHints.404':
    'एंडपॉइंट नहीं मिला। बॉट टोकन में रिक्त स्थान न होने की पुष्टि करें।',
  'connections.vk.label': 'VK',
  'connections.vk.archive.title': 'VK संवाद संग्रह आयात करें',
  'connections.vk.archive.hint':
    'https://vk.com/data_protection खोलें, अपना संग्रह माँगें, अनज़िप करें और "messages" JSON फ़ाइलें लोड करें।',
  'connections.vk.archive.fileHint': 'messages*.json',
  'connections.vk.api.title': 'VK API जोड़ें',
  'connections.vk.api.hint':
    'https://vk.com/apps?act=manage पर Standalone एप्लिकेशन बनाएँ और messages स्कोप वाला एक्सेस टोकन माँगें। उसे "secret:vk:token" के रूप में चिपकाएँ।',
  'connections.vk.fields.token.label': 'एक्सेस टोकन',
  'connections.vk.errorHints.401':
    'एक्सेस टोकन समाप्त। id.vk.com पर implicit प्रवाह दोबारा चलाएँ।',
  'connections.x.label': 'X (Twitter)',
  'connections.x.archive.title': 'X डेटा संग्रह आयात करें',
  'connections.x.archive.hint':
    'सेटिंग्स -> आपका खाता -> अपने डेटा का संग्रह डाउनलोड करें। तैयार होने पर अनज़िप करें और data/ के अंदर ट्वीट व डायरेक्ट मेसेज JSON फ़ाइलें चुनें।',
  'connections.x.archive.fileHint': 'tweets.js, direct-messages.js',
  'connections.x.api.title': 'X API v2 जोड़ें',
  'connections.x.api.hint':
    'https://developer.x.com/ पर ऐप बनाएँ, उपयोगकर्ता-संदर्भ बेयरर टोकन उत्पन्न करें और "secret:x:token" के रूप में चिपकाएँ।',
  'connections.x.fields.token.label': 'बेयरर टोकन',
  'connections.x.errorHints.401':
    'बेयरर टोकन अस्वीकृत। X डेवलपर पोर्टल में नया टोकन उत्पन्न करें।',
  'connections.x.errorHints.403': 'टोकन वैध है पर users.read स्कोप नहीं है।',
  'connections.whatsapp.label': 'WhatsApp',
  'connections.whatsapp.archive.title': 'WhatsApp चैट निर्यात आयात करें',
  'connections.whatsapp.archive.hint':
    'WhatsApp ऐप में, चैट खोलें -> ... -> अधिक -> चैट निर्यात (बिना मीडिया)। परिणामी "WhatsApp Chat with NAME.txt" को आयात बॉक्स में डालें।',
  'connections.whatsapp.archive.fileHint': 'WhatsApp Chat with *.txt',
  'connections.whatsapp.api.title': 'WhatsApp Cloud API जोड़ें',
  'connections.whatsapp.api.hint':
    'Meta for Developers ऐप बनाएँ, WhatsApp उत्पाद जोड़ें, अस्थायी या सिस्टम-यूज़र एक्सेस टोकन कॉपी करें और फ़ोन नंबर ID (WHATSAPP_PHONE_NUMBER_ID) नोट करें।',
  'connections.whatsapp.fields.token.label': 'एक्सेस टोकन',
  'connections.whatsapp.fields.phoneNumberId.label': 'फ़ोन नंबर ID',
  'connections.whatsapp.errorHints.400':
    'Meta ने 400 लौटाया। एक्सेस टोकन और ऐप के Live मोड में होने की पुष्टि करें।',
  'connections.whatsapp.errorHints.401':
    'एक्सेस टोकन अस्वीकृत। Meta Business में नया सिस्टम-यूज़र टोकन उत्पन्न करें।',
  'connections.facebook.label': 'Facebook',
  'connections.facebook.archive.title': 'Facebook डाउनलोड आयात करें',
  'connections.facebook.archive.hint':
    'सेटिंग्स और गोपनीयता -> सेटिंग्स -> आपकी जानकारी -> अपनी जानकारी डाउनलोड करें। "JSON" चुनें और जो श्रेणियाँ चाहिए (संदेश, पोस्ट) चुनें।',
  'connections.facebook.archive.fileHint': 'messages_*.json, posts_*.json',
  'connections.facebook.api.title': 'Facebook Graph API जोड़ें',
  'connections.facebook.api.hint':
    'अपने Meta for Developers ऐप में Facebook पेज जोड़ें, पेज एक्सेस टोकन (FACEBOOK_PAGE_ACCESS_TOKEN) उत्पन्न करें और पेज ID (FACEBOOK_PAGE_ID) नोट करें।',
  'connections.facebook.fields.token.label': 'पेज एक्सेस टोकन',
  'connections.facebook.fields.pageId.label': 'पेज ID',
  'connections.facebook.errorHints.400':
    'Graph ने 400 लौटाया। पुष्टि करें कि एक्सेस टोकन समाप्त नहीं हुआ (पेज टोकन अल्पकालिक होते हैं)।',
  'connections.facebook.errorHints.401':
    'एक्सेस टोकन अस्वीकृत। Graph API Explorer में नया पेज टोकन फिर से जारी करें।',
  'connections.linkedin.label': 'LinkedIn',
  'connections.linkedin.archive.title': 'LinkedIn डेटा निर्यात आयात करें',
  'connections.linkedin.archive.hint':
    'सेटिंग्स और गोपनीयता -> डेटा गोपनीयता -> अपने डेटा की प्रति प्राप्त करें। "विशिष्ट कुछ चाहिए?" चुनें और "Messages" + "Posts" माँगें।',
  'connections.linkedin.archive.fileHint': 'messages.csv, Shares.csv',
  'connections.linkedin.api.title': 'LinkedIn REST API जोड़ें',
  'connections.linkedin.api.hint':
    'https://www.linkedin.com/developers/ पर ऐप बनाएँ, "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" उत्पाद माँगें, और OAuth2 एक्सेस टोकन तथा अपना author URN (LINKEDIN_AUTHOR_URN) चिपकाएँ।',
  'connections.linkedin.fields.token.label': 'एक्सेस टोकन',
  'connections.linkedin.fields.authorUrn.label': 'लेखक URN',
  'connections.linkedin.errorHints.401':
    'OAuth2 एक्सेस टोकन अस्वीकृत। auth code प्रवाह दोबारा चलाएँ।',
  'connections.habr-career.label': 'career.habr.com',
  'connections.habr-career.archive.title':
    'career.habr.com आवेदन JSON आयात करें',
  'connections.habr-career.archive.hint':
    'career.habr.com पर अपना खाता खोलें, "Отклики на вакансии" पर जाएँ और JSON में निर्यात क्रिया का उपयोग करें। फ़ाइल सहेजें और SPA में लोड करें।',
  'connections.habr-career.archive.fileHint': 'applications.json',
  'connections.habr-career.api.title': 'career.habr.com निजी API जोड़ें',
  'connections.habr-career.api.hint':
    'career.habr.com -> Settings -> Tokens से व्यक्तिगत एक्सेस टोकन उत्पन्न करें और "secret:habr-career:token" के रूप में चिपकाएँ।',
  'connections.habr-career.fields.token.label': 'व्यक्तिगत एक्सेस टोकन',
  'connections.habr-career.errorHints.401':
    'career.habr.com ने टोकन अस्वीकृत किया। Settings -> Tokens से फिर से जारी करें।',
  'connections.hh.label': 'hh.ru',
  'connections.hh.archive.title': 'hh.ru वार्तालाप संग्रह आयात करें',
  'connections.hh.archive.hint':
    'https://hh.ru/applicant/negotiations खोलें, JSON निर्यात का उपयोग करें, फ़ाइल सहेजें और यहाँ लोड करें।',
  'connections.hh.archive.fileHint': 'negotiations.json',
  'connections.hh.api.title': 'hh.ru API जोड़ें',
  'connections.hh.api.hint':
    'https://dev.hh.ru/ पर ऐप पंजीकृत करें, OAuth2 client-credentials/authorisation-code प्रवाह चलाएँ और एक्सेस टोकन को "secret:hh:token" के रूप में चिपकाएँ।',
  'connections.hh.fields.token.label': 'एक्सेस टोकन',
  'connections.hh.errorHints.401':
    'hh.ru ने टोकन अस्वीकृत किया। https://dev.hh.ru/ पर अपने ऐप के माध्यम से रिफ़्रेश करें।',
  'connections.github.label': 'GitHub',
  'connections.github.archive.title': 'gh api JSON डंप आयात करें',
  'connections.github.archive.hint':
    '`gh api` से JSON डंप सहेजें (जैसे `gh api repos/OWNER/REPO/issues --paginate > issues.json`) या लिफ़ाफ़ा `{ issues, comments, pulls, reviews, reviewComments, discussions }` और फ़ाइल यहाँ डालें।',
  'connections.github.archive.fileHint':
    'issues.json, pulls.json, comments.json, envelope.json',
  'connections.github.api.title': 'GitHub REST API जोड़ें',
  'connections.github.api.hint':
    'https://github.com/settings/personal-access-tokens पर fine-grained personal access token बनाएँ; issues, pull requests और जिन रिपॉज़िटरी को क्लोन करना है उन पर पढ़ने की अनुमति दें, और टिप्पणी पोस्ट करनी हो तो issues पर लिखने की अनुमति भी दें। "secret:github:access-token" के रूप में चिपकाएँ।',
  'connections.github.fields.token.label': 'व्यक्तिगत एक्सेस टोकन',
  'connections.github.errorHints.401':
    'टोकन अस्वीकृत। https://github.com/settings/personal-access-tokens पर नया personal access token जारी करें।',
  'connections.github.errorHints.403':
    'GitHub ने 403 लौटाया। टोकन में स्कोप कमज़ोर हो सकते हैं (issues:read, pull_requests:read, contents:read) या द्वितीयक रेट लिमिट लग सकती है।',
  'connections.github.errorHints.404':
    'रिपॉज़िटरी नहीं मिली या दिखाई नहीं देती। पुष्टि करें कि टोकन को लक्ष्य owner/repo पर पहुँच है।',
  'connections.upwork.label': 'Upwork',
  'connections.upwork.archive.title': 'Upwork डेटा निर्यात आयात करें',
  'connections.upwork.archive.hint':
    'Upwork पर लेन-देन इतिहास (Reports → Transaction History → Download CSV), प्रति-कार्य संग्रह और आंतरिक एडमिन लिफ़ाफ़े (`{ jobs, contracts, rooms, messages, transactions }`) निर्यात किए जा सकते हैं। परिणामी CSV या JSON फ़ाइल यहाँ डालें और स्रोत "upwork" चुनें।',
  'connections.upwork.archive.fileHint':
    'transactions.csv, jobs.json, contracts.json, envelope.json',
  'connections.upwork.api.title': 'Upwork GraphQL API जोड़ें',
  'connections.upwork.api.hint':
    'https://www.upwork.com/services/api/apply पर OAuth2 ऐप पंजीकृत करें, 3-legged authorisation-code प्रवाह चलाएँ और एक्सेस टोकन को "secret:upwork:access-token" के रूप में चिपकाएँ। वैकल्पिक रिफ़्रेश टोकन "secret:upwork:refresh-token" पर रखें।',
  'connections.upwork.fields.token.label': 'OAuth एक्सेस टोकन',
  'connections.upwork.fields.refreshToken.label': 'रिफ़्रेश टोकन',
  'connections.upwork.fields.organizationId.label': 'संगठन (टेनेंट) ID',
  'connections.upwork.errorHints.401':
    'Upwork ने एक्सेस टोकन अस्वीकृत किया। पंजीकृत OAuth2 ऐप के माध्यम से रिफ़्रेश करें या authorisation-code प्रवाह दोबारा चलाएँ।',
  'connections.upwork.errorHints.403':
    'टोकन वैध पर स्कोप कम। आवश्यक messaging, search और reports स्कोप के साथ फिर से जारी करें।',
  'connections.upwork.errorHints.429':
    'Upwork ने रेट-लिमिट लगाया। बैक ऑफ़ करें; API ToS के अनुसार एडाप्टर 24 घंटे तक परिणाम कैश रखता है।',
  'connections.peopleperhour.label': 'PeoplePerHour',
  'connections.peopleperhour.archive.title':
    'PeoplePerHour डेटा निर्यात आयात करें',
  'connections.peopleperhour.archive.hint':
    'PeoplePerHour खाता-स्तरीय निर्यात GDPR डेटा-विषय एक्सेस अनुरोध बंडल (Settings → Privacy → Request my data) और Earnings CSV (Reports → Earnings → Export) के माध्यम से देता है। परिणामी JSON या CSV को यहाँ डालें और स्रोत "peopleperhour" चुनें।',
  'connections.peopleperhour.archive.fileHint':
    'projects.json, proposals.json, workstreams.json, earnings.csv',
  'connections.peopleperhour.api.title': 'PeoplePerHour REST API जोड़ें',
  'connections.peopleperhour.api.hint':
    'PeoplePerHour डेवलपर पोर्टल (https://www.peopleperhour.com/site/developers) पर OAuth2 ऐप पंजीकृत करें, authorisation-code प्रवाह चलाएँ और एक्सेस टोकन को "secret:peopleperhour:access-token" के रूप में चिपकाएँ। वैकल्पिक रिफ़्रेश टोकन "secret:peopleperhour:refresh-token" पर रखें। PPH API ToS के अनुसार एडाप्टर हर प्रतिक्रिया को 24 घंटे कैश रखता है।',
  'connections.peopleperhour.fields.accessToken.label': 'OAuth एक्सेस टोकन',
  'connections.peopleperhour.fields.refreshToken.label': 'रिफ़्रेश टोकन',
  'connections.peopleperhour.errorHints.401':
    'PeoplePerHour ने एक्सेस टोकन अस्वीकृत किया। पंजीकृत OAuth2 ऐप के माध्यम से रिफ़्रेश करें या authorisation-code प्रवाह दोबारा चलाएँ।',
  'connections.peopleperhour.errorHints.403':
    'टोकन वैध पर स्कोप कम। आवश्यक projects, proposals और workstreams स्कोप के साथ फिर से जारी करें।',
  'connections.peopleperhour.errorHints.429':
    'PeoplePerHour ने रेट-लिमिट लगाया। बैक ऑफ़ करें; API ToS के अनुसार एडाप्टर 24 घंटे तक परिणाम कैश रखता है।',
  'connections.superjob.label': 'superjob.ru',
  'connections.superjob.archive.title': 'SuperJob प्रतिक्रिया संग्रह आयात करें',
  'connections.superjob.archive.hint':
    'superjob.ru पर अपना आवेदक कैबिनेट खोलें -> "Отклики" और JSON निर्यात क्रिया का उपयोग करें। फ़ाइल सहेजें और यहाँ लोड करें।',
  'connections.superjob.archive.fileHint': 'responses.json',
  'connections.superjob.api.title': 'SuperJob API जोड़ें',
  'connections.superjob.api.hint':
    'https://api.superjob.ru/register/ पर ऐप पंजीकृत करें, गुप्त कुंजी को SUPERJOB_APP_ID के रूप में और एक्सेस टोकन को "secret:superjob:token" के रूप में चिपकाएँ।',
  'connections.superjob.fields.appId.label': 'App ID (X-Api-App-Id)',
  'connections.superjob.fields.token.label': 'एक्सेस टोकन',
  'connections.superjob.errorHints.401':
    'SuperJob ने App ID अस्वीकृत किया। आवेदक कैबिनेट में फिर से जाँचें।',
  'tutorial.button': 'ट्यूटोरियल',
  'tutorial.skip': 'चरण छोड़ें',
  'tutorial.next': 'अगला',
  'tutorial.finish': 'समाप्त',
  'tutorial.off': 'ट्यूटोरियल बंद करें',
  'tutorial.progress': 'चरण {current} / {total}',
  'tutorial.welcome.title': 'meta-sovereign में आपका स्वागत है',
  'tutorial.welcome.body':
    'यह आपका लोकल-फर्स्ट व्यक्तिगत CRM और एकीकृत इनबॉक्स है। जब तक आप इसे किसी सर्वर से न जोड़ें, कुछ भी आपके ब्राउज़र से बाहर नहीं जाता। मुख्य प्रवाह देखने के लिए "अगला" दबाएँ।',
  'tutorial.chat.title': 'चैट — आपका एकीकृत इनबॉक्स',
  'tutorial.chat.body':
    'हर जुड़ी सेवा की हर चैट यहीं दिखती है। यदि कोई खंड खाली है, तो वह बताता है कि प्रदाता कैसे जोड़ें — टूर के बाद "चैट" टैब खोलें।',
  'tutorial.contacts.title': 'संपर्क — हर व्यक्ति के लिए एक पंक्ति',
  'tutorial.contacts.body':
    'संपर्क सभी नेटवर्क में मिलाकर दिखाए जाते हैं। सूची भरने के लिए कम से कम एक प्रदाता जोड़ें।',
  'tutorial.automation.title': 'स्वचालन — पैटर्न से जवाब तक',
  'tutorial.automation.body':
    'नोड ग्राफ़ बनाएँ जो आने वाले संदेशों को रेगेक्स पैटर्न से जवाब विविधता तक रूट करें। पैटर्न और जवाब समूह इस ग्राफ़ संपादक को संचालित करते हैं।',
  'tutorial.backup.title': 'बैकअप — विश्राम के दौरान एन्क्रिप्टेड',
  'tutorial.backup.body':
    'बैकअप पासफ़्रेज़ से लोकल स्टोर को एन्क्रिप्ट करते हैं। यदि आपने लोकल सर्वर शुरू किया है, तो संग्रह उसके डेटा निर्देशिका के पास रहता है।',
  'tutorial.connections.title': 'पहले एक सेवा जोड़ें',
  'tutorial.connections.body':
    'प्रदाता चुनने के लिए कनेक्शन पर टैप करें। हर प्रदाता ऐप के अंदर ही क्रेडेंशियल पाने के चरण दिखाता है — बाहरी निर्देशों की ज़रूरत नहीं।',
  'tutorial.connectionDetail.title': 'प्रदाता-विशिष्ट चरणों का पालन करें',
  'tutorial.connectionDetail.body':
    'प्रदाता स्क्रीन पर क्रेडेंशियल पाने के सभी चरण दिखते हैं, साथ ही कनेक्शन काम कर रहा है इसकी पुष्टि के लिए लाइव API जाँच भी।',
};
