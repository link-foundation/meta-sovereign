// Anonymized communication patterns; no private peer ids or real profile handles.
export const acquaintanceConversation = (source = 'telegram') => {
  const rows = [
    ['me', 'Привет 🙂'],
    ['me', 'Ты программист? 🙂'],
    ['contact', 'Привет! А ты?'],
    ['contact', 'Вообще, да'],
    ['me', 'И я тоже 🙂', 3],
    ['me', 'Будем дружить? 🙂'],
    ['contact', 'Та давай'],
    ['me', 'А ты есть на GitHub?', 4],
    ['contact', 'Есть'],
    ['me', 'Поделишься ссылкой?', 9],
    ['contact', 'Ээ'],
    ['contact', 'Оке, а зачем?'],
    ['me', 'Хочешь я на тебя подпишусь? 🙂'],
    ['me', 'Хочу посмотреть, что ты делаешь и кодишь'],
    ['contact', 'Та толку', 13],
    ['contact', 'Опенсорсного ничего', 14],
    ['contact', 'https://github.com/example-developer'],
    ['me', 'Спасибо за ссылку!'],
    ['contact', 'Спасибо'],
  ];
  return rows.map(([sender, body, reply], i) => ({
    id: `msg:${source}:111:${i + 1}`,
    source,
    chat: '111',
    sender,
    body,
    chatType: 'personal_chat',
    timestamp: new Date(Date.UTC(2026, i < 7 ? 0 : 9, 12, 12, i)).toISOString(),
    replyTo: reply ? `111:${reply}` : null,
  }));
};
