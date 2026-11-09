import { normalizeSalary, formatSalary } from './salary-config.js';
import { resolveSalaryAmount } from './salary-calculation.js';
import { salaryQuestion } from './salary-question.js';
import { salaryOption } from './salary-options.js';
import { rejectedAnswer } from './question-policy.js';

const wording = (value, selection) => {
  const { language, basis, period } = selection;
  if (language === 'ru') {
    return `От ${value} в ${period === 'hour' ? 'час' : 'месяц'} ${basis === 'net' ? 'на руки' : 'до вычета налогов'}.`;
  }
  return `From ${value} ${basis} per ${period === 'hour' ? 'hour' : 'month'}.`;
};
const resolvedWording = (resolved, selection) => {
  if (!resolved.amounts) {
    return wording(
      formatSalary(resolved.amount, selection.currency),
      selection
    );
  }
  const gross = wording(
    formatSalary(resolved.amounts.gross, selection.currency),
    { ...selection, basis: 'gross' }
  ).slice(0, -1);
  const net = formatSalary(resolved.amounts.net, selection.currency);
  return `${gross} (${net} ${selection.language === 'ru' ? 'на руки' : 'net'}).`;
};
const resolveSelection = (config, entry, selection, now) => {
  const resolve = (basis) =>
    resolveSalaryAmount(config, entry, basis, selection.period, { now });
  if (selection.basis !== 'both') {
    return resolve(selection.basis);
  }
  const net = resolve('net');
  const gross = resolve('gross');
  if (!net.amount || !gross.amount) {
    return net.amount ? gross : net;
  }
  return {
    amounts: { net: net.amount, gross: gross.amount },
    ...(gross.calculation ? { calculation: gross.calculation } : {}),
  };
};
const missingField = (selection, config, entry) => {
  if (!entry) {
    return 'salary_currency';
  }
  if (selection.basis === 'ambiguous' || selection.period === 'ambiguous') {
    return 'salary_basis_period';
  }
  if (selection.period === 'hour' && !config.monthlyHours) {
    return 'salary_monthly_hours';
  }
  return `salary_${selection.basis}_${entry.code.toLowerCase()}`;
};
const plainPay = (text) => {
  const stripped = text
    .replace(/\{\{salary_[a-z0-9_]+\}\}/gu, '')
    .replace(/[\d\s.,₽$€+\-–—/()]/gu, '')
    .replace(
      /руб\S*|тыс\S*|млн\S*|доллар\S*|евро|на|руки|от|до|вычета|налогов|в|час\S*|месяц\S*|чистыми|гросс|from|net|gross|per|month\S*|hour\S*|before|after|tax\S*|RUB|USD|EUR|USDT/giu,
      ''
    );
  return !stripped.trim();
};
const salaryContexts = (previous, selection) => [
  ...(previous.contexts ?? []).filter(
    (entry) => entry.key !== 'salary_currency'
  ),
  selection.context,
];
const salaryDetails = (selection, resolved) => ({
  currency: selection.currency,
  basis: selection.basis,
  period: selection.period,
  ...(resolved.amount ? { amount: resolved.amount } : {}),
  ...(resolved.amounts ? { amounts: resolved.amounts } : {}),
  ...(resolved.calculation ? { calculation: resolved.calculation } : {}),
});
const selectedOption = (choices, amount, selection, config) =>
  amount ? (salaryOption(choices, amount, selection, config) ?? '') : '';
const salaryResult = (question, input, previous, config, selection) => {
  const entry = config.currencies.find(
    (item) => item.code === selection.currency
  );
  const resolved = resolveSelection(config, entry, selection, input.now);
  const { amount } = resolved;
  const hasAmount = Boolean(amount || resolved.amounts);
  const missing = hasAmount
    ? []
    : [resolved.missing ?? missingField(selection, config, entry)];
  let text = hasAmount
    ? resolvedWording(resolved, selection)
    : `{{${missing[0]}}}`;
  let optionMismatch = false;
  if (hasAmount && input.options?.length) {
    text = selectedOption(input.options, amount, selection, config);
    optionMismatch = !text;
  }
  const rejected = Boolean(rejectedAnswer(text, input.policy));
  return {
    question,
    text: rejected ? '' : text,
    match: 'salary',
    complete: missing.length === 0 && !optionMismatch && !rejected,
    requiresReview:
      !config.approved || missing.length > 0 || optionMismatch || rejected,
    missing,
    rules: [],
    contexts: salaryContexts(previous, selection),
    salary: salaryDetails(selection, resolved),
    ...(optionMismatch ? { optionMismatch: true } : {}),
  };
};
export const applySalaryAnswer = (question, input, previous) => {
  const config = normalizeSalary(input.salary);
  if (!config?.enabled) {
    return previous;
  }
  const selection = salaryQuestion(question, config, input);
  if (!selection) {
    return previous;
  }
  // A personal explanation belongs to its author; changing the numeric target
  // cannot silently approve stale details in that explanation.
  if (previous.text && !plainPay(previous.text)) {
    return /\d/u.test(previous.text)
      ? { ...previous, requiresReview: true }
      : previous;
  }
  return salaryResult(question, input, previous, config, selection);
};
