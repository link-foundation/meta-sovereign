import { SCHEMA_ID, versionOf } from './core.js';
import { applicationLimitPrefix } from '../../jobs/application-limit-data.js';

export const id = '0018-application-limits';
export const from = 17;
export const to = 18;
export const description =
  'Reserve private HH workspace application-limit deadlines and document observations.';
export const up = async (ctx) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({ prefix: applicationLimitPrefix }, async (batch) => {
    if (batch.length) {
      throw Object.assign(
        new Error('Application-limit namespace is already in use'),
        { code: 'APPLICATION_LIMIT_COLLISION' }
      );
    }
  });
};
