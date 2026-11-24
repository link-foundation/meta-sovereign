import { vkGreetLocale } from './vk-greet.js';
const keys = [
  'greeting',
  'questions',
  'audio',
  'run',
  'prompt',
  'delivered',
  'partial',
  'manualReview',
  'noHistory',
  'audioMissing',
  'selectedAudio',
  'stepSent',
  'stepPending',
  'idle',
  'hint',
];
const words = {
  en: [
    'First greeting (up to 500 characters)',
    'Question variants (one per line, up to 20)',
    'Native VK audio ID (audioOWNER_ID_AUDIO_ID)',
    'Confirm remaining reviewed steps',
    'Send ordered messages',
    'All messages acknowledged',
    'Some messages acknowledged; review remaining steps',
    'Partial delivery requires manual review',
    'Conversation history is empty',
    'Choose an audio attachment first',
    'Selected VK audio: {id}',
    'Acknowledged message {id}',
    'Awaiting confirmation',
    'No conversation sequence attempted.',
    'Scheduling starts off. Review a current friend with nonempty dormant history and write permission. Send the greeting, optional audio, then the question in order, 15 seconds apart. Unread, protected and uncertain conversations are held. Confirmed steps are retained; definite partial delivery needs a new review. Unknown delivery is never replayed.',
  ],
  ru: [
    'Первое приветствие (до 500 символов)',
    'Варианты вопроса (по строке, до 20)',
    'ID аудио ВКонтакте (audioOWNER_ID_AUDIO_ID)',
    'Подтвердить оставшиеся просмотренные шаги',
    'Отправить сообщения по порядку',
    'Все сообщения подтверждены',
    'Часть сообщений подтверждена; проверьте остальные шаги',
    'Частичная отправка требует ручной проверки',
    'История беседы пуста',
    'Сначала выберите аудиозапись',
    'Выбрана аудиозапись ВКонтакте: {id}',
    'Подтверждено сообщение {id}',
    'Ожидает подтверждения',
    'Последовательности ещё не отправлялись.',
    'Расписание выключено. Проверьте текущую дружбу, непустую давнюю историю и разрешение писать. Приветствие, необязательное аудио и вопрос отправляются по порядку с паузой 15 секунд. Непрочитанные, защищённые и неопределённые беседы исключены. Подтверждённые шаги сохраняются; частичная отправка требует новой проверки. Неизвестная отправка не повторяется.',
  ],
  hi: [
    'पहला अभिवादन (500 अक्षर तक)',
    'प्रश्न विकल्प (हर पंक्ति पर एक, अधिकतम 20)',
    'मूल VK ऑडियो ID (audioOWNER_ID_AUDIO_ID)',
    'शेष समीक्षित चरणों की पुष्टि करें',
    'क्रम में संदेश भेजें',
    'सभी संदेशों की पुष्टि हुई',
    'कुछ संदेश पुष्ट; शेष चरणों की समीक्षा करें',
    'आंशिक भेजने के लिए मैन्युअल समीक्षा ज़रूरी',
    'बातचीत की हिस्ट्री खाली है',
    'पहले ऑडियो अटैचमेंट चुनें',
    'चुना VK ऑडियो: {id}',
    'पुष्ट संदेश {id}',
    'पुष्टि का इंतज़ार',
    'बातचीत क्रम अभी नहीं चलाया गया।',
    'शेड्यूल बंद है। वर्तमान मित्र, पुरानी गैरखाली हिस्ट्री और लिखने की अनुमति जाँचें। अभिवादन, वैकल्पिक ऑडियो और प्रश्न क्रम से 15 सेकंड के अंतर पर जाते हैं। अपठित, सुरक्षित और अनिश्चित बातचीत रोकी जाती है। पुष्ट चरण सहेजे जाते हैं; आंशिक भेजने को नई समीक्षा चाहिए। अज्ञात भेजना दोहराया नहीं जाता।',
  ],
  zh: [
    '第一条问候（最多 500 字符）',
    '问题选项（每行一个，最多 20 个）',
    'VK 原生音频 ID（audioOWNER_ID_AUDIO_ID）',
    '确认剩余已审核步骤',
    '按顺序发送消息',
    '所有消息已确认',
    '部分消息已确认；请审核剩余步骤',
    '部分发送需要手动审核',
    '对话历史为空',
    '请先选择音频附件',
    '所选 VK 音频：{id}',
    '已确认消息 {id}',
    '等待确认',
    '尚未尝试对话序列。',
    '自动计划默认关闭。审核当前好友、非空且久未联系的历史及发送权限。按问候、可选音频、问题的顺序发送，每步间隔 15 秒。未读、受保护及结果未知的对话暂缓。保留已确认步骤；部分发送需要重新审核。结果未知时绝不重发。',
  ],
};
const titles = {
  en: ['VK topic questions', 'VK offers of help', 'VK music questions'],
  ru: [
    'Вопросы о теме ВКонтакте',
    'Предложения помощи ВКонтакте',
    'Вопросы о музыке ВКонтакте',
  ],
  hi: ['VK विषय प्रश्न', 'VK मदद की पेशकश', 'VK संगीत प्रश्न'],
  zh: ['VK 话题提问', 'VK 提供帮助', 'VK 音乐提问'],
};
export const vkReengageLocale = (language) => {
  const shared = {
    ...Object.fromEntries(
      Object.entries(vkGreetLocale(language)).map(([key, value]) => [
        key.slice(8),
        value,
      ])
    ),
    ...Object.fromEntries(
      keys.map((key, index) => [key, words[language][index]])
    ),
  };
  return Object.fromEntries([
    ...Object.entries(shared).map(([key, value]) => [
      `vkReengage.${key}`,
      value,
    ]),
    ...['Topic', 'Help', 'Music'].flatMap((kind, index) =>
      Object.entries({ ...shared, title: titles[language][index] }).map(
        ([key, value]) => [`vk${kind}.${key}`, value]
      )
    ),
  ]);
};
