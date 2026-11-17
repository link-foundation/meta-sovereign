import { asksQuestion } from './question-match.js';
import { normalizeAnswerEnvironment } from './question-context.js';
import {
  learnSalaryVocabulary,
  learnedSalaryTopic,
  learnedSalaryGross,
} from './salary-vocabulary.js';

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
    /\bgross\b|before\s+(?:income\s+)?tax|до\s+(?:вычета|уплаты|налог|ндфл)|гросс|брутто/iu.test(
      text
    );
  const net =
    /\bnet\b|after\s+tax|take.home|на\s+руки|чистыми|нетто|после\s+(?:вычета|уплаты)/iu.test(
      text
    );
  return gross && net ? 'both' : gross ? 'gross' : net ? 'net' : null;
};
export const salaryPeriod = (text) => {
  if (
    /\b(?:annual|yearly|weekly|daily)\b|per\s+(?:year|week|day)|(?:в|за)\s+(?:год|день|неделю)|годов|ежегод/iu.test(
      text
    )
  ) {
    return 'unsupported';
  }
  const hour =
    /\bhour(?:ly)?\b|\/(?:h|hrs?)\b|почасов|часов\S*\s+ставк|(?:в|за)\s+час|\/\s*ч(?:ас)?(?!\p{L})/iu.test(
      text
    );
  const month = /\bmonth(?:ly)?\b|в\s+месяц|ежемесяч/iu.test(text);
  return hour && month ? 'ambiguous' : hour ? 'hour' : month ? 'month' : null;
};
const excluded = (text) =>
  /(?:текущ|последн)\p{L}*\s+(?:мест|работ|должност|уров|(?:по)?часов\p{L}*\s+ставк)|сейчас\s+получа|получали|рассматрива\p{L}*\s+ли|в\s+рамках|вариант\p{L}*\s+оформлени|как\s+(?:настро|реализ)/iu.test(
    text
  ) ||
  /\bcurrent\s+(?:hourly\s+)?(?:pay|rate|salary|package|retainer)\b(?!\s+expectations?\b)|\bhow\s+(?:do|to)\b.*\bcalculat|текущ\p{L}*\s+(?:зарплат\p{L}*|доход\p{L}*|оклад\p{L}*)(?!\p{L}|\s+ожидан)|(?:входит|вписыва|соглас|готов\S*\s+ли)|подсистем|выплат\S*\s+(?:зарплат|заработн)/iu.test(
    text
  ) ||
  /\b(?:previous|past|last|payroll|revenue|budget|expenses?|accept|suit|cards?)\b|прошл|предыдущ|была|были|устраив|подходит|подходят|выручк|бюджет|расход|зарплатн\S*\s+карт|как\s+рассчит|github|\bstack\b/iu.test(
    text
  );
export const directSalaryQuestion = (text, vocabulary) =>
  !excluded(text) &&
  (learnedSalaryTopic(text, vocabulary) ||
    /вилк|ожидани\p{L}*\s+по\s+(?:доход|оплат|вознагражд)|(?:уров|размер)\p{L}*\s+(?:(?:ожидаем|желаем)\p{L}*\s+)?(?:доход|оплат)|доход\p{L}*\s+для\s+себя|(?:желаем|ожидаем)\p{L}*\s+оплат/iu.test(
      text
    ) ||
    (salaryPeriod(text) === 'hour' &&
      /ставк|стоимост|оплат|\b(?:rate|pay)\b/iu.test(text)) ||
    /(?:^|[^\p{L}])(?:оклад\p{L}*|зп|з\s*\/\s*пл?)(?!\p{L})|вознагражден|компенсац|денежн\S*\s+(?:ожидан|пожелан|услов)|комфортн\S*\s+(?:уровень\s+)?доход|\brate\s+expectations?\b/iu.test(
      text
    ) ||
    /\b(?:salary|compensation|remuneration|income)\b|hourly\s+rate|expected\s+pay|pay\s+expectations|зарплат|заработн\S*\s+плат|финансов\S*\s+ожидан|(?:по)?часов\S*\s+(?:ставк|ожидан)|(?:какую|минимальн\S*|ожидаем\S*)\s+(?:оплат|ставк)|(?:желаем\S*|ожидаем\S*)\s+(?:уровень\s+)?доход|ожидан\S*\s+по\s+з\/?п|(?:от\s+какой\s+суммы|в\s+каком\s+диапазоне)\s+рассматриваете\s+предложени/iu.test(
      text
    ));
