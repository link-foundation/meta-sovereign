import { jobsFailure } from './options.js';

export const applicationLimitMs = 2 * 60 * 60 * 1000;
export const applicationLimitPrefix = 'secret:jobs-application-limit:';
export const applicationLimitId = `${applicationLimitPrefix}hh`;
export const applicationLimitHeld = (application) =>
  application.receipt?.applicationLimit?.active === true ||
  application.queue?.applicationLimit?.active === true;
const iso = (value) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
export const applicationLimitFailure = () => {
  throw jobsFailure(
    'application-limit-journal',
    'The saved HH application pause could not be verified.'
  );
};
export const applicationLimitData = (raw) => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (
    raw.scope !== 'workspace' ||
    !iso(raw.observedAt) ||
    !iso(raw.until) ||
    Date.parse(raw.until) - Date.parse(raw.observedAt) !== applicationLimitMs ||
    typeof raw.active !== 'boolean' ||
    typeof raw.saved !== 'boolean'
  ) {
    applicationLimitFailure();
  }
  return raw;
};
export const readApplicationLimitRow = (raw, id) => {
  if (raw === null || raw === undefined) {
    return null;
  }
  applicationLimitData({ ...raw, active: false, saved: true });
  if (
    raw.id !== id ||
    raw.version !== 1 ||
    typeof raw.documentKey !== 'string' ||
    !raw.documentKey.length ||
    raw.documentKey.length > 100
  ) {
    applicationLimitFailure();
  }
  return raw;
};
