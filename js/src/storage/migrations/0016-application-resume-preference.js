import { reserveApplicationField } from './application-field.js';

export const id = '0016-application-resume-preference';
export const from = 15;
export const to = 16;
export const description =
  'Reserve private observed application CV choices without rewriting legacy journals or dispatch reservations.';
export const up = (ctx) =>
  reserveApplicationField(ctx, {
    to,
    key: 'resumePreference',
    option: false,
    code: 'APPLICATION_RESUME_PREFERENCE_COLLISION',
  });
