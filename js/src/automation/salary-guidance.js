import { normalizeAnswerEnvironment } from './question-context.js';
import { salaryOffer, statesSalaryPay } from './salary-offer.js';
import { resolveSalaryAmount } from './salary-calculation.js';
import { formatSalary } from './salary-config.js';

const offeredPay = (input, config) => {
  const environment = normalizeAnswerEnvironment(input);
  if (statesSalaryPay(environment.intro, config)) {
    return {
      source: 'form-intro',
      offer: salaryOffer(environment.intro, config),
    };
  }
  const { pay, evidence } = environment.vacancy;
  return {
    source: 'vacancy-pay',
    evidence,
    offer: salaryOffer(pay, config, { defaultPeriod: 'month' }),
  };
};
const inPeriod = (offer, period, hours) => {
  const hourly =
    offer.period === 'month'
      ? offer.amount / hours
      : offer.period === 'lesson'
        ? offer.amount / offer.durationHours
        : offer.amount;
  return period === 'month' ? hourly * hours : hourly;
};
const unit = (selection, period = selection.period, basis = selection.basis) =>
  selection.language === 'ru'
    ? `в ${period === 'hour' ? 'час' : 'месяц'}${basis ? (basis === 'net' ? ' на руки' : ' до вычета налогов') : ''}`
    : `${basis ? `${basis} ` : ''}per ${period === 'hour' ? 'hour' : 'month'}`;
const words = (value, comfortable, selection, basis) => {
  const amount = formatSalary(value, selection.currency);
  const rate = formatSalary(comfortable, selection.currency);
  return selection.language === 'ru'
    ? `Минимум — ${amount} ${unit(selection, selection.period, basis)}. Комфортная ставка — ${rate} ${unit(selection, 'hour')}.`
    : `Minimum: ${amount} ${unit(selection, selection.period, basis)}. Comfortable rate: ${rate} ${unit(selection, 'hour')}.`;
};
const round = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
const offerEvidence = (offer, evidence) => ({
  offered: offer.amount,
  offeredPeriod: offer.period,
  basis: offer.basis,
  ...(offer.durationHours ? { durationHours: offer.durationHours } : {}),
  ...(evidence ? { evidence } : {}),
});
const compatibleOffer = (offer, selection) =>
  offer &&
  offer.currency === selection.currency &&
  offer.basis === selection.basis;
const comfortableRate = (input, config, selection, entry) =>
  entry?.[selection.basis === 'net' ? 'hourlyNet' : 'hourlyGross'] ??
  resolveSalaryAmount(config, entry, selection.basis, 'hour', {
    now: input.now,
  }).amount;

/** Vacancy-specific proposals always need review; never change stored targets. */
export const salaryGuidance = (input, config, selection, entry, resolved) => {
  if (!config.vacancyGuidance || !resolved.amount || !config.monthlyHours) {
    return null;
  }
  const comfortable = comfortableRate(input, config, selection, entry);
  if (!comfortable) {
    return null;
  }
  const { offer, source, evidence } = offeredPay(input, config);
  const offered = compatibleOffer(offer, selection)
    ? round(inPeriod(offer, selection.period, config.monthlyHours))
    : null;
  const lower = offered > 0 && offered < resolved.amount;
  const minimum = lower ? offered : resolved.amount;
  const basis = lower ? offer.basis : selection.basis;
  return {
    text: words(minimum, comfortable, selection, basis),
    amount: minimum,
    source: lower ? source : 'owner-target',
    minimum,
    comfortable,
    monthlyHours: config.monthlyHours,
    ...(lower ? offerEvidence(offer, evidence) : {}),
  };
};
