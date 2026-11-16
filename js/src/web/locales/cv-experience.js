const entries = {
  en: {
    title: 'HH and LinkedIn experience',
    reviewOnly:
      'Compare employers and overlapping dates. Review only: saving changes on a provider is a separate step.',
    unavailable:
      'Experience could not be compared. Review the companies and dates in both snapshots.',
    counts:
      '{pairs} paired · {hh} HH only · {linkedin} LinkedIn only · {review} need review',
    only: 'Only on {platform}',
    original: 'Original record',
    equal: 'These records agree.',
    ambiguous: 'Several roles overlap at this employer. Review the match.',
    'unknown-period': 'Dates are incomplete. Review the match.',
    translation: 'Review translation',
    company: 'Employer',
    titleField: 'Role',
    start: 'Start',
    end: 'End',
    current: 'Current role',
    location: 'Location',
    description: 'Description',
    skills: 'Skills',
    industries: 'Industries',
    website: 'Website',
    areaId: 'Location identifier',
  },
  ru: {
    title: 'Опыт работы на HH и LinkedIn',
    reviewOnly:
      'Сравнение работодателей и пересекающихся периодов. Только проверка: сохранение на площадке выполняется отдельно.',
    unavailable:
      'Не удалось сравнить опыт. Проверьте компании и даты в обоих снимках.',
    counts:
      'Пар: {pairs} · только HH: {hh} · только LinkedIn: {linkedin} · требуют проверки: {review}',
    only: 'Только на {platform}',
    original: 'Исходная запись',
    equal: 'Записи совпадают.',
    ambiguous:
      'Несколько должностей у работодателя пересекаются. Проверьте соответствие.',
    'unknown-period': 'Даты неполные. Проверьте соответствие.',
    translation: 'Проверьте перевод',
    company: 'Работодатель',
    titleField: 'Должность',
    start: 'Начало',
    end: 'Окончание',
    current: 'Текущая работа',
    location: 'Место работы',
    description: 'Описание',
    skills: 'Навыки',
    industries: 'Отрасли',
    website: 'Сайт',
    areaId: 'Идентификатор местоположения',
  },
  hi: {
    title: 'HH और LinkedIn का कार्य अनुभव',
    reviewOnly:
      'नियोक्ता और एक साथ आने वाली तारीखों की तुलना। केवल समीक्षा: प्रदाता पर बदलाव सहेजना अलग चरण है।',
    unavailable:
      'अनुभव की तुलना नहीं हो सकी। दोनों स्नैपशॉट में कंपनियों और तारीखों की समीक्षा करें।',
    counts:
      '{pairs} जोड़े · केवल HH: {hh} · केवल LinkedIn: {linkedin} · समीक्षा चाहिए: {review}',
    only: 'केवल {platform} पर',
    original: 'मूल रिकॉर्ड',
    equal: 'ये रिकॉर्ड समान हैं।',
    ambiguous:
      'इस नियोक्ता की कई भूमिकाओं की अवधि एक साथ आती है। मिलान की समीक्षा करें।',
    'unknown-period': 'तारीखें अधूरी हैं। मिलान की समीक्षा करें।',
    translation: 'अनुवाद की समीक्षा करें',
    company: 'नियोक्ता',
    titleField: 'भूमिका',
    start: 'शुरुआत',
    end: 'समाप्ति',
    current: 'वर्तमान भूमिका',
    location: 'स्थान',
    description: 'विवरण',
    skills: 'कौशल',
    industries: 'उद्योग',
    website: 'वेबसाइट',
    areaId: 'स्थान पहचानकर्ता',
  },
  zh: {
    title: 'HH 与 LinkedIn 工作经历',
    reviewOnly: '按雇主与重叠日期比较。仅供审核：在平台保存更改是单独的步骤。',
    unavailable: '无法比较工作经历。请检查两份快照中的公司和日期。',
    counts:
      '已匹配 {pairs} · 仅 HH {hh} · 仅 LinkedIn {linkedin} · 待审核 {review}',
    only: '仅在 {platform}',
    original: '原始记录',
    equal: '这些记录一致。',
    ambiguous: '该雇主有多个任职时间重叠的职位。请审核匹配。',
    'unknown-period': '日期不完整。请审核匹配。',
    translation: '审核翻译',
    company: '雇主',
    titleField: '职位',
    start: '开始',
    end: '结束',
    current: '当前职位',
    location: '地点',
    description: '描述',
    skills: '技能',
    industries: '行业',
    website: '网站',
    areaId: '地点标识符',
  },
};

export const cvExperienceLocale = (locale) =>
  Object.fromEntries(
    Object.entries(entries[locale] ?? entries.en).map(([key, value]) => [
      `cvExperience.${key === 'titleField' ? 'role' : key}`,
      value,
    ])
  );
