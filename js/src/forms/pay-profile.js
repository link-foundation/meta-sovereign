import {
  salaryOffer,
  salaryOfferCurrencies,
} from '../automation/salary-offer.js';

/** Explicit owner profile values supply reviewed drafts, never approval. */
export const formPayProfile = (profile) => {
  const currencies = salaryOfferCurrencies;
  const target = salaryOffer(profile.salary, { currencies });
  if (!target || target.period !== 'month' || !target.basis) {
    return undefined;
  }
  const rate = salaryOffer(profile.rate, { currencies });
  const hours =
    profile.salary_monthly_hours === undefined
      ? 168
      : Number(profile.salary_monthly_hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 744) {
    return undefined;
  }
  const compatible =
    rate &&
    rate.currency === target.currency &&
    rate.basis === target.basis &&
    rate.period === 'hour';
  return {
    enabled: true,
    approved: false,
    vacancyGuidance: true,
    defaultCurrency: target.currency,
    defaultBasis: target.basis,
    monthlyHours: hours,
    currencies: [
      {
        code: target.currency,
        keywords: [target.currency],
        [target.basis]: target.amount,
        hourlyStep: 1,
        ...(compatible
          ? {
              [target.basis === 'net' ? 'hourlyNet' : 'hourlyGross']:
                rate.amount,
            }
          : {}),
      },
    ],
  };
};
