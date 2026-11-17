import { normalizeSalary, formatSalary } from './salary-config.js';
import { resolveSalaryAmount } from './salary-calculation.js';
import { salaryQuestion } from './salary-question.js';
import {
  plainSalaryPay,
  savedSalaryConfiguration,
  savedSalaryBaseline,
  resolveSavedSalaryBaseline,
} from './salary-saved-baseline.js';
import { salaryOption, salaryAmounts } from './salary-options.js';
import { questionKey } from './question-match.js';
import { rejectedAnswer } from './question-policy.js';
import { salaryGuidance } from './salary-guidance.js';
import { salaryWording } from './salary-wording.js';

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
  ...(resolved.baseline ? { baseline: resolved.baseline } : {}),
});
const salaryContent = (input, config, selection, entry, resolved, guidance) => {
  const { amount } = resolved;
  const hasAmount = Boolean(amount || resolved.amounts);
  const missing = hasAmount
    ? []
    : [resolved.missing ?? missingField(selection, config, entry)];
  let text = hasAmount
    ? (guidance?.text ?? resolvedWording(resolved, selection))
    : `{{${missing[0]}}}`;
  let optionMismatch = false;
  let option = null;
  if (hasAmount && input.options?.length) {
    option = salaryOption(
      input.options,
      resolved.amounts ? Object.values(resolved.amounts) : [amount],
      selection,
      config,
      input.questionMode === 'field'
    );
    text = option?.choice ?? '';
    optionMismatch = !text;
  }
  return { missing, text, optionMismatch, option };
};
const salaryNeedsReview = ({
  config,
  guidance,
  option,
  missing,
  optionMismatch,
  rejected,
  wording,
}) =>
  !config.approved ||
  wording?.requiresReview === true ||
  Boolean(guidance) ||
  option?.contained === false ||
  missing.length > 0 ||
  optionMismatch ||
  rejected;
const savedAmountConflict = (input, previous, resolved) => {
  if (
    input.questionMode === 'field' ||
    !input.options?.length ||
    previous.match !== 'exact' ||
    previous.requiresReview ||
    input.options.some(
      (option) => questionKey(option) === questionKey(previous.text)
    )
  ) {
    return false;
  }
  const targets = resolved.amounts
    ? Object.values(resolved.amounts)
    : [resolved.amount];
  const saved = salaryAmounts(previous.text);
  return saved.some((value) => !targets.includes(value));
};
const salaryResult = (
  question,
  input,
  previous,
  config,
  selection,
  baseline
) => {
  const entry = config.currencies.find(
    (item) => item.code === selection.currency
  );
  let resolved = resolveSavedSalaryBaseline(
    baseline,
    selection,
    entry,
    resolveSelection(config, entry, selection, input.now)
  );
  const guidance = salaryGuidance(input, config, selection, entry, resolved);
  if (guidance) {
    resolved = { ...resolved, amount: guidance.amount };
  }
  if (savedAmountConflict(input, previous, resolved)) {
    return {
      ...previous,
      text: '',
      complete: false,
      requiresReview: true,
      salary: {
        ...salaryDetails(selection, resolved),
        savedAmountConflict: true,
      },
    };
  }
  const { missing, text, optionMismatch, option } = salaryContent(
    input,
    config,
    selection,
    entry,
    resolved,
    guidance
  );
  const wording =
    !missing.length && !guidance
      ? salaryWording(question, input, previous, selection)
      : null;
  const selectedText = wording?.text ?? text;
  const rejected = Boolean(rejectedAnswer(selectedText, input.policy));
  return {
    question,
    text: rejected ? '' : selectedText,
    match: 'salary',
    complete: missing.length === 0 && !optionMismatch && !rejected,
    requiresReview: salaryNeedsReview({
      config,
      guidance,
      option,
      missing,
      optionMismatch,
      rejected,
      wording,
    }),
    missing,
    rules: wording ? [wording.rule] : [],
    contexts: salaryContexts(previous, selection),
    salary: {
      ...salaryDetails(selection, resolved),
      ...(option ? { option } : {}),
      ...(guidance ? { guidance } : {}),
    },
    ...(optionMismatch ? { optionMismatch: true } : {}),
  };
};
export const isSalaryRequest = (question, input) => {
  const config = normalizeSalary(input.salary);
  return Boolean(config?.enabled && salaryQuestion(question, config, input));
};
export const applySalaryAnswer = (question, input, previous) => {
  const config = savedSalaryConfiguration(input, previous);
  if (!config?.enabled) {
    return previous;
  }
  const baseline = savedSalaryBaseline(input, previous, config);
  const selection = salaryQuestion(question, config, input, baseline?.currency);
  if (!selection) {
    return previous;
  }
  // A personal explanation belongs to its author; changing the numeric target
  // cannot silently approve stale details in that explanation.
  if (previous.text && !plainSalaryPay(previous.text, config)) {
    const literal = previous.salaryTemplates
      ? previous.salaryTemplates.literalNumbers
      : /\d/u.test(previous.text);
    return literal ? { ...previous, requiresReview: true } : previous;
  }
  return salaryResult(question, input, previous, config, selection, baseline);
};
