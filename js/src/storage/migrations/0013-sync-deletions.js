import { SYNC_DELETED } from '../sync-deletions.js';
import { SCHEMA_ID, versionOf } from './core.js';

export const id = '0013-sync-deletions';
export const from = 12;
export const to = 13;
export const description =
  'Reserve causal hard-deletion metadata and require compatible peers.';

export const up = async (ctx) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({}, async (batch) => {
    if (batch.some((link) => Object.hasOwn(link, SYNC_DELETED))) {
      throw Object.assign(
        new Error('Causal deletion field is already in use'),
        {
          code: 'SYNC_DELETION_COLLISION',
        }
      );
    }
  });
};
