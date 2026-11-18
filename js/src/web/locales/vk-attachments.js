const messages = {
  en: [
    'Received VK attachments',
    'Keep the first metadata for each incoming attachment. Media stays with the message; files are not downloaded here. Pausing keeps saved records. Attachments without a stable provider ID are skipped.',
    'Collect incoming attachment metadata',
    'Refresh saved records',
    'Loading saved metadata…',
    'Could not load or save the collection. Your saved records are kept. Retry the action.',
    'No attachment metadata has been collected.',
    'Load more',
  ],
  ru: [
    'Полученные вложения ВКонтакте',
    'Сохранять первые метаданные каждого входящего вложения. Медиа остаются в сообщениях; файлы здесь не скачиваются. Пауза сохраняет уже собранные записи. Вложения без постоянного ID провайдера пропускаются.',
    'Собирать метаданные входящих вложений',
    'Обновить сохранённые записи',
    'Загрузка метаданных…',
    'Не удалось загрузить или сохранить коллекцию. Сохранённые записи остаются. Повторите действие.',
    'Метаданные вложений ещё не собраны.',
    'Загрузить ещё',
  ],
  hi: [
    'प्राप्त VK अटैचमेंट',
    'हर आने वाले अटैचमेंट का पहला मेटाडेटा रखें। मीडिया संदेश में रहता है; यहाँ फ़ाइलें डाउनलोड नहीं होतीं। संग्रह रोकने पर सहेजे रिकॉर्ड बने रहते हैं। स्थिर प्रदाता ID के बिना अटैचमेंट छोड़ दिए जाते हैं।',
    'आने वाले अटैचमेंट का मेटाडेटा एकत्र करें',
    'सहेजे रिकॉर्ड ताज़ा करें',
    'सहेजा मेटाडेटा लोड हो रहा है…',
    'संग्रह लोड या सहेजा नहीं जा सका। सहेजे रिकॉर्ड बने हैं। कार्रवाई फिर करें।',
    'अभी कोई अटैचमेंट मेटाडेटा एकत्र नहीं हुआ है।',
    'और लोड करें',
  ],
  zh: [
    '收到的 VK 附件',
    '为每个收到的附件保留首次元数据。媒体仍在消息中；此处不下载文件。暂停收集会保留已保存记录。没有稳定服务商 ID 的附件将被跳过。',
    '收集收到的附件元数据',
    '刷新已保存记录',
    '正在加载已保存的元数据…',
    '无法加载或保存收集记录。已保存的记录仍保留。请重试该操作。',
    '尚未收集附件元数据。',
    '加载更多',
  ],
};
export const vkAttachmentsLocale = (language) =>
  Object.fromEntries(
    [
      'title',
      'hint',
      'enabled',
      'refresh',
      'loading',
      'failed',
      'empty',
      'more',
    ].map((key, index) => [`vkAttachments.${key}`, messages[language][index]])
  );
