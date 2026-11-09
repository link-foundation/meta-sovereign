// Values are independent, owner-supplied monthly targets. Calculations require
// an explicitly selected method and configured tax/rate snapshots.
import { normalizeSalaryCalculation } from './salary-calculation-config.js';
import { resolveSalaryAmount } from './salary-calculation.js';
const fail = (message) => {
  throw new Error(`salary ${message}`);
};
const positive = (value, field, max = 1e12) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > max
  ) {
    fail(`${field} must be a positive finite number up to ${max}`);
  }
  return value;
};
const grossSettings = (entry) => {
  const result = {};
  if (entry.grossMethod !== undefined) {
    if (!['explicit', 'personal', 'company'].includes(entry.grossMethod)) {
      fail('unknown gross calculation method');
    }
    result.grossMethod = entry.grossMethod;
  }
  if (entry.grossStep !== undefined) {
    result.grossStep = positive(entry.grossStep, 'grossStep');
  }
  return result;
};
const currency = (entry) => {
  if (!/^[A-Z][A-Z0-9]{2,9}$/u.test(entry?.code ?? '')) {
    fail('currency needs a code of 3 to 10 uppercase letters or digits');
  }
  if (
    !Array.isArray(entry.keywords) ||
    !entry.keywords.length ||
    entry.keywords.length > 20 ||
    entry.keywords.some(
      (word) => typeof word !== 'string' || !word.trim() || word.length > 200
    )
  ) {
    fail('currency needs 1 to 20 nonempty keywords of at most 200 characters');
  }
  const result = {
    code: entry.code,
    keywords: [...new Set(entry.keywords.map((word) => word.trim()))],
  };
  for (const basis of ['net', 'gross']) {
    if (entry[basis] !== undefined && entry[basis] !== null) {
      result[basis] = positive(entry[basis], basis);
    }
  }
  result.hourlyStep = positive(
    entry.hourlyStep ?? (entry.code === 'RUB' ? 500 : 5),
    'hourlyStep'
  );
  return { ...result, ...grossSettings(entry) };
};
export const normalizeSalary = (input) => {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (
    !Array.isArray(input.currencies) ||
    !input.currencies.length ||
    input.currencies.length > 10
  ) {
    fail('needs 1 to 10 currencies');
  }
  const currencies = input.currencies.map(currency);
  if (
    new Set(currencies.map((entry) => entry.code)).size !== currencies.length
  ) {
    fail('currency codes must be unique');
  }
  const defaultCurrency = input.defaultCurrency ?? null;
  if (
    defaultCurrency !== null &&
    !currencies.some((entry) => entry.code === defaultCurrency)
  ) {
    fail('default currency must be configured');
  }
  const defaultBasis = input.defaultBasis ?? 'net';
  if (!['net', 'gross'].includes(defaultBasis)) {
    fail('default basis must be net or gross');
  }
  return {
    enabled: input.enabled === true,
    approved: input.approved === true,
    defaultCurrency,
    defaultBasis,
    monthlyHours:
      input.monthlyHours === null
        ? null
        : positive(input.monthlyHours ?? 160, 'monthlyHours', 744),
    currencies,
    ...normalizeSalaryCalculation(input),
  };
};
export const salaryAmount = (config, entry, basis, period) =>
  resolveSalaryAmount(config, entry, basis, period).amount;
export const formatSalary = (amount, code) => {
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
    .format(amount)
    .replaceAll(',', ' ');
  return code === 'USD'
    ? `$${number}`
    : `${number} ${{ RUB: '₽', EUR: '€' }[code] ?? code}`;
};
