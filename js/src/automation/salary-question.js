import { asksQuestion } from './question-match.js';
import { normalizeAnswerEnvironment } from './question-context.js';

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const literal = (text, word) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'iu').test(
    text
  );
const currencyWords = {
  RUB: ['₽', 'руб', 'рублей', 'рублях', 'рубли', 'roubles', 'rubles'],
  USD: ['$', 'долларов', 'долларах', 'доллары', 'dollars'],
  EUR: ['€', 'евро', 'euros'],
  GBP: ['£', 'фунтов', 'фунтах', 'pounds'],
};
export const salaryCurrencies = (text, config) =>
  config.currencies.filter((entry) =>
    [entry.code, ...entry.keywords, ...(currencyWords[entry.code] ?? [])].some(
      (word) => literal(text, word)
    )
  );
const knownCurrencies = new Set([
  ...Intl.supportedValuesOf('currency'),
  'USDT',
  'BTC',
  'ETH',
]);
export const unknownSalaryCurrency = (text, config) => {
  if (
    Object.entries(currencyWords).some(
      ([code, words]) =>
        !config.currencies.some((entry) => entry.code === code) &&
        words.some((word) => literal(text, word))
    )
  ) {
    return true;
  }
  const codes = [...text.matchAll(/\b[A-Z]{3,10}\b/gu)].map(([word]) => word);
  codes.push(
    ...[
      ...text.matchAll(/\b(?:gbp|cad|aud|chf|jpy|cny|inr|usdt|btc|eth)\b/giu),
    ].map(([word]) => word.toUpperCase())
  );
  return codes.some(
    (word) =>
      knownCurrencies.has(word) &&
      !config.currencies.some((entry) => entry.code === word)
  );
};
export const salaryBasis = (text) => {
  const gross =
    /\bgross\b|before\s+(?:income\s+)?tax|до\s+(?:вычета\s+)?налог|гросс/iu.test(
      text
    );
  const net = /\bnet\b|after\s+tax|take.home|на\s+руки|чистыми/iu.test(text);
  return gross && net ? 'both' : gross ? 'gross' : net ? 'net' : null;
};
export const salaryPeriod = (text) => {
  if (
    /\b(?:annual|yearly|weekly|daily)\b|per\s+(?:year|week|day)|в\s+(?:год|день|неделю)|годов|ежегод/iu.test(
      text
    )
  ) {
    return 'unsupported';
  }
  const hour =
    /\bhour(?:ly)?\b|\/(?:h|hr)\b|почасов|в\s+час|руб\s*\/\s*час/iu.test(text);
  const month = /\bmonth(?:ly)?\b|в\s+месяц|ежемесяч/iu.test(text);
  return hour && month ? 'ambiguous' : hour ? 'hour' : month ? 'month' : null;
};
const excluded = (text) =>
  /\b(?:previous|past|last|payroll|revenue|accept|suit|cards?)\b|прошл|предыдущ|была|были|устраив|подходит|подходят|выручк|зарплатн\S*\s+карт|как\s+рассчит|github|\bstack\b/iu.test(
    text
  );
const direct = (text) =>
  !excluded(text) &&
  /\b(?:salary|compensation|remuneration|income)\b|hourly\s+rate|expected\s+pay|pay\s+expectations|зарплат|заработн\S*\s+плат|финансов\S*\s+ожидан|почасов\S*\s+(?:ставк|ожидан)|(?:какую|минимальн\S*|ожидаем\S*)\s+(?:оплат|ставк)/iu.test(
    text
  );
