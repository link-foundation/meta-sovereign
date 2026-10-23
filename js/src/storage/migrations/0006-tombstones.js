/**
 * 0006 — one tombstone shape: `deleted: { at, by, reason }` (R-Z7, R-Z17).
 *
 * Before R-Z7 the app wrote three kinds of "this message is gone" marks:
 * `deleted: true` (Telegram live deletes, a removed chat, Facebook and
 * WhatsApp archives), `{ deleted: true, deletedAt }` (the in-app message
 * delete) and `deleted: { at, by, reason }` (soft-delete.js). Now only the
 * last is written.
 *
 * Mapped from stored fields only:
 * - `deleted: true` becomes `{ at: null, by: 'unknown', reason: null }`
 *   (the time and cause were never stored; nothing is invented);
 * - `{ deleted: true, deletedAt }` (or a bare `deletedAt`) becomes
 *   `{ at: deletedAt, by: 'user', reason: 'deleted-in-app' }` and loses
 *   `deletedAt`, the only writer was the in-app delete;
 * - an object missing `at`, `by` or `reason` gets them as `null` /
 *   'unknown'; other keys stay;
 * - `false` / `null` are not tombstones and stay; any other value (text,
 *   number, list) is kept untouched and counted (`unknown`).
 * Idempotent: a complete `{ at, by, reason }` is a fixed point.
 */

export const id = '0006-tombstones';
export const from = 5;
export const to = 6;
export const description =
  'Tombstones: deleted: true, deletedAt and partial objects become deleted: { at, by, reason }.';

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasMark = (link) =>
  (link.deleted !== undefined && link.deleted !== null) ||
  link.deletedAt !== undefined;

// The normalized link, `null` when it is not a tombstone, or
// `{ unknown: true }` for a value this migration does not understand.
const normalized = (link) => {
  const { deletedAt, ...rest } = link;
  const mark = link.deleted;
  const at = typeof deletedAt === 'string' ? deletedAt : null;
  if (mark === false || ((mark === undefined || mark === null) && !at)) {
    return null;
  }
  if (mark === true || mark === undefined || mark === null) {
    const user = at !== null;
    return {
      ...rest,
      deleted: {
        at,
        by: user ? 'user' : 'unknown',
        reason: user ? 'deleted-in-app' : null,
      },
    };
  }
  if (!isObject(mark)) {
    return { unknown: true };
  }
  return {
    ...rest,
    deleted: {
      ...mark,
      at: mark.at ?? at,
      by: mark.by ?? 'unknown',
      reason: mark.reason ?? null,
    },
  };
};

export const up = async (ctx) => {
  let converted = 0;
  let unknown = 0;
  await ctx.scan({ where: hasMark }, async (batch) => {
    const out = [];
    for (const link of batch) {
      const next = normalized(link);
      if (next?.unknown) {
        unknown += 1;
      } else if (next) {
        out.push(next);
      }
    }
    converted += await ctx.putMany(out);
  });
  ctx.log('tombstones', { converted, unknown });
};
