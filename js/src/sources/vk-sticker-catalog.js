import { getSource, liveOptionsFrom } from './index.js';
import { createStoreQueue } from '../storage/serialized.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { evidenceHash } from '../automation/vk-reengage-evidence.js';
import { vkAccountReadGuard } from './vk-read-guard.js';
import { readVkStickerCatalog } from './vk-sticker-read.js';
import {
  catalogId,
  stickerAccount,
  catalogQuery,
  invalidVkCatalog,
} from './vk-sticker-shape.js';
import { inspectVkStickerCatalog } from './vk-sticker-cache.js';
export {
  loadVkStickerCatalog,
  inspectVkStickerCatalog,
} from './vk-sticker-cache.js';
const serialized = createStoreQueue();
const revision = (record) =>
  evidenceHash(record && [record.accountId, record.dataHash, record.updatedAt]);

export const createVkStickerCatalog = ({
  store,
  source = getSource,
  optionsFor = () => liveOptionsFrom(store, 'vk'),
  now = Date.now,
  debug = false,
  log = null,
} = {}) => ({
  inspect: (input) => inspectVkStickerCatalog(store, input),
  refresh: (input) =>
    serialized(store, async () => {
      const accountId = stickerAccount(input);
      catalogQuery(input);
      const original = await store.get(catalogId(accountId));
      const options = await optionsFor();
      const live = source('vk')?.live;
      if (!options.token || !live?.call) {
        throw Object.assign(
          new Error('Connect VK before refreshing its sticker catalog'),
          { code: 'not-connected' }
        );
      }
      const guard = vkAccountReadGuard(optionsFor, options, live, {
        accountId,
      });
      await guard();
      const data = await readVkStickerCatalog(live, options.token);
      await guard();
      const dataHash = await evidenceHash(data);
      if (
        dataHash !==
        (await evidenceHash(await readVkStickerCatalog(live, options.token)))
      ) {
        invalidVkCatalog();
      }
      await guard();
      if (
        (await revision(await store.get(catalogId(accountId)))) !==
        (await revision(original))
      ) {
        invalidVkCatalog();
      }
      await saveAcknowledgedRecord(store, {
        id: catalogId(accountId),
        source: 'vk',
        kind: 'vk-sticker-catalog',
        accountId,
        updatedAt: now(),
        dataHash,
        data,
        tokens: ['vk', 'stickers', 'catalog'],
      });
      if (debug) {
        log?.({
          level: 'debug',
          event: 'vk_sticker_catalog_saved',
          packs: data.packs.length,
          stickers: data.stickers.length,
        });
      }
      return inspectVkStickerCatalog(store, input);
    }),
});
