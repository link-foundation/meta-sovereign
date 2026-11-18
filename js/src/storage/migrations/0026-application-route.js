import { reserveApplicationField } from './application-field.js';

export const id = '0026-application-route';
export const from = 25;
export const to = 26;
export const description =
  'Reserve frozen native application routes while preserving acknowledged reviews, batches and signatures.';

export const up = (ctx) =>
  reserveApplicationField(ctx, {
    to,
    key: 'application route settings',
    prefix: 'secret:jobs-application',
    code: 'APPLICATION_ROUTE_COLLISION',
    contains: (row) => {
      const options =
        (row.id.startsWith('secret:jobs-application-batch:')
          ? row.options?.review
          : row.options) ?? {};
      return ['applyFromVacancyPage', 'applicationSearchUrl'].some((key) =>
        Object.hasOwn(options, key)
      );
    },
  });
