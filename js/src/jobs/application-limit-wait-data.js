import { applicationFailure } from './application-options.js';

export const applicationWaitId = (id) =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/u.test(id);
export const applicationLimitWaitData = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    !applicationWaitId(value.id) ||
    !['waiting', 'refreshing', 'review', 'stopped', 'refused'].includes(
      value.phase
    ) ||
    typeof value.until !== 'string' ||
    value.until.length > 40 ||
    !Number.isFinite(Date.parse(value.until)) ||
    new Date(value.until).toISOString() !== value.until ||
    !(
      value.code === null ||
      (typeof value.code === 'string' && value.code.length <= 100)
    )
  ) {
    throw applicationFailure('unconfirmed');
  }
  return {
    id: value.id,
    phase: value.phase,
    until: value.until,
    code: value.code,
  };
};
