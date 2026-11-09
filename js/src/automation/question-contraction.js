// Contract only explicitly configured values. This never grants approval.
import { normalizeAnswerProfile } from './question-profile.js';
import { answerTemplateEnvironment } from './salary-template.js';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const edge = '[\\p{L}\\p{N}_@]';
const literal = (value) => `(?<!${edge})${escape(value)}(?!${edge})`;
const contactPattern = (key, value) => {
  if (/^(?:https?|ftp|mailto|tg):?\/?\/?$/iu.test(value) || value.length < 3) {
    return null;
  }
  const digits = value.replace(/\D/gu, '');
  if (
    key === 'phone' &&
    /^\+?[\d ()-]+$/u.test(value) &&
    digits.length >= 10 &&
    digits.length <= 15
  ) {
    return `(?<![\\p{L}\\p{N}+])\\+?${[...digits].join('[ \\u00a0()-]{0,4}')}(?![\\p{L}\\p{N}])`;
  }
  return literal(value);
};
const currencyWords = {
  USD: ['$', 'USD', 'dollars', 'долларов', 'доллара', 'доллары'],
  EUR: ['€', 'EUR', 'euros', 'евро'],
  RUB: ['₽', 'RUB', 'rubles', 'roubles', 'рублей', 'рубля', 'рубли', 'руб.'],
};
const amountPattern = (amount) => {
  const [whole, fraction] = Number(amount.toFixed(2)).toString().split('.');
  const grouped = [...whole]
    .map((digit, index) =>
      index && (whole.length - index) % 3 === 0
        ? `[ \\u00a0\\u202f]?${digit}`
        : digit
    )
    .join('');
  return `${grouped}${fraction ? `[.,]${fraction}0{0,2}` : '(?:[.,]0{1,2})?'}`;
};
const salaryPattern = ({ amount, currency }) => {
  const number = amountPattern(amount);
  const words = [...new Set([currency, ...(currencyWords[currency] ?? [])])]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  // A decimal or larger adjacent number cannot become a partial match.
  return `(?<![\\p{L}\\p{N}.,])(?:(?:${words})[ \\u00a0]?${number}|${number}[ \\u00a0]?(?:${words}))(?![\\p{L}\\p{N}]|[.,]\\d)`;
};
const replacements = (profile, fields) => {
  const patterns = new Map();
  const add = (key, pattern, size) => {
    if (!pattern) {
      return;
    }
    const identity = pattern.toLowerCase();
    const entry = patterns.get(identity) ?? { keys: new Set(), size, pattern };
    entry.keys.add(key);
    patterns.set(identity, entry);
  };
  for (const [key, value] of Object.entries(profile)) {
    if (!fields.has(key)) {
      add(key, contactPattern(key, value.trim()), value.length);
    }
  }
  for (const [key, field] of fields) {
    if (
      field.amount &&
      /_[a-z0-9]+$/u.test(key) &&
      key.endsWith(`_${field.currency.toLowerCase()}`)
    ) {
      add(key, salaryPattern(field), profile[key].length);
    }
  }
  return [...patterns]
    .flatMap(([, { pattern, keys, size }]) =>
      keys.size === 1
        ? [{ key: [...keys][0], pattern: new RegExp(pattern, 'giu'), size }]
        : []
    )
    .sort((a, b) => b.size - a.size);
};

export const createAnswerContractor = (input = {}) => {
  if (input.contract !== true) {
    return (text) => text;
  }
  const environment = answerTemplateEnvironment('', {
    ...input,
    profile: normalizeAnswerProfile(input.profile),
  });
  const entries = replacements(environment.profile, environment.fields);
  return (text) => {
    let result = text;
    for (const { key, pattern } of entries) {
      // Protect existing and newly inserted placeholders from later passes.
      result = result
        .split(/(\{\{[^{}\n]{1,100}\}\})/u)
        .map((part, index) =>
          index % 2 ? part : part.replace(pattern, () => `{{${key}}}`)
        )
        .join('');
    }
    return result;
  };
};
