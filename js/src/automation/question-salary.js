import {
  normalizeSalary,
  salaryAmount,
  formatSalary,
} from './salary-config.js';
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
const salaryResult = (question, input, previous, config, selection) => {
  const entry = config.currencies.find(
    (item) => item.code === selection.currency
  );
  const amount = salaryAmount(config, entry, selection.basis, selection.period);
  const missing = amount ? [] : [missingField(selection, config, entry)];
  let text = amount
    ? wording(formatSalary(amount, entry.code), selection)
    : `{{${missing[0]}}}`;
  let optionMismatch = false;
  if (amount && input.options?.length) {
    text = salaryOption(input.options, amount, selection, config) ?? '';
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
    salary: {
      currency: selection.currency,
      basis: selection.basis,
      period: selection.period,
      ...(amount ? { amount } : {}),
    },
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
