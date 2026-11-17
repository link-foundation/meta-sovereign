import {
  salaryBasis,
  salaryPeriod,
  salaryCurrencies,
  stripSalaryCurrencies,
  unknownSalaryCurrency,
} from './salary-question.js';

const scale = (value) =>
  /^(?:млн|million|m|м)/iu.test(value) ? 1000000 : 1000;
const number = (value) => {
  const raw = value.replaceAll(/[ \u00a0\u202f]/gu, '');
  return Number(
    /^\d{1,3}(?:[.,]\d{3})+$/u.test(raw)
      ? raw.replaceAll(/[.,]/gu, '')
      : raw.replace(',', '.')
  );
};
const boundary = (text, value) => {
  if (
    /(?:>=|≥)|(?<!\p{L})(?:from|at\s+least|от|не\s+менее|(?:or|and)\s+(?:more|above)|(?:и|или)\s+(?:более|выше))(?!\p{L})/iu.test(
      text
    )
  ) {
    return { low: value, high: Infinity };
  }
  if (/(?:<=|≤)|(?<!\p{L})(?:up\s+to|to|до)(?!\p{L})/iu.test(text)) {
    return { low: 0, high: value };
  }
  if (
    />|(?<!\p{L})(?:over|above|more\s+than|свыше|более|больше|выше)(?!\p{L})/iu.test(
      text
    )
  ) {
    return { low: value, high: Infinity, lowOpen: true };
  }
  if (
    /<|(?<!\p{L})(?:under|below|less\s+than|менее|меньше)(?!\p{L})/iu.test(text)
  ) {
    return { low: 0, high: value, highOpen: true };
  }
  return { low: value, high: value };
};
const rangeSeparator = (text, parts, config) => {
  const firstEnd = parts[0].index + parts[0][0].length;
  const separator = stripSalaryCurrencies(
    text.slice(firstEnd, parts[1].index),
    config
  )
    .replaceAll('.', ' ')
    .trim();
  const prefix = stripSalaryCurrencies(text.slice(0, parts[0].index), config);
  return (
    /^(?:[-–—−]|до|to)$/iu.test(separator) ||
    (/^(?:and|и)$/iu.test(separator) &&
      /(?:\bbetween|между)\s*$/iu.test(prefix))
  );
};
const range = (text, config) => {
  if (
    /(?<!\p{L})(?:not|except|excluding|кроме|не(?!\s+менее))(?!\p{L})/iu.test(
      text
    )
  ) {
    return null;
  }
  const parts = [
    ...text.matchAll(
      /(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)*)(?:\s*(тыс\.?|млн\.?|million|thousand|[kкmм])(?!\p{L}))?/giu
    ),
  ];
  if (!parts.length || parts.length > 2) {
    return null;
  }
  const scales = new Set(
    parts.filter((part) => part[2]).map((part) => scale(part[2]))
  );
  const common = scales.size === 1 ? [...scales][0] : 1;
  const values = parts.map((part) => {
    const value = number(part[1]);
    return value * (part[2] ? scale(part[2]) : value < 1000 ? common : 1);
  });
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }
  if (values.length === 2) {
    return values[0] <= values[1] && rangeSeparator(text, parts, config)
      ? { low: values[0], high: values[1] }
      : null;
  }
  return boundary(text, values[0]);
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
    const band = range(choice, config);
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
