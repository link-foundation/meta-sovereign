import { questionKey } from '../automation/question-match.js';

const aliases = {
  firstName: ['first name', 'given name', 'имя', 'पहला नाम', '名'],
  lastName: ['last name', 'surname', 'фамилия', 'उपनाम', '姓氏'],
  name: ['full name', 'name', 'фио', 'полное имя', 'पूरा नाम', 'नाम', '姓名'],
  email: ['email', 'e-mail', 'электронная почта', 'почта', 'ईमेल', '邮箱'],
  phone: [
    'phone',
    'telephone',
    'mobile',
    'телефон',
    'номер телефона',
    'फ़ोन',
    'फोन',
    '电话',
  ],
  telegram: ['telegram', 'телеграм', 'टेलीग्राम', '电报'],
  github: ['github', 'гитхаб'],
  linkedin: ['linkedin', 'линкедин'],
  resume: ['resume', 'résumé', 'cv', 'резюме', 'सीवी', 'रिज्यूमे', '简历'],
  website: [
    'portfolio',
    'website',
    'портфолио',
    'сайт',
    'वेबसाइट',
    '网站',
    '作品集',
  ],
  location: [
    'location',
    'city',
    'город',
    'местоположение',
    'शहर',
    '所在地',
    '城市',
  ],
  timezone: ['time zone', 'timezone', 'часовой пояс', 'समय क्षेत्र', '时区'],
  birthDate: [
    'birth date',
    'date of birth',
    'дата рождения',
    'जन्म तिथि',
    '出生日期',
  ],
};
const normalized = Object.entries(aliases).map(([key, labels]) => [
  key,
  labels.map((label) => ` ${questionKey(label)} `),
]);
const mentions = (text, phrase) =>
  text.includes(phrase) ||
  (/\p{Script=Han}/u.test(phrase) && text.includes(phrase.trim()));

const nameFields = (keys, label) => {
  const full = /full name|полное имя|фио|पूरा नाम|姓名/u.test(
    questionKey(label)
  );
  return [
    ...new Set(
      keys.filter((key) =>
        full ? !['firstName', 'lastName'].includes(key) : key !== 'name'
      )
    ),
  ];
};

// Boolean controls ask for a decision, and another person's details are not
// evidence about the owner. Leave these to the ordinary saved-answer planner.
const excludedProfileField = (field, text, group) =>
  ['checkbox', 'radio'].includes(field.type) ||
  /^(do |have |are |can |is |did |вы используете|есть ли|是否|क्या)/u.test(
    text.trim()
  ) ||
  /company|employer|reference|компани|работодател|рекомендател|雇主|公司|संदर्भ|कंपनी/u.test(
    `${text} ${group}`
  );

const linkKeys = ['resume', 'website', 'linkedin', 'github'];
const linkWords = new Set(
  linkKeys.flatMap((key) =>
    aliases[key].flatMap((label) => questionKey(label).split(' '))
  )
);
const explicitLinkCue = (text) =>
  /(?:^| )(?:link|links|url|urls|ссыл[\p{L}]*|लिंक)(?: |$)|链接/u.test(text);
const linkCue = (text) =>
  explicitLinkCue(text) ||
  /(?:^| )(?:profiles?|профил[\p{L}]*|प्रोफ़ाइल)(?: |$)|主页/u.test(text);
const simpleLinkLabel = (text) => {
  const words = text
    .trim()
    .split(' ')
    .filter(
      (word) =>
        ![
          'your',
          'please',
          'provide',
          'enter',
          'account',
          'or',
          'and',
          'мой',
          'ваш',
          'ваша',
          'укажите',
          'аккаунт',
          'или',
          'и',
          'आपका',
          'अपना',
          'या',
          'और',
        ].includes(word)
    );
  return words.length > 0 && words.every((word) => linkWords.has(word));
};

/** Link intent is independent of whether the current owner has a saved profile. */
export const formLinkFields = (field) => {
  const text = ` ${questionKey(field.label)} `;
  if (
    excludedProfileField(field, text, questionKey(field.group?.label ?? ''))
  ) {
    return [];
  }
  const keys = normalized
    .filter(
      ([key, labels]) =>
        linkKeys.includes(key) && labels.some((label) => mentions(text, label))
    )
    .map(([key]) => key);
  if (!keys.length) {
    return explicitLinkCue(text) ? ['website'] : [];
  }
  const combined =
    keys.includes('resume') &&
    (keys.includes('website') ||
      /profile|профил|प्रोफ़ाइल|个人资料/u.test(text));
  return combined
    ? linkKeys
    : linkCue(text) || simpleLinkLabel(text)
      ? keys
      : [];
};

/** Explicit contact labels only; the report always requires owner review. */
export const formProfileFields = (field, profile) => {
  const text = ` ${questionKey(field.label)} `;
  const group = questionKey(field.group?.label ?? '');
  if (excludedProfileField(field, text, group)) {
    return [];
  }
  const keys = normalized
    .filter(
      ([key, labels]) =>
        !linkKeys.includes(key) && labels.some((label) => mentions(text, label))
    )
    .map(([key]) => key);
  const links = formLinkFields(field);
  // Include every available contact for a combined request. Keep the missing
  // keys when none exist so a saved boolean cannot replace absent contacts.
  keys.push(
    ...(links.length === linkKeys.length &&
    links.some((key) => profile[key]?.trim())
      ? links.filter((key) => profile[key]?.trim())
      : links)
  );
  if (field.type === 'email') {
    keys.push('email');
  } else if (field.type === 'tel') {
    keys.push('phone');
  }
  if (keys.includes('firstName') || keys.includes('lastName')) {
    // The standalone Russian "имя" also names a first-name control. Do not
    // invent a first/last split from a stored full name.
    return nameFields(keys, field.label);
  }
  return [...new Set(keys)];
};
