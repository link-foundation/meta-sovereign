import { SCHEMA_ID, versionOf } from './core.js';
import { applicationPacingPrefix } from '../../jobs/application-pacing-data.js';

export const id = '0020-application-pacing';
export const from = 19;
export const to = 20;
export const description =
  'Reserve private HH application pacing and native outcome statistics.';
export const up = async (ctx) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({ prefix: applicationPacingPrefix }, async (batch) => {
    if (batch.length) {
      throw Object.assign(
        new Error('Application-pacing namespace is already in use'),
        {
          code: 'APPLICATION_PACING_COLLISION',
        }
      );
    }
  });
};
