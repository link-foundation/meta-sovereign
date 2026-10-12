// Issue #31 / PR #34: adds translated preset automation names and
// descriptions (automations.presets.<id>.*) to every locale. Run once
// from js/; kept to show where the strings came from.
import fs from 'node:fs';
const K = {
  en: [
    [
      'reengage-dormant',
      'Say hi to contacts silent for 90 days',
      'Personal chats with no messages for 90 days get a hello asking whether they or their friends need help with automation.',
    ],
    [
      'job-search',
      'Ask about open positions',
      'Tell contacts you are open to new roles; pair with an audience of colleagues or recruiters.',
    ],
    [
      'contract-search',
      'Offer contract work',
      'Let contacts know you take contract projects; intersect lists to reach exactly the right people.',
    ],
    [
      'greet-back',
      'Greet back',
      'When someone says hi in a personal chat, draft a greeting in the right form (at most once a day).',
    ],
  ],
  ru: [
    [
      'reengage-dormant',
      'Привет тем, кто молчит 90 дней',
      'Личные чаты без сообщений 90 дней получают приветствие с вопросом, не нужна ли им или их друзьям помощь с автоматизацией.',
    ],
    [
      'job-search',
      'Спросить об открытых вакансиях',
      'Расскажите контактам, что вы открыты к новым ролям; сочетайте с аудиторией коллег или рекрутеров.',
    ],
    [
      'contract-search',
      'Предложить работу по контракту',
      'Сообщите контактам, что берёте проекты на контракт; пересекайте списки, чтобы написать именно тем, кому нужно.',
    ],
    [
      'greet-back',
      'Ответить на приветствие',
      'Когда кто-то здоровается в личном чате, подготовить приветствие в нужной форме (не чаще раза в день).',
    ],
  ],
  hi: [
    [
      'reengage-dormant',
      '90 दिनों से चुप संपर्कों को नमस्ते कहें',
      'जिन निजी चैट में 90 दिनों से कोई संदेश नहीं है, उन्हें नमस्ते भेजा जाता है और पूछा जाता है कि क्या उन्हें या उनके दोस्तों को ऑटोमेशन में मदद चाहिए।',
    ],
    [
      'job-search',
      'खुली नौकरियों के बारे में पूछें',
      'संपर्कों को बताएं कि आप नई भूमिकाओं के लिए तैयार हैं; सहकर्मियों या भर्तीकर्ताओं के दर्शकों के साथ इस्तेमाल करें।',
    ],
    [
      'contract-search',
      'अनुबंध पर काम की पेशकश करें',
      'संपर्कों को बताएं कि आप अनुबंध पर प्रोजेक्ट लेते हैं; सही लोगों तक पहुँचने के लिए सूचियों का प्रतिच्छेदन करें।',
    ],
    [
      'greet-back',
      'नमस्ते का जवाब दें',
      'जब कोई निजी चैट में नमस्ते कहे, तो सही रूप में अभिवादन का ड्राफ़्ट बनाएं (दिन में अधिकतम एक बार)।',
    ],
  ],
  zh: [
    [
      'reengage-dormant',
      '问候沉默 90 天的联系人',
      '90 天没有消息的私聊会收到一条问候，询问对方或其朋友是否需要自动化方面的帮助。',
    ],
    [
      'job-search',
      '询问空缺职位',
      '告诉联系人你在寻找新职位；可搭配同事或招聘人员的受众使用。',
    ],
    [
      'contract-search',
      '承接合同工作',
      '让联系人知道你承接合同项目；对列表取交集，精准联系合适的人。',
    ],
    [
      'greet-back',
      '回复问候',
      '有人在私聊中打招呼时，按正确的称呼形式起草问候（每天最多一次）。',
    ],
  ],
};
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
for (const [loc, rows] of Object.entries(K)) {
  const file = `src/web/locales/${loc}.js`;
  let src = fs.readFileSync(file, 'utf8');
  const anchor = /\n {2}'automations\.off': [^\n]*\n/;
  const m = src.match(anchor);
  if (!m) {
    throw new Error(loc);
  }
  const lines = rows.flatMap(([id, n, d]) => [
    `  'automations.presets.${id}.name': ${q(n)},`,
    `  'automations.presets.${id}.description': ${q(d)},`,
  ]);
  src = src.replace(anchor, `${m[0]}${lines.join('\n')}\n`);
  fs.writeFileSync(file, src);
}
