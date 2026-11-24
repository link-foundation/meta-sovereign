// Explicit refresh only. Answer planning consumes its own saved snapshot.
import { normalizeSalaryExchange } from './salary-calculation-config.js';
import {
  salaryExchangeFresh,
  SALARY_EXCHANGE_ID,
} from './salary-exchange-state.js';
import { fetchCbrExchange } from './salary-exchange-feed.js';

export { SALARY_EXCHANGE_ID };
const cachedExchange = async (store, maxAgeDays) => {
  const saved = await store.get(SALARY_EXCHANGE_ID);
  if (!saved) {
    return null;
  }
  try {
    const exchange = normalizeSalaryExchange({ ...saved.exchange, maxAgeDays });
    if (
      exchange.source !== 'cbr' ||
      exchange.base !== 'RUB' ||
      !exchange.rates.some(({ code }) => code === 'USD') ||
      !Number.isFinite(Date.parse(saved.fetchedAt))
    ) {
      return null;
    }
    return { exchange, fetchedAt: saved.fetchedAt };
  } catch {
    return null;
  }
};
const result = (saved, now, origin, warning) => {
  const fresh = Boolean(saved && salaryExchangeFresh(saved.exchange, now));
  return {
    status: !saved
      ? 'unavailable'
      : !fresh
        ? 'stale'
        : origin === 'network'
          ? 'updated'
          : 'cached',
    fresh,
    origin,
    exchange: saved?.exchange ?? null,
    fetchedAt: saved?.fetchedAt ?? null,
    ...(warning ? { warning } : {}),
  };
};

export const salaryExchange = async (store, input = {}, dependencies = {}) => {
  const maxAgeDays = input.maxAgeDays ?? 7;
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
    throw new Error('salary exchange maximum age must be 1 to 365 days');
  }
  const now = (dependencies.now ?? Date.now)();
  const cached = await cachedExchange(store, maxAgeDays);
  if (input.refresh !== true) {
    return result(cached, now, 'cache');
  }
  let exchange;
  try {
    exchange = { ...(await fetchCbrExchange(dependencies)), maxAgeDays };
    if (
      Date.parse(exchange.asOf) > now + 86400000 ||
      (cached && exchange.asOf < cached.exchange.asOf)
    ) {
      return result(cached, now, 'cache', 'feed-date-rejected');
    }
  } catch {
    return result(cached, now, 'cache', 'fetch-failed');
  }
  const saved = { exchange, fetchedAt: new Date(now).toISOString() };
  // A failed write must not be reported as a persisted successful refresh.
  await store.put({ id: SALARY_EXCHANGE_ID, ...saved });
  return result(saved, now, 'network');
};
