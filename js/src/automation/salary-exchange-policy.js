// Network access belongs to the asynchronous boundary, never the pure planner.
import { salaryExchange } from './salary-exchange.js';

const attempts = new WeakMap();
const RETRY_MS = 5 * 60000;
const rateState = ({ exchange, ...value }) => ({
  ...value,
  asOf: exchange?.asOf ?? null,
});

const refresh = async (store, maxAgeDays, dependencies, now) => {
  const attempt = attempts.get(store);
  if (attempt?.pending) {
    const outcome = await attempt.pending;
    const cached = await salaryExchange(store, { maxAgeDays }, dependencies);
    return {
      ...cached,
      ...(outcome.warning ? { warning: outcome.warning } : {}),
    };
  }
  if (attempt && now >= attempt.at && now - attempt.at < RETRY_MS) {
    return {
      ...(await salaryExchange(store, { maxAgeDays }, dependencies)),
      warning: 'refresh-backoff',
    };
  }
  const next = { at: now };
  // Record the in-flight operation before any other caller can start a fetch.
  next.pending = salaryExchange(
    store,
    { maxAgeDays, refresh: true },
    dependencies
  );
  attempts.set(store, next);
  try {
    return await next.pending;
  } finally {
    next.pending = null;
  }
};

export const prepareSalaryExchange = async (
  store,
  salary,
  dependencies = {}
) => {
  if (!salary?.enabled || salary.exchangeMode !== 'cbr') {
    return { salary };
  }
  const valueNow = (dependencies.now ?? Date.now)();
  const now = typeof valueNow === 'number' ? valueNow : Date.parse(valueNow);
  if (!Number.isFinite(now)) {
    throw new Error('salary exchange policy needs a valid clock');
  }
  dependencies = { ...dependencies, now: () => now };
  const maxAgeDays = salary.exchange?.maxAgeDays ?? 7;
  const cached = await salaryExchange(store, { maxAgeDays }, dependencies);
  const value = cached.fresh
    ? cached
    : await refresh(store, maxAgeDays, dependencies, now);
  return {
    salary: { ...salary, exchange: value.exchange ?? undefined },
    rateState: rateState(value),
  };
};

export const withSalaryExchangeEvidence = (answer, rateState) =>
  rateState &&
  (answer.salary ||
    answer.salaryTemplates ||
    answer.parts?.some((part) => part.salary || part.salaryTemplates))
    ? { ...answer, salaryExchange: rateState }
    : answer;
