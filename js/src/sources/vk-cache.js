import { getSource, liveOptionsFrom } from './index.js';
import {
  cacheRequest,
  cacheId,
  inspectVkCache,
  VK_CACHE_TTL,
  checkedCacheRecord,
  cacheRevision,
} from './vk-cache-shape.js';
import {
  readVkCachePage,
  cachePageHash,
  invalidCacheEvidence,
} from './vk-cache-provider.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';

const queues = new WeakMap();
const exclusive = (store, action) => {
  const next = (queues.get(store) ?? Promise.resolve()).then(action, action);
  queues.set(
    store,
    next.catch(() => {})
  );
  return next;
};
const accountGuard = (optionsFor, options, live, request) => async () => {
  if ((await optionsFor()).token !== options.token) {
    invalidCacheEvidence();
  }
  const self = await live.call('users.get', {}, options.token);
  if (
    !Array.isArray(self) ||
    self.length !== 1 ||
    self[0]?.id !== request.accountId
  ) {
    invalidCacheEvidence();
  }
  if ((await optionsFor()).token !== options.token) {
    invalidCacheEvidence();
  }
};

const newCacheRecord = (request, headHash, now) => ({
  id: cacheId(request),
  kind: 'vk-cache',
  source: 'vk',
  accountId: request.accountId,
  peerId: request.peerId,
  cacheKind: request.kind,
  pages: [],
  count: 0,
  nextOffset: 0,
  complete: false,
  headHash,
  startedAt: now(),
  tokens: ['vk', 'cache', request.kind],
});

const checkStablePage = async (live, options, request, record, got, head) => {
  if (got.total !== head.total) {
    invalidCacheEvidence();
  }
  if (
    request.kind === 'history' &&
    record.lastId !== undefined &&
    got.items.length &&
    got.items[0].id >= record.lastId
  ) {
    invalidCacheEvidence();
  }
  if (
    (await cachePageHash(await readVkCachePage(live, options, request, 0))) !==
    record.headHash
  ) {
    invalidCacheEvidence();
  }
};

const advance = (record, request, got, ref, at) => ({
  ...record,
  pages: [...record.pages, ref],
  count: record.count + got.items.length,
  total: got.total,
  nextOffset: got.complete ? null : ref.offset + got.items.length,
  complete: got.complete,
  updatedAt: at,
  expiresAt:
    VK_CACHE_TTL[request.kind] === null
      ? null
      : at + VK_CACHE_TTL[request.kind],
  ...(request.kind === 'history' && got.items.length
    ? { lastId: got.items.at(-1).id }
    : {}),
});

const tracePage = (debug, log, request, offset, got) => {
  if (debug) {
    log?.({
      level: 'debug',
      event: 'vk_cache_page',
      cacheKind: request.kind,
      offset,
      count: got.items.length,
      complete: got.complete,
    });
  }
};
export const createVkCache = ({
  store,
  source = getSource,
  optionsFor = () => liveOptionsFrom(store, 'vk'),
  now = Date.now,
  debug = false,
  log = null,
} = {}) => {
  const inspect = (input) => inspectVkCache(store, input, now());
  const refresh = (input) =>
    exclusive(store, async () => {
      const request = cacheRequest(input);
      const options = await optionsFor();
      const live = source('vk')?.live;
      if (!options.token || !live?.call) {
        throw Object.assign(
          new Error('Connect VK before refreshing its cache'),
          { code: 'not-connected' }
        );
      }
      const guard = accountGuard(optionsFor, options, live, request);
      await guard();
      const id = cacheId(request);
      const original = checkedCacheRecord(await store.get(id), request);
      let record = original;
      const fresh = !record || request.restart || record.complete;
      const head = await readVkCachePage(live, options, request, 0);
      const headHash = await cachePageHash(head);
      if (!fresh && record.headHash !== headHash) {
        invalidCacheEvidence();
      }
      if (fresh) {
        record = newCacheRecord(request, headHash, now);
      }
      for (let page = 0; page < request.maxPages; page++) {
        const offset = record.nextOffset;
        const got =
          offset === 0
            ? head
            : await readVkCachePage(live, options, request, offset);
        await checkStablePage(live, options, request, record, got, head);
        await guard();
        const hash = await cachePageHash(got.items);
        const pageId = `${id}:page:${offset}:${hash}`;
        await saveAcknowledgedRecord(store, {
          id: pageId,
          kind: 'vk-cache-page',
          source: 'vk',
          accountId: request.accountId,
          peerId: request.peerId,
          items: got.items,
          tokens: ['vk', 'cache', 'page'],
        });
        await guard();
        const current = await store.get(id);
        if (
          (await cacheRevision(current)) !==
          (await cacheRevision(page === 0 ? original : record))
        ) {
          invalidCacheEvidence();
        }
        record = advance(
          record,
          request,
          got,
          { id: pageId, offset, hash },
          now()
        );
        await saveAcknowledgedRecord(store, record);
        tracePage(debug, log, request, offset, got);
        if (got.complete) {
          break;
        }
      }
      return inspect(request);
    });
  return { inspect, refresh };
};
