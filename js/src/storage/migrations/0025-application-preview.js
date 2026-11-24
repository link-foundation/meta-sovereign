import { SCHEMA_ID, versionOf } from './core.js';

export const id = '0025-application-preview';
export const from = 24;
export const to = 25;
export const description =
  'Reserve optional frozen vacancy preview timing without rewriting acknowledged review or batch signatures.';

export const up = async (ctx) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({ prefix: 'secret:jobs-application' }, async (batch) => {
    if (
      batch.some((row) =>
        Object.hasOwn(
          (row.id.startsWith('secret:jobs-application-batch:')
            ? row.options?.review
            : row.options) ?? {},
          'vacancyPreviewSeconds'
        )
      )
    ) {
      throw Object.assign(
        new Error('Vacancy preview timing is already in use'),
        {
          code: 'APPLICATION_PREVIEW_COLLISION',
        }
      );
    }
  });
};
