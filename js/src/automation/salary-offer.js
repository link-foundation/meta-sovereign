import { salaryBasis, salaryPeriod } from './salary-question.js';

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const aliases = {
  RUB: ['₽', 'рублей', 'рубля', 'руб.', 'руб', 'р.'],
  USD: ['$', 'dollars'],
  EUR: ['€', 'euros', 'евро'],
  GBP: ['£', 'pounds'],
};
const quantity =
  '(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d{1,12})(?:([.,]\\d{1,3}))?';
const sum = `(${quantity})\\s*(тыс\\.?|млн\\.?|[km](?!\\p{L}))?`;
const range = `${sum}(?:\\s*(?:[-–—]|to|до)\\s*${sum})?`;
const scale = (text = '') =>
  /тыс|k/iu.test(text) ? 1000 : /млн|m/iu.test(text) ? 1000000 : 1;
const numeric = (text) =>
  Number(
    text
      .replaceAll(/[\s\u00a0\u202f]/gu, '')
      .replace(/,(?=\d{3}$)/u, '')
      .replace(',', '.')
  );
const amountFrom = (match) => {
  // Each sum captures its complete quantity, integer, decimal and scale.
  const upper = match[5] ?? match[1];
  const common = match[8] ?? match[4];
  const amount = numeric(upper) * scale(common);
  const lower = numeric(match[1]) * scale(match[4] ?? common);
  return Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 1e12 &&
    lower <= amount
    ? amount
    : null;
};
const moneyMatches = (text, entry) => {
  const words = [
    ...new Set([
      entry.code,
      ...(entry.keywords ?? []),
      ...(aliases[entry.code] ?? []),
    ]),
  ]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
  const code = `(?:${words})(?!\\p{L})`;
  const patterns = [
    `(?<![\\p{L}\\p{N}.,])${range}\\s*${code}`,
    `(?<!\\p{L})${code}\\s*${range}(?![\\p{L}\\p{N}])`,
  ];
  return patterns.flatMap((pattern) =>
    [...text.matchAll(new RegExp(pattern, 'giu'))]
      .filter((match) => !text.slice(0, match.index).trimEnd().endsWith('-'))
      .map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
        amount: amountFrom(match),
        currency: entry.code,
      }))
  );
};
const lessonHours = (text) => {
  const matches = [
    ...text.matchAll(
      /(?<![\p{L}\p{N}.,])(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:hours?|hrs?|час(?:а|ов)?|ч\.?)(?!\p{L})/giu
    ),
  ];
  const values = [...new Set(matches.map((match) => numeric(match[1])))];
  return values.length === 1 && values[0] > 0 && values[0] <= 24
    ? values[0]
    : null;
};
export const statesSalaryPay = (text, config) =>
  typeof text === 'string' &&
  text.length <= 6000 &&
  (/\d[\d\s.,]*(?:₽|\$|€|£|руб|р\.|\b(?:RUB|USD|EUR|GBP)\b)|(?:\$|€|£|\b(?:RUB|USD|EUR|GBP)\b)\s*\d/iu.test(
    text
  ) ||
    config.currencies.some((entry) => moneyMatches(text, entry).length > 0));

const offerUnits = (text, defaultPeriod) => {
  const basis = salaryBasis(text);
  if (basis === 'both') {
    return null;
  }
  const lesson = /(?:за|per)\s+(?:заняти|урок|lesson|session)/iu.test(text);
  const durationHours = lesson ? lessonHours(text) : null;
  const period = lesson ? 'lesson' : (salaryPeriod(text) ?? defaultPeriod);
  if (
    (lesson && !durationHours) ||
    !['month', 'hour', 'lesson'].includes(period)
  ) {
    return null;
  }
  return { basis, period, ...(lesson ? { durationHours } : {}) };
};
/** One explicit money amount/range; unrelated numbers and currencies never merge. */
export const salaryOffer = (text, config, { defaultPeriod = null } = {}) => {
  if (typeof text !== 'string' || text.length > 6000 || !text.trim()) {
    return null;
  }
  const matches = config.currencies.flatMap((entry) =>
    moneyMatches(text, entry)
  );
  const unique = [
    ...new Map(
      matches.map((match) => [
        `${match.start}:${match.end}:${match.currency}`,
        match,
      ])
    ).values(),
  ];
  if (unique.length !== 1 || !unique[0].amount) {
    return null;
  }
  const units = offerUnits(text, defaultPeriod);
  return units
    ? { amount: unique[0].amount, currency: unique[0].currency, ...units }
    : null;
};

export const salaryOfferCurrencies = Object.keys(aliases).map((code) => ({
  code,
  keywords: [],
}));
