import { applicationPacingId } from '../../js/src/jobs/application-pacing-data.js';

/** Only the opt-in, isolated fixture may advance its finite synthetic clock. */
export const applicationPacingControl = (fixture, clock) => async (req) => {
  if (req.method !== 'POST' || req.url !== '/pace-expire') {
    return null;
  }
  const row = await fixture.store.get(applicationPacingId);
  if (!row) {
    throw new Error('The finite fixture has no saved pacing cycle.');
  }
  clock.value = Date.parse(row.nextAt);
  return { now: clock.value, liveProvider: false };
};
