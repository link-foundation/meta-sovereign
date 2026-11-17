import { validateVacancySearch } from '../../js/src/jobs/search-result.js';
import { discoveryCard } from './discovery-fixture.mjs';

export const ladderSalary = {
  enabled: true,
  approved: true,
  defaultCurrency: 'RUB',
  monthlyHours: 160,
  currencies: [
    { code: 'RUB', net: 450000, keywords: ['руб'] },
    { code: 'USD', net: 6000, keywords: ['dollars'] },
    { code: 'EUR', net: 5500, keywords: ['euros'] },
  ],
  exchange: {
    base: 'RUB',
    asOf: '2026-11-17',
    maxAgeDays: 365,
    source: 'manual',
    rates: { USD: 80, EUR: 90, KZT: 0.16 },
  },
};
export const ladderSearch = (url) => {
  const parsed = new URL(url);
  const page = Number(parsed.searchParams.get('page'));
  const floor = Number(parsed.searchParams.get('salary'));
  const cards =
    floor === 450000 && page === 0
      ? [
          discoveryCard(801, { salary: 'from 400000 ₽ per month' }),
          discoveryCard(802, { salary: 'до 200000 ₽' }),
          discoveryCard(803, { salary: '' }),
          discoveryCard(804, { salary: 'from $6000', responded: true }),
        ]
      : [];
  const next = new URL(url);
  next.searchParams.set('page', String(page + 1));
  return validateVacancySearch(
    {
      url,
      cards,
      empty: cards.length === 0,
      next: floor === 450000 && page === 0 ? next.href : null,
    },
    url
  );
};
