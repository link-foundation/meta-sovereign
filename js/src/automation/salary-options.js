import {
  salaryBasis,
  salaryPeriod,
  salaryCurrencies,
  unknownSalaryCurrency,
} from './salary-question.js';

const scale = (value) =>
  /тыс|k/iu.test(value) ? 1000 : /млн|m/iu.test(value) ? 1000000 : 1;
const number = (value) =>
  Number(
    value
      .replaceAll(/[\s\u00a0\u202f]/gu, '')
      .replace(/,(?=\d{3}(?:\D|$))/gu, '')
      .replace(',', '.')
  );
const range = (text) => {
  const parts = [
    ...text.matchAll(
      /(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?)(?:\s*(тыс\.?|млн\.?|[km]))?/giu
    ),
  ];
  if (!parts.length || parts.length > 2) {
    return null;
  }
  const common = scale(parts.at(-1)[2] ?? '');
  const values = parts.map(
    (part) => number(part[1]) * (part[2] ? scale(part[2]) : common)
  );
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }
  if (values.length === 2) {
    return values[0] <= values[1]
      ? (target) => target >= values[0] && target <= values[1]
      : null;
  }
  const value = values[0];
  if (/свыше|более|больше|\b(?:over|above|more)\b|>/iu.test(text)) {
    return (target) => target > value;
  }
  if (/\b(?:under|below|less)\b|меньше|</iu.test(text)) {
    return (target) => target < value;
  }
  if (/\b(?:up to|to)\b|до/iu.test(text)) {
    return (target) => target <= value;
  }
  if (/\b(?:from|at least)\b|от|не менее/iu.test(text)) {
    return (target) => target >= value;
  }
  return (target) => target === value;
};
export const salaryOption = (choices, target, selection, config) => {
  if (!Array.isArray(choices) || choices.length > 100) {
    return null;
  }
  const matches = choices.filter((choice) => {
    if (
      typeof choice !== 'string' ||
      choice.length > 2000 ||
      unknownSalaryCurrency(choice, config)
    ) {
      return false;
    }
    const currencies = salaryCurrencies(choice, config);
    const basis = salaryBasis(choice);
    const period = salaryPeriod(choice);
    if (
      currencies.length > 1 ||
      (currencies.length === 1 && currencies[0].code !== selection.currency) ||
      (basis && basis !== selection.basis) ||
      (period && period !== selection.period)
    ) {
      return false;
    }
    return range(choice)?.(target) === true;
  });
  return matches.length === 1 ? matches[0] : null;
};
