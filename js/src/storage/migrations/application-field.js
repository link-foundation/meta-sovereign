import { SCHEMA_ID, versionOf } from './core.js';

/** Reserve additive private fields without rewriting any acknowledged intent. */
export const reserveApplicationField = async (
  ctx,
  { to, key, option, code }
) => {
  if (versionOf(await ctx.get(SCHEMA_ID)) >= to) {
    return;
  }
  await ctx.scan({ prefix: 'secret:jobs-application:' }, async (batch) => {
    if (
      batch.some((row) =>
        Object.hasOwn(option ? (row.options ?? {}) : row, key)
      )
    ) {
      throw Object.assign(
        new Error(`Application field ${key} is already in use`),
        { code }
      );
    }
  });
};
