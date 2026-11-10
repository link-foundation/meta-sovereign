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
  resume: ['resume link', 'cv link', 'ссылка на резюме', '简历链接'],
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

/** Explicit contact labels only; the report always requires owner review. */
export const formProfileFields = (field, profile) => {
  const text = ` ${questionKey(field.label)} `;
  const group = questionKey(field.group?.label ?? '');
  if (
    /^(do |have |are |can |is |did |вы используете|есть ли|是否|क्या)/u.test(
      text.trim()
    )
  ) {
    return [];
  }
  // A reference/employer's details are not evidence about the owner.
  if (
    /company|employer|reference|компани|работодател|рекомендател|雇主|公司|संदर्भ|कंपनी/u.test(
      `${text} ${group}`
    )
  ) {
    return [];
  }
  const keys = normalized
    .filter(([, labels]) => labels.some((label) => mentions(text, label)))
    .map(([key]) => key);
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
  if (
    (text.includes('resume') &&
      (text.includes('portfolio') || text.includes('profile'))) ||
    (text.includes('резюме') &&
      (text.includes('портфолио') || text.includes('профиль')))
  ) {
    return ['resume', 'website', 'linkedin', 'github'].filter((key) =>
      profile[key]?.trim()
    );
  }
  return [...new Set(keys)];
};
