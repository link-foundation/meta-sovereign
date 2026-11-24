const words = {
  en: ['Add outgoing requests to priority', 'Clear saved priority list'],
  ru: [
    'Добавить исходящие заявки в приоритет',
    'Очистить сохранённый приоритет',
  ],
  hi: ['भेजे अनुरोध प्राथमिकता में जोड़ें', 'सहेजी प्राथमिकता सूची साफ़ करें'],
  zh: ['将已发请求加入优先列表', '清空已保存的优先列表'],
};
export const vkFriendPriorityLocale = (language) =>
  Object.fromEntries(
    ['seedPriority', 'clearPriority'].map((key, index) => [
      `vkFriends.${key}`,
      words[language][index],
    ])
  );
