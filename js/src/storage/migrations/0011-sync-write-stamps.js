import { SYNC_STAMP } from '../../sync/register.js';
import { SCHEMA_ID, versionOf } from './core.js';

export const id = '0011-sync-write-stamps';
export const from = 10;
export const to = 11;
export const description =
  'Reserve immutable winning-write stamps and require compatible synchronization merge rules.';

// No historical timestamp is invented. Existing vectors and records stay as
// written. Refuse a reserved-field collision rather than discard owner data.
export const up = async (ctx) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({}, async (batch) => {
    if (batch.some((link) => Object.hasOwn(link, SYNC_STAMP))) {
      throw Object.assign(
        new Error('Synchronization stamp field is already in use'),
        {
          code: 'SYNC_STAMP_COLLISION',
        }
      );
    }
  });
};
