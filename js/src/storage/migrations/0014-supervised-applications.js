import { SCHEMA_ID, versionOf } from './core.js';

export const id = '0014-supervised-applications';
export const from = 13;
export const to = 14;
export const description =
  'Reserve the opt-in supervised application setting without changing acknowledged intent.';

export const up = async (ctx) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({ prefix: 'secret:jobs-application:' }, async (batch) => {
    if (batch.some((row) => Object.hasOwn(row.options ?? {}, 'supervised'))) {
      throw Object.assign(
        new Error('Supervised application setting is already in use'),
        {
          code: 'APPLICATION_SUPERVISED_COLLISION',
        }
      );
    }
  });
};
