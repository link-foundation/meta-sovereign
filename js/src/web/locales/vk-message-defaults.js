const words = {
  en: [
    'Use ten invitation defaults and their marker',
    'Use ten birthday defaults',
    'Undo text reset',
    'Reset changes this draft only. Save applies it; Undo restores your text.',
  ],
  ru: [
    'Десять приглашений по умолчанию и их маркер',
    'Десять поздравлений по умолчанию',
    'Отменить сброс текста',
    'Сброс меняет только черновик. Сохраните для применения или отмените для восстановления текста.',
  ],
  hi: [
    'दस डिफ़ॉल्ट निमंत्रण और उनका चिह्न लें',
    'दस डिफ़ॉल्ट जन्मदिन संदेश लें',
    'पाठ रीसेट वापस लें',
    'रीसेट केवल मसौदा बदलता है। सहेजने पर लागू होगा; वापस लेने पर आपका पाठ लौटेगा।',
  ],
  zh: [
    '使用十条默认邀请及其标记',
    '使用十条默认生日祝福',
    '撤销文本重置',
    '重置仅修改草稿。保存后生效；撤销可恢复您的文本。',
  ],
};
export const vkMessageDefaultsLocale = (language) =>
  Object.fromEntries(
    ['wall', 'birthday', 'undo', 'hint'].map((key, index) => [
      `vkMessageDefaults.${key}`,
      words[language][index],
    ])
  );
