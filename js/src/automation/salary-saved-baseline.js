import { normalizeSalary } from './salary-config.js';
import {
  recognizedSalaryCurrencies,
  salaryCurrencies,
  unknownSalaryCurrency,
  salaryBasis,
  salaryPeriod,
  stripSalaryCurrencies,
} from './salary-question.js';
import { salaryAmounts } from './salary-options.js';
import { questionKey } from './question-match.js';

export const plainSalaryPay = (text, config) => {
  const stripped = stripSalaryCurrencies(text, config)
    .replace(/\{\{salary_[a-z0-9_]+\}\}/gu, '')
    .replace(
      /(?<!\p{L})(?:up\s+to|at\s+least|(?:or|and)\s+(?:more|above)|(?:more|less)\s+than|between|under|below|over|above|to|and|не\s+менее|(?:и|или)\s+(?:более|выше)|между|свыше|более|больше|выше|менее|меньше|и|thousand|million|[kкmм])(?!\p{L})/giu,
      ''
    )
    .replace(/[\d\s.,₽$€+\-–—/()<>≤≥=]/gu, '')
    .replace(
      /руб\S*|тыс\S*|млн\S*|доллар\S*|евро|на|руки|от|до|вычета|ндфл|налогов|в|час\S*|месяц\S*|ежемесячно|чистыми|гросс|from|net|gross|per|month\S*|hour\S*|before|after|tax\S*|RUB|USD|EUR|USDT/giu,
      ''
    );
  return !stripped.trim();
};
const approvedSaved = (input, previous) =>
  Array.isArray(input.options) &&
  input.options.length > 0 &&
  input.options.length <= 100 &&
  previous.match === 'exact' &&
  previous.complete &&
  !previous.requiresReview &&
  typeof previous.text === 'string' &&
  previous.text.length <= 2000 &&
  !input.options.some(
    (option) =>
      typeof option === 'string' &&
      questionKey(option) === questionKey(previous.text)
  );

/** An approved expanded answer can supply a missing target for numeric choices. */
export const savedSalaryConfiguration = (input, previous) => {
  const configured = normalizeSalary(input.salary);
  if (configured || !approvedSaved(input, previous)) {
    return configured;
  }
  const currencies = recognizedSalaryCurrencies(previous.text);
  if (currencies.length !== 1) {
    return undefined;
  }
  return normalizeSalary({
    enabled: true,
    approved: true,
    monthlyHours: null,
    currencies,
  });
};
export const savedSalaryBaseline = (input, previous, config) => {
  if (
    !approvedSaved(input, previous) ||
    !plainSalaryPay(previous.text, config) ||
    unknownSalaryCurrency(previous.text, config) ||
    /(?<![\p{L}\p{N}])[-−]\s*\d/u.test(previous.text)
  ) {
    return null;
  }
  const currencies = salaryCurrencies(previous.text, config);
  const amounts = salaryAmounts(previous.text);
  const basis = salaryBasis(previous.text) ?? 'net';
  const period = salaryPeriod(previous.text) ?? 'month';
  if (
    currencies.length !== 1 ||
    amounts.length !== 1 ||
    amounts[0] <= 0 ||
    amounts[0] > 1e12 ||
    !['net', 'gross'].includes(basis) ||
    !['month', 'hour'].includes(period)
  ) {
    return null;
  }
  return { currency: currencies[0].code, amount: amounts[0], basis, period };
};
export const resolveSavedSalaryBaseline = (
  baseline,
  selection,
  entry,
  resolved
) => {
  if (
    !baseline ||
    !entry ||
    resolved.amount ||
    resolved.amounts ||
    (selection.basis === 'gross' &&
      entry.grossMethod &&
      entry.grossMethod !== 'explicit') ||
    (resolved.missing &&
      resolved.missing !==
        `salary_${selection.basis}_${entry.code.toLowerCase()}`) ||
    ['currency', 'basis', 'period'].some(
      (key) => baseline[key] !== selection[key]
    )
  ) {
    return resolved;
  }
  return { amount: baseline.amount, baseline: { source: 'saved-answer' } };
};
