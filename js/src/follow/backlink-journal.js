import { createHash } from 'node:crypto';
import { publicationId } from '../sources/publication-receipt.js';

export const backlinkIntentId = (plan, chat) =>
  `follow-backlink-intent:${createHash('sha256')
    .update(
      JSON.stringify([
        plan.config.source,
        plan.owner,
        chat,
        plan.config.backlink,
      ])
    )
    .digest('hex')}`;

export const saveBacklink = async (store, value) => {
  await store.put(globalThis.structuredClone(value));
  // Persist intent before a write, even for stores with buffered appends.
  await store.flush?.();
};

export const saveBacklinkIntent = (store, plan, row) =>
  saveBacklink(store, {
    id: backlinkIntentId(plan, row.chat),
    kind: 'follow-backlink-intent',
    source: plan.config.source,
    owner: plan.owner,
    chat: row.chat,
    jobId: plan.id,
    row,
  });

export const recoverBacklinkRow = async (store, plan, row) => {
  const old = await store.get(backlinkIntentId(plan, row.chat));
  if (!old) {
    return row;
  }
  // A positive removal receipt permits a later, explicitly reviewed post.
  if (['rejected', 'failed'].includes(old.row?.status)) {
    return row;
  }
  if (['sending', 'unknown'].includes(old.row?.status)) {
    return { ...row, status: 'unknown', code: 'outcome-unknown' };
  }
  // Reuse a confirmed receipt, never send the same backlink again merely
  // because a controller was reopened or an HTTP response was lost.
  if (
    !publicationId(old.row?.messageId) ||
    !Number.isFinite(old.row.sentAt) ||
    !Number.isSafeInteger(old.row.checks)
  ) {
    return { ...row, status: 'unknown', code: 'outcome-unknown' };
  }
  const recovered = {
    ...globalThis.structuredClone(old.row),
    title: row.title,
  };
  if (recovered.cleanup?.status === 'sending') {
    recovered.cleanup.status = 'unknown';
  }
  if (
    recovered.status === 'survived' &&
    recovered.checkedAt < recovered.sentAt + plan.config.monitorMs
  ) {
    recovered.status = 'monitoring';
  }
  return recovered;
};
