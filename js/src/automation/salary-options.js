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
    return values[0] <= values[1] ? { low: values[0], high: values[1] } : null;
  }
  const value = values[0];
  if (/свыше|более|больше|\b(?:over|above|more)\b|>/iu.test(text)) {
    return { low: value, high: Infinity, lowOpen: true };
  }
  if (/\b(?:under|below|less)\b|меньше|</iu.test(text)) {
    return { low: 0, high: value, highOpen: true };
  }
  if (/\b(?:up to|to)\b|до/iu.test(text)) {
    return { low: 0, high: value };
  }
  if (/\b(?:from|at least)\b|от|не менее/iu.test(text)) {
    return { low: value, high: Infinity };
  }
  return { low: value, high: value };
};
const contains = (band, target) =>
  (band.lowOpen ? target > band.low : target >= band.low) &&
  (band.highOpen ? target < band.high : target <= band.high);
const compatibleRanges = (choices, selection, config) =>
  choices.flatMap((choice) => {
    if (
      typeof choice !== 'string' ||
      choice.length > 2000 ||
      unknownSalaryCurrency(choice, config)
    ) {
      return [];
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
      return [];
    }
    const band = range(choice);
    return band ? [{ ...band, choice }] : [];
  });
export const salaryOption = (choices, targets, selection, config, closest) => {
  if (!Array.isArray(choices) || choices.length > 100) {
    return null;
  }
  const bands = compatibleRanges(choices, selection, config);
  const matches = bands.filter((band) =>
    targets.every((target) => contains(band, target))
  );
  if (matches.length) {
    return matches.length === 1
      ? { choice: matches[0].choice, contained: true }
      : null;
  }
  // Conflicting bases need one containing range even in a reviewed form.
  if (!closest || targets.length !== 1 || !bands.length) {
    return null;
  }
  const target = targets[0];
  const distance = (band) => Math.max(band.low - target, target - band.high, 0);
  const minimum = Math.min(...bands.map(distance));
  const nearest = bands.filter((band) => distance(band) === minimum);
  return nearest.length === 1
    ? { choice: nearest[0].choice, contained: false }
    : null;
};
