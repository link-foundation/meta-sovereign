import { reserveApplicationField } from './application-field.js';

export const id = '0019-application-limit-drafts';
export const from = 18;
export const to = 19;
export const description =
  'Reserve provenance for native daily-limit drafts without changing legacy intent.';
export const up = (ctx) =>
  reserveApplicationField(ctx, {
    to,
    key: 'draft.limit',
    contains: (row) => row.draft?.limit !== undefined,
    code: 'APPLICATION_LIMIT_DRAFT_COLLISION',
  });
