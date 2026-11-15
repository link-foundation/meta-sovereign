import { vkFriendsLocale } from './vk-friends.js';
const keys = [
  'cleanupTitle',
  'cleanupHint',
  'outgoingTitle',
  'outgoingHint',
  'limit',
  'protected',
  'active',
  'limited',
  'remove',
  'cancel',
  'removed',
  'cancelled',
  'account',
  'run',
  'idle',
];
const words = {
  en: [
    'VK inactive friend cleanup',
    'Remove only banned or deleted friends. Priority IDs in any VK friend policy are always protected. Automatic cleanup starts off; a reviewed confirmation is required for each manual batch.',
    'VK outgoing request cancellation',
    'Cancel up to the configured number of scanned outgoing requests. Protected priority IDs are skipped without replacement. Automatic cancellation starts off. Zero disables effects. No messages are sent.',
    'Batch limit (0–10000; zero disables effects)',
    'Protected priority account',
    'Active account; kept',
    'Batch limit reached',
    'Remove inactive friend',
    'Cancel outgoing request',
    'Friend removed',
    'Outgoing request cancelled',
    'VK account {id}',
    'Confirm reviewed removals',
    'No maintenance batch attempted.',
  ],
  ru: [
    'Удаление неактивных друзей ВКонтакте',
    'Удаляются только заблокированные или удалённые друзья. Приоритетные ID во всех правилах друзей ВКонтакте всегда защищены. Автоочистка изначально выключена; каждый ручной пакет требует просмотра и подтверждения.',
    'Отмена исходящих заявок ВКонтакте',
    'Отменяется не более заданного числа просмотренных исходящих заявок. Приоритетные ID пропускаются без замены. Автоотмена изначально выключена. Ноль запрещает действия. Сообщения не отправляются.',
    'Предел за проход (0–10000; ноль запрещает действия)',
    'Защищённый приоритетный аккаунт',
    'Активный аккаунт сохранён',
    'Достигнут предел пакета',
    'Удалить неактивного друга',
    'Отменить исходящую заявку',
    'Друг удалён',
    'Исходящая заявка отменена',
    'Аккаунт ВКонтакте {id}',
    'Подтвердить просмотренные удаления',
    'Попыток обслуживания ещё не было.',
  ],
  hi: [
    'VK निष्क्रिय मित्र सफाई',
    'केवल प्रतिबंधित या हटाए गए मित्र हटाएँ। VK की किसी भी मित्र नीति में प्राथमिक ID हमेशा सुरक्षित हैं। स्वचालित सफाई शुरू में बंद है; हर मैनुअल बैच की समीक्षा और पुष्टि चाहिए।',
    'VK भेजे गए अनुरोध रद्द करें',
    'जाँचे गए भेजे अनुरोधों में से तय संख्या तक रद्द करें। प्राथमिक ID बिना प्रतिस्थापन छोड़ी जाती हैं। स्वचालित रद्द करना शुरू में बंद है। शून्य पर कार्रवाइयाँ बंद। संदेश नहीं भेजे जाते।',
    'बैच सीमा (0–10000; शून्य पर कार्रवाइयाँ बंद)',
    'सुरक्षित प्राथमिक खाता',
    'सक्रिय खाता रखा गया',
    'बैच सीमा पूरी',
    'निष्क्रिय मित्र हटाएँ',
    'भेजा गया अनुरोध रद्द करें',
    'मित्र हटाया गया',
    'भेजा अनुरोध रद्द हुआ',
    'VK खाता {id}',
    'समीक्षित हटाने की पुष्टि करें',
    'अभी कोई रखरखाव बैच नहीं चला।',
  ],
  zh: [
    'VK 停用好友清理',
    '仅删除被封禁或已注销的好友。所有 VK 好友规则中的优先 ID 始终受到保护。自动清理默认关闭；每次手动处理均须审核确认。',
    'VK 发出请求取消',
    '在配置的扫描数量内取消已发出的请求。跳过受保护的优先 ID，不补充替代项。自动取消默认关闭。零禁用操作。不会发送消息。',
    '每批上限（0–10000；零禁用操作）',
    '受保护的优先账户',
    '活跃账户；保留',
    '已达批次上限',
    '删除停用好友',
    '取消发出的请求',
    '好友已删除',
    '发出的请求已取消',
    'VK 账户 {id}',
    '确认已审核的删除操作',
    '尚未尝试维护批次。',
  ],
};
export const vkMaintenanceLocale = (language) => {
  const base = Object.fromEntries(
    Object.entries(vkFriendsLocale(language)).map(([key, value]) => [
      key.slice(10),
      value,
    ])
  );
  const values = Object.fromEntries(
    keys.map((key, i) => [key, words[language][i]])
  );
  return Object.fromEntries(
    ['Cleanup', 'Outgoing'].flatMap((name) =>
      Object.entries({
        ...base,
        ...values,
        title: values[`${name.toLowerCase()}Title`],
        hint: values[`${name.toLowerCase()}Hint`],
        limit: values.limit,
      }).map(([key, value]) => [
        `vk${name}.${key === 'limited' ? 'limitReached' : key}`,
        value,
      ])
    )
  );
};
