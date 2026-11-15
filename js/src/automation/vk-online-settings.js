/** Browser-safe persisted configuration and last acknowledged provider outcome. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';

export const VK_ONLINE_JOB = 'provider-job:vk:online';
export const VK_ONLINE_STATE = 'provider-job-state:vk:online';
export const serializeVkOnline = createStoreQueue();
export const readVkOnlineSettings = async (store) => {
  const saved = await store.get(VK_ONLINE_JOB);
  return {
    enabled: saved?.enabled === true,
    everyMinutes:
      Number.isInteger(saved?.everyMinutes) &&
      saved.everyMinutes >= 1 &&
      saved.everyMinutes <= 14
        ? saved.everyMinutes
        : 14,
  };
};
export const readVkOnlineSnapshot = async (store) => {
  const saved = await store.get(VK_ONLINE_STATE);
  return {
    ok: true,
    settings: await readVkOnlineSettings(store),
    last: saved
      ? {
          ...saved,
          status: saved.status === 'pending' ? 'unknown' : saved.status,
        }
      : null,
  };
};

export const loadVkOnline = (store) =>
  serializeVkOnline(store, () => readVkOnlineSnapshot(store));
export const saveVkOnline = (store, input) =>
  serializeVkOnline(store, async () => {
    if (
      typeof input?.enabled !== 'boolean' ||
      !Number.isInteger(input.everyMinutes) ||
      input.everyMinutes < 1 ||
      input.everyMinutes > 14
    ) {
      throw new Error(
        'enabled must be boolean and everyMinutes an integer from 1 to 14'
      );
    }
    await saveAcknowledgedRecord(store, {
      id: VK_ONLINE_JOB,
      enabled: input.enabled,
      everyMinutes: input.everyMinutes,
    });
    return readVkOnlineSnapshot(store);
  });
