const keys = [
  'title',
  'summary',
  'initial',
  'initialUnknown',
  'period',
  'undated',
  'stale',
  'cached',
];
const words = {
  en: [
    'Accepted VK friends',
    'Account {id}: {count} accepted',
    'Initial observed friends: {count}',
    'Initial friend count was not recorded.',
    'UTC · Month {month}: {monthly} · Week from {week}: {weekly}',
    '{count} older receipts have no confirmed date and appear only in the total.',
    'Showing the last saved counts; reconnecting…',
    'Saved counts on this device',
  ],
  ru: [
    'Принятые друзья VK',
    'Аккаунт {id}: принято {count}',
    'Первоначально наблюдалось друзей: {count}',
    'Первоначальное число друзей не записано.',
    'UTC · Месяц {month}: {monthly} · Неделя с {week}: {weekly}',
    'У старых подтверждений ({count}) нет точной даты; они учтены только в общем числе.',
    'Показаны последние сохранённые данные; подключение…',
    'Сохранённые данные этого устройства',
  ],
  hi: [
    'स्वीकृत VK मित्र',
    'खाता {id}: {count} स्वीकृत',
    'शुरू में देखे गए मित्र: {count}',
    'मित्रों की शुरुआती संख्या दर्ज नहीं है।',
    'UTC · महीना {month}: {monthly} · {week} से सप्ताह: {weekly}',
    '{count} पुरानी पुष्टियों की तारीख नहीं है; वे केवल कुल में शामिल हैं।',
    'पिछली सहेजी गई संख्या दिखाई गई है; फिर जुड़ रहे हैं…',
    'इस डिवाइस पर सहेजी गई संख्या',
  ],
  zh: [
    '已接受的 VK 好友',
    '账号 {id}：已接受 {count} 人',
    '首次观察到的好友数：{count}',
    '尚未记录初始好友数。',
    'UTC · {month} 月：{monthly} · 自 {week} 起的一周：{weekly}',
    '{count} 条旧回执没有确认日期，仅计入总数。',
    '显示上次保存的数据；正在重新连接…',
    '此设备上保存的数据',
  ],
};
export const vkFriendStatsLocale = (language) =>
  Object.fromEntries(
    keys.map((key, i) => [`vkFriendStats.${key}`, words[language][i]])
  );
