import { reserveApplicationField } from './application-field.js';

export const id = '0014-supervised-applications';
export const from = 13;
export const to = 14;
export const description =
  'Reserve the opt-in supervised application setting without changing acknowledged intent.';

export const up = (ctx) =>
  reserveApplicationField(ctx, {
    to,
    key: 'supervised',
    option: true,
    code: 'APPLICATION_SUPERVISED_COLLISION',
  });
