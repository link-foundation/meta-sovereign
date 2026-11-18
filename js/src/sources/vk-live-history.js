/** Load native context before exposing a peer's first live update. */
import { createStoreQueue } from '../storage/serialized.js';
import { historicalMutation } from '../storage/mutation.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import {
  checkedVkCachePage,
  invalidCacheEvidence,
} from './vk-cache-provider.js';
import { vkLinksOf } from './vk.js';
import { stamp } from './vk-longpoll.js';
import { storeSourceMessages } from './store-messages.js';

const serialize = createStoreQueue();
export const VK_LIVE_HISTORY_WINDOW = 100;
export const createVkLiveHistory = ({
  store,
  log = () => {},
  debug = false,
  now = Date.now,
  assertCurrent = async () => {},
}) => {
  // Separate native clients represent separate credentials. Keep only a small
  // recent working set; eviction safely reloads a context window on demand.
  const clients = new WeakMap();
  return (live, messages, state) =>
    serialize(store, async () => {
      const seen = clients.get(live) ?? new Set();
      clients.set(live, seen);
      const pending = new Set(messages.map((message) => message.id));
      await assertCurrent(live);
      for (const peer of new Set(messages.map((message) => message.chat))) {
        const peerId = Number(peer);
        if (!Number.isSafeInteger(peerId) || peerId === 0) {
          invalidCacheEvidence();
        }
        if (seen.has(peerId)) {
          seen.delete(peerId);
          seen.add(peerId);
          continue;
        }
        const raw = await live.call('messages.getHistory', {
          peer_id: peerId,
          count: VK_LIVE_HISTORY_WINDOW,
          extended: 1,
        });
        await assertCurrent(live);
        const page = checkedVkCachePage({ kind: 'history', peerId }, raw, 0);
        if (
          page.items.length !== Math.min(page.total, VK_LIVE_HISTORY_WINDOW)
        ) {
          invalidCacheEvidence();
        }
        const fresh = [];
        const native = {
          ...raw,
          items: page.items.map((row) => ({ ...row, peer_id: peerId })),
        };
        for (const link of stamp(vkLinksOf(native, peerId))) {
          if (!pending.has(link.id) && !(await store.get(link.id))) {
            fresh.push(link);
          }
        }
        await assertCurrent(live);
        await storeSourceMessages(store, 'vk', fresh, {
          [historicalMutation]: true,
        });
        await assertCurrent(live);
        await saveAcknowledgedRecord(store, {
          id: `vk-live-history:${state.selfId ?? -state.groupId}:${peerId}`,
          tokens: ['vk-live-history'],
          source: 'vk',
          chat: String(peerId),
          status: 'loaded',
          loaded: page.items.length,
          total: page.total,
          complete: page.complete,
          window: VK_LIVE_HISTORY_WINDOW,
          loadedAt: new Date(now()).toISOString(),
        });
        seen.add(peerId);
        if (seen.size > 256) {
          seen.delete(seen.values().next().value);
        }
        if (debug) {
          log({
            event: 'vk_live_history_loaded',
            loaded: page.items.length,
            imported: fresh.length,
            complete: page.complete,
          });
        }
      }
    });
};
