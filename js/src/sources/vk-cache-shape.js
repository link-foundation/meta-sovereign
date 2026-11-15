/** Account-scoped read caches; expiry never deletes a person's archive. */
import {
  invalidCacheEvidence,
  ownedCachePage,
  cachePageHash,
} from './vk-cache-provider.js';
export const VK_CACHE_KINDS = [
  'history',
  'conversation',
  'friends',
  'profile',
  'friend-count',
];
const DAY = 86400000;
export const VK_CACHE_TTL = {
  history: 30 * DAY,
  conversation: null,
  friends: 14 * DAY,
  profile: DAY / 24,
  'friend-count': 1080 * DAY,
};
const positive = (value) =>
  Number.isSafeInteger(value) && value > 0 && value < 2000000000;
const validPeer = (kind, peerId) => {
  if (kind === 'friends') {
    return true;
  }
  if (['profile', 'friend-count'].includes(kind)) {
    return positive(peerId);
  }
  return Number.isSafeInteger(peerId) && peerId !== 0;
};
export const cacheRequest = (input = {}) => {
  const accountId = Number(input.accountId);
  const peerId = Number(input.peerId);
  const maxPages = input.maxPages ?? 5;
  if (
    !positive(accountId) ||
    !VK_CACHE_KINDS.includes(input.kind) ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 50 ||
    !validPeer(input.kind, peerId) ||
    (input.restart !== undefined && typeof input.restart !== 'boolean')
  ) {
    throw Object.assign(new Error('Invalid VK cache request'), {
      code: 'bad-request',
    });
  }
  return {
    accountId,
    peerId: input.kind === 'friends' ? 0 : peerId,
    kind: input.kind,
    maxPages,
    restart: input.restart === true,
  };
};
export const cacheId = ({ accountId, peerId, kind }) =>
  `vk-cache:${accountId}:${kind}:${peerId}`;
const validProgress = (record) => {
  const ttl = VK_CACHE_TTL[record.cacheKind];
  return (
    typeof record.complete === 'boolean' &&
    (record.complete
      ? record.nextOffset === null && record.count === record.total
      : record.nextOffset === record.count && record.count < record.total) &&
    /^[a-f0-9]{64}$/u.test(record.headHash) &&
    Number.isFinite(record.startedAt) &&
    Number.isFinite(record.updatedAt) &&
    (ttl === null
      ? record.expiresAt === null
      : record.expiresAt === record.updatedAt + ttl)
  );
};
const validReferences = (record) =>
  record.pages.every(
    (ref, i) =>
      Number.isSafeInteger(ref.offset) &&
      (i === 0 ? ref.offset === 0 : ref.offset > record.pages[i - 1].offset) &&
      /^[a-f0-9]{64}$/u.test(ref.hash) &&
      ref.id === `${record.id}:page:${ref.offset}:${ref.hash}`
  );
export const checkedCacheRecord = (record, request) => {
  if (!record) {
    return null;
  }
  if (
    record.id !== cacheId(request) ||
    record.accountId !== request.accountId ||
    record.peerId !== request.peerId ||
    record.cacheKind !== request.kind ||
    !Array.isArray(record.pages) ||
    record.pages.length === 0 ||
    !Number.isSafeInteger(record.count) ||
    record.count < 0 ||
    !Number.isSafeInteger(record.total) ||
    record.total < record.count ||
    !validProgress(record) ||
    !validReferences(record)
  ) {
    invalidCacheEvidence();
  }
  return record;
};
export const cacheRevision = (record) =>
  cachePageHash(
    record &&
      Object.fromEntries(
        [
          'accountId',
          'peerId',
          'cacheKind',
          'pages',
          'headHash',
          'startedAt',
          'updatedAt',
          'count',
          'total',
          'nextOffset',
          'complete',
          'expiresAt',
          'lastId',
        ].map((key) => [key, record[key]])
      )
  );
export const cacheSummary = (record, now = Date.now()) =>
  record && {
    ...record,
    stale: record.expiresAt !== null && now >= record.expiresAt,
  };
export const inspectVkCache = async (store, input, now) => {
  const request = cacheRequest(input);
  const cache = cacheSummary(
    checkedCacheRecord(await store.get(cacheId(request)), request),
    now
  );
  const pageOffset = input.pageOffset ?? 0;
  if (!Number.isSafeInteger(pageOffset) || pageOffset < 0) {
    throw new Error('Invalid cached page');
  }
  const ref = cache?.pages.find((page) => page.offset === pageOffset);
  if (cache && !ref) {
    invalidCacheEvidence();
  }
  return {
    ok: true,
    cache,
    items: ref ? await ownedCachePage(store, request, ref) : [],
    pageOffset,
    nextPage:
      cache?.pages.find((entry) => entry.offset > pageOffset)?.offset ?? null,
  };
};
