import { reserveApplicationField } from './application-field.js';

export const id = '0015-popup-application-recovery';
export const from = 14;
export const to = 15;
export const description =
  'Reserve acknowledged unsent native popup checkpoints without changing legacy dispatch reservations.';
export const up = (ctx) =>
  reserveApplicationField(ctx, {
    to,
    key: 'popupReview',
    option: false,
    code: 'APPLICATION_POPUP_COLLISION',
  });
