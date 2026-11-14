import {
  profileUrlKey,
  collectProfileGithub,
} from './question-profile-contact-values.js';

const labels = {
  name: ['name', 'full name', 'имя', 'фио', 'полное имя', 'नाम', '姓名'],
  firstName: [
    'first name',
    'given name',
    'личное имя',
    'имя (без фамилии)',
    'पहला नाम',
    '名',
  ],
  lastName: ['last name', 'surname', 'фамилия', 'उपनाम', '姓氏'],
  middleName: ['middle name', 'отчество', 'मध्य नाम', '中间名'],
  birthDate: [
    'birth date',
    'date of birth',
    'birthday',
    'дата рождения',
    'जन्म तिथि',
    '出生日期',
  ],
  email: ['email', 'e-mail', 'почта', 'электронная почта', 'ईमेल', '邮箱'],
  phone: ['phone', 'telephone', 'телефон', 'फ़ोन', 'फोन', '电话'],
  telegram: ['telegram', 'телеграм', 'टेलीग्राम', '电报'],
  linkedin: ['linkedin', 'линкедин'],
  github: ['github', 'гитхаб'],
  resume: ['resume', 'résumé', 'cv', 'резюме', 'सीवी', 'रिज्यूमे', '简历'],
  location: [
    'location',
    'city',
    'город',
    'местоположение',
    'проживает',
    'शहर',
    '所在地',
    '城市',
  ],
  timezone: ['time zone', 'timezone', 'часовой пояс', 'समय क्षेत्र', '时区'],
  website: ['website', 'portfolio', 'сайт', 'портфолио', 'वेबसाइट', '网站'],
  headline: ['headline', 'profession', 'профессия', 'पेशा', '职业'],
  summary: ['summary', 'about', 'о себе', 'परिचय', '简介'],
};
export const profileLabelKey = (label) =>
  typeof label === 'string'
    ? Object.entries(labels).find(([, names]) =>
        names.includes(label.toLowerCase().trim())
      )?.[0]
    : undefined;

// Replace simple inline Markdown contacts without rendering HTML or following a URL.
const inlineContacts = (line) => {
  let result = '';
  let start = 0;
  while (start < line.length) {
    const open = line.indexOf('[', start);
    if (open < 0) {
      break;
    }
    const close = line.indexOf('](', open + 1);
    const end = close < 0 ? -1 : line.indexOf(')', close + 2);
    if (end < 0) {
      break;
    }
    const image = open > start && line[open - 1] === '!';
    const target = line.slice(close + 2, end);
    const value = /^(?:https?:|mailto:|tel:)/iu.test(target)
      ? target.replace(/^(?:mailto:|tel:)/iu, '')
      : '';
    result += line.slice(start, image ? open - 1 : open) + (image ? '' : value);
    start = end + 1;
  }
  return result + line.slice(start);
};
const unwrapped = (value) => {
  const text = value.trim();
  const marker = ['**', '__', '`'].find(
    (token) =>
      text.length > token.length * 2 &&
      text.startsWith(token) &&
      text.endsWith(token)
  );
  return marker ? text.slice(marker.length, -marker.length) : text;
};
const unwrappedLabel = (line) => {
  const marker = ['**', '__', '`'].find((token) => line.startsWith(token));
  if (!marker) {
    return line;
  }
  const end = line.indexOf(marker, marker.length);
  if (end < 0 || end > 60) {
    return line;
  }
  const label = line.slice(marker.length, end);
  return profileLabelKey(label.replace(/[:：=]\s*$/u, ''))
    ? label + line.slice(end + marker.length)
    : line;
};
const markdownLine = (raw) => {
  const line = unwrappedLabel(
    unwrapped(inlineContacts(raw.replace(/^\s*(?:#{1,6}\s+|[-+*]\s+)/u, '')))
  );
  const separator = line.search(/[:：=]/u);
  return separator < 0 || !profileLabelKey(line.slice(0, separator))
    ? line
    : `${unwrapped(line.slice(0, separator))}${line[separator]} ${unwrapped(line.slice(separator + 1))}`;
};
const resumeSection = (line) =>
  /^(?:опыт работы|образование|ключевые навыки|навыки|обо мне|experience|work experience|professional experience|education|skills|about me|कार्य अनुभव|शिक्षा|工作经历|工作经验|教育经历|教育背景)(?:\s*[:(—–-].*)?$/iu.test(
    line
  );
const headingName = (line) => {
  const name = line.replace(/^#\s+/u, '').trim();
  return name.length <= 200 &&
    /^(?:[\p{L}\p{M}'’-]+\s+){1,4}[\p{L}\p{M}'’-]+$/u.test(name) &&
    !/resume|résumé|резюме|curriculum vitae/iu.test(name)
    ? name
    : null;
};
const linkFields = new Set(['github', 'linkedin', 'resume', 'website']);
const tokens = (line) =>
  line
    .split(/[\s<>;,]+/u)
    .map((token) => token.replace(/[),.;]+$/u, ''))
    .filter(Boolean);

const readContactLine = (line, add, evidence) => {
  const labeled = line.trim().match(/^([^:：=]{1,50})[:：=]\s*(.+)$/u);
  const key = labeled && profileLabelKey(labeled[1]);
  if (key) {
    add(
      key,
      linkFields.has(key) ? tokens(labeled[2]).join('\n') : labeled[2],
      evidence
    );
    return;
  }
  for (const value of tokens(line)) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
      add('email', value, evidence);
    }
    const contact = profileUrlKey(value);
    if (contact) {
      add(contact, value, evidence);
    }
  }
};

const readResumeFacts = (line, add, evidence) => {
  const born =
    line.match(/\bborn(?:\s+on)?\s+(\d{1,2}\s+[\p{L}]+\s+\d{4})/iu) ??
    line.match(/родил(?:ся|ась)\s+(\d{1,2}\s+[\p{L}]+\s+\d{4})/iu);
  if (born) {
    add('birthDate', born[1], evidence);
  }
  if (/^\+?[\d\s().-]{7,30}$/u.test(line)) {
    add('phone', line, evidence);
  }
};

export const fromProfileText = (text, add, format) => {
  const markdown = format === 'resume-markdown';
  let fenced = false;
  let first = true;
  const github = collectProfileGithub(add);
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    if (markdown && /^\s*(?:```|~~~)/u.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !raw.trim()) {
      continue;
    }
    const line = markdown ? markdownLine(raw) : raw;
    const evidence = { source: 'text', path: `line:${index + 1}` };
    if (markdown && resumeSection(line)) {
      break;
    }
    if (markdown && first) {
      const name = headingName(raw);
      if (name) {
        github.add('name', name, evidence);
      }
    }
    first = false;
    if (markdown) {
      readResumeFacts(line, github.add, evidence);
    }
    readContactLine(line, github.add, evidence);
  }
  github.finish();
};
