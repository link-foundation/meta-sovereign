import { assignmentFailure } from './validation.js';

/** Optional for older snapshots; preserve real observations without inventing dates. */
export const vacancyHistory = (value) => {
  const history = {};
  for (const name of ['firstSeenAt', 'lastSeenAt']) {
    if (value[name] !== undefined) {
      if (
        typeof value[name] !== 'string' ||
        value[name].length > 40 ||
        !Number.isFinite(Date.parse(value[name]))
      ) {
        throw assignmentFailure(
          'vacancy-invalid',
          'The saved vacancy has invalid observation times.'
        );
      }
      history[name] = value[name];
    }
  }
  return history;
};

/** A cached read is not a new observation. Only call after a successful provider read. */
export const observedVacancyHistory = (before, current) => ({
  firstSeenAt: before?.firstSeenAt ?? before?.capturedAt ?? current.capturedAt,
  lastSeenAt: current.capturedAt,
});
