import { createHash } from 'node:crypto';
import { backlinkError } from './backlink-shape.js';
import { saveBacklink } from './backlink-journal.js';

const active = new WeakMap();
const idOf = (review) =>
  `follow-join-intent:${createHash('sha256')
    .update(JSON.stringify([review.source, review.owner, review.url]))
    .digest('hex')}`;
export const followJoinState = async (store, review) => {
  const before = await store.get(idOf(review));
  return ['sending', 'unknown', 'pending'].includes(before?.status)
    ? {
        status: 'unknown',
        code: 'outcome-unknown',
        ...(before.chat ? { chat: before.chat } : {}),
      }
    : { status: 'ready' };
};
export const journalFollowJoin = async (store, review, use) => {
  const id = idOf(review);
  const locks = active.get(store) ?? new Set();
  active.set(store, locks);
  if (locks.has(id)) {
    return { status: 'unknown', code: 'busy' };
  }
  locks.add(id);
  try {
    const before = await followJoinState(store, review);
    if (before.status !== 'ready') {
      return before;
    }
    const intent = {
      id,
      kind: 'follow-join-intent',
      source: review.source,
      owner: review.owner,
      url: review.url,
      status: 'sending',
    };
    await saveBacklink(store, intent);
    let result;
    try {
      result = await use();
    } catch (error) {
      result = { status: 'unknown', ...backlinkError(error, { write: true }) };
    }
    await saveBacklink(store, { ...intent, ...result });
    return result;
  } finally {
    locks.delete(id);
  }
};
