// Salary fields come from the same dated calculations as direct answers.
import { normalizeSalary, formatSalary } from './salary-config.js';
import { resolveSalaryAmount } from './salary-calculation.js';
import { salaryQuestion } from './salary-question.js';

const reserved = /^salary_(?:net|gross)(?:_hourly)?(?:_[a-z0-9]+)?$/u;
export const answerTemplateEnvironment = (question, input) => {
  const profile = { ...input.profile };
  const config = normalizeSalary(input.salary);
  const fields = new Map();
  if (!config) {
    return { profile, fields, approved: true };
  }
  for (const key of Object.keys(profile)) {
    if (reserved.test(key)) {
      delete profile[key];
    }
  }
  if (!config.enabled) {
    return { profile, fields, approved: false };
  }
  const selected = salaryQuestion(question, config, input);
  const currency = selected ? selected.currency : config.defaultCurrency;
  for (const entry of config.currencies) {
    for (const basis of ['net', 'gross']) {
      for (const period of ['month', 'hour']) {
        const key = `salary_${basis}${period === 'hour' ? '_hourly' : ''}`;
        const resolved = resolveSalaryAmount(config, entry, basis, period, {
          now: input.now,
        });
        const value = {
          currency: entry.code,
          basis,
          period,
          ...resolved,
        };
        for (const field of [
          `${key}_${entry.code.toLowerCase()}`,
          ...(currency === entry.code ? [key] : []),
        ]) {
          fields.set(field, value);
          if (resolved.amount) {
            profile[field] = formatSalary(resolved.amount, entry.code);
          }
        }
      }
    }
  }
  return { profile, fields, approved: config.approved, selected };
};

export const salaryTemplateEvidence = (text, environment) => {
  const keys = [...text.matchAll(/\{\{(salary_[a-z0-9_]+)\}\}/gu)].map(
    (match) => match[1]
  );
  if (!keys.length) {
    return undefined;
  }
  return {
    approved: environment.approved,
    contextMismatch: Boolean(
      environment.selected &&
      keys.some((key) => {
        const field = environment.fields.get(key);
        return (
          field?.currency !== environment.selected.currency ||
          field?.period !== environment.selected.period
        );
      })
    ),
    literalNumbers: /\d/u.test(text.replace(/\{\{[^{}]+\}\}/gu, '')),
    fields: [...new Set(keys)].map((key) => ({
      key,
      ...(environment.fields.get(key) ?? { missing: key }),
    })),
  };
};
