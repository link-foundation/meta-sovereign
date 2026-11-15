// Titles are shared by the preset, action selector and incoming recognizer.
const words = {
  en: [
    [
      'Ask whether previously acquainted',
      'Review a question after exactly two recorded personal VK greetings: yours, then theirs.',
    ],
    [
      'Reply to well-being questions',
      'Review your configurable reply to a complete personal VK well-being question in Russian or English.',
    ],
    [
      'Reply to purpose questions',
      'Review your configurable reply when a personal VK contact asks whether you wanted something.',
    ],
    [
      'Clarify an unspecified question',
      'Review a clarification of a bare question only after the adjacent outgoing personal VK turn.',
    ],
    'The latest message must be incoming in a personal VK chat.',
    'The complete incoming message does not match this reply.',
    'The recorded conversation must contain the required adjacent outgoing turn. The first-exchange action requires exactly two greetings.',
  ],
  ru: [
    [
      'Спросить о предыдущем общении',
      'Предпросмотр вопроса после ровно двух записанных личных приветствий ВКонтакте: вашего, затем собеседника.',
    ],
    [
      'Ответить на вопрос о делах',
      'Предпросмотр настраиваемого ответа на полный личный вопрос о делах ВКонтакте на русском или английском.',
    ],
    [
      'Ответить на вопрос о цели',
      'Предпросмотр настраиваемого ответа, когда личный собеседник ВКонтакте спрашивает, чего вы хотели.',
    ],
    [
      'Уточнить неопределённый вопрос',
      'Предпросмотр уточнения короткого вопроса только после соседнего исходящего сообщения в личном чате ВКонтакте.',
    ],
    'Последнее сообщение должно быть входящим в личном чате ВКонтакте.',
    'Полный текст входящего сообщения не соответствует этому ответу.',
    'В записанном диалоге требуется соседнее исходящее сообщение. Для первого обмена нужны ровно два приветствия.',
  ],
  hi: [
    [
      'पिछली बातचीत के बारे में पूछें',
      'निजी VK चैट में ठीक दो दर्ज अभिवादनों के बाद प्रश्न की समीक्षा: पहले आपका, फिर उनका।',
    ],
    [
      'हालचाल के प्रश्नों का उत्तर',
      'रूसी या अंग्रेज़ी के पूरे निजी VK हालचाल प्रश्न के लिए अपने उत्तर की समीक्षा करें।',
    ],
    [
      'उद्देश्य के प्रश्नों का उत्तर',
      'जब निजी VK संपर्क पूछे कि आप क्या चाहते थे, अपने उत्तर की समीक्षा करें।',
    ],
    [
      'अस्पष्ट प्रश्न स्पष्ट करें',
      'निजी VK चैट में ठीक पिछले भेजे गए संदेश के बाद ही संक्षिप्त प्रश्न का स्पष्टीकरण देखें।',
    ],
    'नवीनतम संदेश निजी VK चैट में आने वाला होना चाहिए।',
    'पूरा आने वाला संदेश इस उत्तर से मेल नहीं खाता।',
    'दर्ज बातचीत में ठीक पिछला भेजा गया संदेश आवश्यक है। पहले आदान-प्रदान के लिए ठीक दो अभिवादन आवश्यक हैं।',
  ],
  zh: [
    [
      '询问是否曾交谈',
      '仅在记录恰好包含两条 VK 私聊问候时预览问题：先是您的问候，然后是对方的。',
    ],
    ['回复近况问题', '为完整的俄语或英语 VK 私聊近况问题预览您配置的回复。'],
    ['回复目的问题', '当 VK 私聊联系人询问您想做什么时，预览您配置的回复。'],
    [
      '澄清不明确的问题',
      '仅在紧邻的 VK 私聊发出消息之后，预览对简短问题的澄清。',
    ],
    '最新消息必须是 VK 私聊中的收到消息。',
    '完整的收到消息不符合此回复。',
    '记录的会话必须包含紧邻的发出消息。首次交流操作要求恰好两条问候。',
  ],
};
const kinds = ['first-exchange', 'wellbeing', 'purpose', 'clarification'];
export const contextualReplyLocale = (language) =>
  Object.fromEntries(
    kinds.flatMap((kind, index) => [
      [`automations.presets.${kind}.name`, words[language][index][0]],
      [`automations.presets.${kind}.description`, words[language][index][1]],
      [`questions.kind.reply-${kind}`, words[language][index][0]],
      [`gratitude.recognizer.${kind}`, words[language][index][0]],
      [`automations.reason.${kind}-incoming-required`, words[language][4]],
      [`automations.reason.${kind}-question-required`, words[language][5]],
      [`automations.reason.${kind}-context-required`, words[language][6]],
    ])
  );