const language = (text) => (/[а-яё]/iu.test(text) ? 'ru' : 'en');
const clarification = (text, config) => {
  if (text.length > 300 || excluded(text)) {
    return false;
  }
  // A short salutation is allowed only before an explicit request verb.
  let words = text.replace(
    /^(?:\p{Lu}[\p{L}-]{1,30}[,\s]+){1,2}(?=(?:подскажи(?:те)?|please)(?!\p{L}))/iu,
    ''
  );
  if (
    !salaryCurrencies(text, config).length &&
    !salaryBasis(text) &&
    !salaryPeriod(text)
  ) {
    return false;
  }
  for (const entry of config.currencies) {
    for (const word of [
      entry.code,
      ...entry.keywords,
      ...(currencyWords[entry.code] ?? []),
    ]) {
      words = words.replaceAll(
        new RegExp(
          `(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`,
          'giu'
        ),
        ' '
      );
    }
  }
  words = words.replace(
    /(?:before|after)\s+(?:income\s+)?tax(?:es)?|(?:до|после)\s+(?:(?:вычета|уплаты)\s+)?(?:налогов|ндфл)|на\s+руки/giu,
    ' '
  );
  const allowed = new Set(
    'and in what about please provide the figures amount amounts net gross per hour hourly month monthly а в и по сколько тогда до после вычета уплаты налогов ндфл чистыми гросс брутто нетто час месяц подскажи подскажите пожалуйста цифры сумму какие спасибо'.split(
      ' '
    )
  );
  return words
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .every((word) => allowed.has(word));
};
const anchor = (environment, config, vocabulary) => {
  const chain = [];
  for (const entry of environment.recent) {
    if (
      directSalaryQuestion(entry.text, vocabulary) &&
      !['unsupported', 'ambiguous'].includes(salaryPeriod(entry.text))
    ) {
      const period = salaryPeriod(entry.text) ?? 'month';
      return chain.some((item) => {
        const requested = salaryPeriod(item.text);
        return requested && requested !== period;
      })
        ? null
        : { ...entry, chain };
    }
    if (clarification(entry.text, config)) {
      chain.push(entry);
      continue;
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
const unrelatedCurrencyQuestion = (entry, config, vocabulary) =>
  excluded(entry.text) ||
  (asksQuestion(entry.text) &&
    !directSalaryQuestion(entry.text, vocabulary) &&
    !clarification(entry.text, config));
const chooseCurrency = (text, config, environment, vocabulary) => {
  const explicit = salaryCurrencies(text, config);
  if (unknownSalaryCurrency(text, config) || explicit.length > 1) {
    return { code: null, source: 'ambiguous' };
  }
  if (explicit.length === 1) {
    return { code: explicit[0].code, source: 'question' };
  }
  for (const entry of environment.recent) {
    if (unrelatedCurrencyQuestion(entry, config, vocabulary)) {
      break;
    }
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
const effectiveBasis = (text, previous, followup, config, vocabulary) =>
  salaryBasis(text) ??
  (followup
    ? [...previous.chain, previous]
        .map(
          (entry) =>
            salaryBasis(entry.text) ??
            (learnedSalaryGross(entry.text, vocabulary) ? 'gross' : null)
        )
        .find(Boolean)
    : null) ??
  (learnedSalaryGross(text, vocabulary) ? 'gross' : config.defaultBasis);
const effectivePeriod = (period, inherited, followup) =>
  period ?? (followup ? inherited : 'month');
const invalidSalaryText = (text) =>
  typeof text !== 'string' || text.length > 6000 || excluded(text);
export const createSalaryVocabulary = (input) =>
  learnSalaryVocabulary(
    input.matchRulesLimited ? [] : (input.rules ?? []),
    input,
    (text) =>
      !invalidSalaryText(text) && [null, 'month'].includes(salaryPeriod(text))
  );
const previousPeriod = (previous) =>
  previous ? (salaryPeriod(previous.text) ?? 'month') : 'month';
export const salaryQuestion = (text, config, input) => {
  if (invalidSalaryText(text)) {
    return null;
  }
  const vocabulary = input.salaryVocabulary ?? createSalaryVocabulary(input);
  const environment = normalizeAnswerEnvironment(input);
  const previous = anchor(environment, config, vocabulary);
  const followup = !directSalaryQuestion(text, vocabulary);
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
  const inheritedPeriod = previousPeriod(previous);
  if (followup && period && period !== inheritedPeriod) {
    return null;
  }
  const selected = chooseCurrency(text, config, environment, vocabulary);
  return {
    currency: selected.code,
    basis: effectiveBasis(text, previous, followup, config, vocabulary),
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
