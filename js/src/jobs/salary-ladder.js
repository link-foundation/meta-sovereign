import { normalizeSalary } from '../automation/salary-config.js';
import {
  salaryOffer,
  salaryOfferCurrencies,
} from '../automation/salary-offer.js';
import { salaryExchangeFresh } from '../automation/salary-exchange-state.js';
import { jobsFailure } from './options.js';

/** The same independent owner targets and dated rates used by salary answers. */
export const salaryLadderSettings = (input) => {
  if (
    input.salaryLadder !== undefined &&
    typeof input.salaryLadder !== 'boolean'
  ) {
    throw jobsFailure('input', 'Salary ladder must be a boolean.');
  }
  const config = normalizeSalary(input.salaryConfig);
  return {
    ...(input.salaryLadder === undefined
      ? {}
      : { salaryLadder: input.salaryLadder }),
    ...(config ? { salaryConfig: config } : {}),
  };
};
const currencyCode = (code) => (code === 'RUR' ? 'RUB' : code);
const rubRate = (config, code) => {
  if (code === 'RUB') {
    return 1;
  }
  const rates = new Map(
    config.exchange?.rates.map((row) => [row.code, row.rate])
  );
  if (config.exchange) {
    rates.set(config.exchange.base, 1);
  }
  return rates.has(code) && rates.has('RUB')
    ? rates.get(code) / rates.get('RUB')
    : null;
};
export const salaryLadderStart = (options) => {
  const config = options.salaryConfig;
  if (
    options.salaryLadder === false ||
    !config?.enabled ||
    !options.search.resume
  ) {
    return null;
  }
  const target = config.currencies.find((row) => row.code === 'RUB')?.net;
  if (!target) {
    return null;
  }
  const search = options.search;
  const code =
    search.salary === undefined ? 'RUB' : currencyCode(search.currency);
  const rate = rubRate(config, code);
  if (!rate) {
    return null;
  }
  return {
    search:
      search.salary === undefined
        ? { ...search, salary: target, currency: 'RUR', page: 0 }
        : { ...search },
    floorRub: (search.salary ?? target) * rate,
    rate,
  };
};
export const salaryTierSearch = (options, tier = 0) => {
  const start = salaryLadderStart(options);
  if (!start) {
    return options.search;
  }
  return tier === 0
    ? start.search
    : {
        ...start.search,
        salary: Math.ceil(
          Math.max(0, start.floorRub - tier * 50000) / start.rate
        ),
        page: 0,
      };
};
export const salaryTierFloor = (options, tier) => {
  const start = salaryLadderStart(options);
  return start ? Math.max(0, start.floorRub - tier * 50000) : null;
};
export const freshSalaryLadder = (options, now) => {
  const config = options.salaryConfig;
  const start = salaryLadderStart(options);
  if (start && config.exchange && !salaryExchangeFresh(config.exchange, now)) {
    throw jobsFailure(
      'salary-rates-stale',
      'Refresh the salary exchange snapshot before discovery.'
    );
  }
  return start;
};

const advertisedCurrencies = (config) => {
  const byCode = new Map();
  for (const entry of [
    ...salaryOfferCurrencies,
    { code: 'KZT', keywords: ['₸'] },
    ...config.currencies,
    ...(config.exchange?.rates ?? []).map(({ code }) => ({
      code,
      keywords: [],
    })),
  ]) {
    const previous = byCode.get(entry.code);
    byCode.set(entry.code, {
      ...entry,
      keywords: [
        ...new Set([...(previous?.keywords ?? []), ...(entry.keywords ?? [])]),
      ],
    });
  }
  return [...byCode.values()];
};

/** Advertised amounts stay advertised: no assumed gross/net or project conversion. */
export const advertisedMonthlySalary = (text, config) => {
  if (
    typeof text !== 'string' ||
    text.length > 1000 ||
    /(?:за|per)\s+(?:смен|проект|shift|project|day|week)|daily|weekly/iu.test(
      text
    )
  ) {
    return null;
  }
  const annual = /\b(?:annual|yearly)\b|per\s+year|(?:в|за)\s+год|годов/iu.test(
    text
  );
  const adjusted = text
    .replace(/\bup\s+to\b/giu, 'to')
    .replace(
      /\b(?:annual|yearly)\b|per\s+year|(?:в|за)\s+год|годов\p{L}*/giu,
      'per month'
    );
  const currencies = advertisedCurrencies(config);
  const offer = salaryOffer(
    adjusted,
    { currencies },
    { defaultPeriod: 'month' }
  );
  if (!offer || !['month', 'hour'].includes(offer.period)) {
    return null;
  }
  if (offer.period === 'hour' && (!config.monthlyHours || annual)) {
    return null;
  }
  const amount =
    offer.amount *
    (annual ? 1 / 12 : offer.period === 'hour' ? config.monthlyHours : 1);
  const minimumOnly =
    /(?:^|[^\p{L}])(?:from|от)\s*(?=[\d$€£₽])/iu.test(text) &&
    !/(?:[-–—]|\b(?:to|up\s+to)\b|до(?!\p{L}))\s*[\d$€£₽]/iu.test(text);
  return {
    currency: offer.currency,
    amount,
    maximum: minimumOnly ? null : amount,
  };
};
export const assessVacancySalary = (text, config, floorRub) => {
  const unknown = { action: 'apply', reason: 'unknown-pay' };
  if (!config?.enabled) {
    return unknown;
  }
  const offer = advertisedMonthlySalary(text, config);
  if (!offer) {
    return unknown;
  }
  const rate = rubRate(config, offer.currency);
  const target =
    config.currencies.find((row) => row.code === offer.currency)?.net ??
    (rate
      ? config.currencies.find((row) => row.code === 'RUB')?.net / rate
      : null);
  if (target && offer.maximum !== null && offer.maximum < target / 2) {
    return { action: 'exclude', reason: 'below-half-target' };
  }
  if (rate && floorRub !== null && offer.amount * rate < floorRub) {
    return { action: 'defer', reason: 'below-current-tier' };
  }
  return { action: 'apply', reason: 'eligible-pay' };
};