const language = (text) => (/[а-яё]/iu.test(text) ? 'ru' : 'en');
const clarification = (text, config) => {
  if (text.length > 300 || excluded(text)) {
    return false;
  }
  let words = text;
  if (
    !salaryCurrencies(text, config).length &&
    !salaryBasis(text) &&
    !salaryPeriod(text)
  ) {
    return false;
  }
  for (const entry of config.currencies) {
    for (const word of [entry.code, ...entry.keywords]) {
      words = words.replaceAll(new RegExp(escape(word), 'giu'), ' ');
    }
  }
  words = words.replace(
    /before\s+taxes|after\s+taxes|до\s+вычета\s+налогов|на\s+руки/giu,
    ' '
  );
  const allowed = new Set(
    'and in what about please net gross per hour hourly month monthly а в и по сколько тогда до налогов чистыми гросс час месяц рублях долларах евро'.split(
      ' '
    )
  );
  return words
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .every((word) => allowed.has(word));
};
const anchor = (environment) => {
  for (const entry of environment.recent) {
    if (
      direct(entry.text) &&
      !['unsupported', 'ambiguous'].includes(salaryPeriod(entry.text))
    ) {
      return entry;
    }
    if (asksQuestion(entry.text)) {
      break;
    }
  }
  return null;
};
const vacancyCurrencySources = (environment) => [
  { text: environment.intro ?? '', source: 'form-intro' },
  {
    text: environment.vacancy.pay,
    source: 'vacancy-pay',
    evidence: environment.vacancy.evidence,
  },
  {
    text: environment.vacancy.description,
    source: 'vacancy-description',
    evidence: environment.vacancy.evidence,
  },
];
const chooseCurrency = (text, config, environment) => {
  const explicit = salaryCurrencies(text, config);
  if (unknownSalaryCurrency(text, config) || explicit.length > 1) {
    return { code: null, source: 'ambiguous' };
  }
  if (explicit.length === 1) {
    return { code: explicit[0].code, source: 'question' };
  }
  for (const entry of environment.recent) {
    const matches = salaryCurrencies(entry.text, config);
    if (unknownSalaryCurrency(entry.text, config) || matches.length > 1) {
      return { code: null, source: 'ambiguous', evidence: entry.evidence };
    }
    if (matches.length === 1) {
      return {
        code: matches[0].code,
        source: 'conversation',
        evidence: entry.evidence,
      };
    }
    if (asksQuestion(entry.text)) {
      break;
    }
  }
  for (const { text: value, source, evidence } of vacancyCurrencySources(
    environment
  )) {
    const matches = salaryCurrencies(value, config);
    if (unknownSalaryCurrency(value, config) || matches.length > 1) {
      return { code: null, source: 'ambiguous' };
    }
    if (matches.length === 1) {
      return {
        code: matches[0].code,
        source,
        evidence,
      };
    }
  }
  return {
    code: config.defaultCurrency,
    source: config.defaultCurrency ? 'default' : 'missing',
  };
};
const salaryLanguage = (text, previous, followup) =>
  followup && !/[а-яё]|\b(?:and|in|what|please)\b/iu.test(text)
    ? language(previous.text)
    : language(text);
const effectiveBasis = (text, previous, followup, config) =>
  salaryBasis(text) ??
  (followup ? salaryBasis(previous.text) : null) ??
  config.defaultBasis;
const effectivePeriod = (period, inherited, followup) =>
  period ?? (followup ? inherited : 'month');
const invalidSalaryText = (text) =>
  typeof text !== 'string' || text.length > 6000 || excluded(text);
export const salaryQuestion = (text, config, input) => {
  if (invalidSalaryText(text)) {
    return null;
  }
  const environment = normalizeAnswerEnvironment(input);
  const previous = anchor(environment);
  const followup = !direct(text);
  if (!followup && input.questionMode !== 'field' && !asksQuestion(text)) {
    return null;
  }
  const period = salaryPeriod(text);
  if (
    period === 'unsupported' ||
    (followup && (!previous || !clarification(text, config)))
  ) {
    return null;
  }
  const inheritedPeriod = previous
    ? (salaryPeriod(previous.text) ?? 'month')
    : 'month';
  if (followup && period && period !== inheritedPeriod) {
    return null;
  }
  const selected = chooseCurrency(text, config, environment);
  return {
    currency: selected.code,
    basis: effectiveBasis(text, previous, followup, config),
    period: effectivePeriod(period, inheritedPeriod, followup),
    language: salaryLanguage(text, previous, followup),
    context: {
      key: 'salary_currency',
      choice: selected.code,
      source: selected.source,
      ...(selected.evidence ? { evidence: selected.evidence } : {}),
    },
  };
};
