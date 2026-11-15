/** Browser-safe acknowledged policy; priority IDs belong to the owner. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';

export const VK_FRIENDS_JOB = 'provider-job:vk:friends';
export const VK_FRIENDS_STATE = 'provider-job-state:vk:friends';
export const VK_FRIENDS_PLAN = 'provider-job-plan:vk:friends';
export const serializeVkFriends = createStoreQueue();
export const positiveVkId = (value) => Number.isSafeInteger(value) && value > 0;
export const normalizeVkFriendSettings = (input) => {
  const ranges = {
    everyMinutes: [1, 1440],
    maxFriends: [1, 10000],
    batchSize: [1, 100],
  };
  if (
    typeof input?.enabled !== 'boolean' ||
    !Array.isArray(input.priorityIds) ||
    input.priorityIds.length > 100 ||
    !input.priorityIds.every(positiveVkId)
  ) {
    throw new Error(
      'enabled and up to 100 positive numeric priorityIds required'
    );
  }
  const settings = { enabled: input.enabled };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
      throw new Error(`${key} must be an integer from ${min} to ${max}`);
    }
    settings[key] = input[key];
  }
  return { ...settings, priorityIds: [...new Set(input.priorityIds)] };
};
export const readVkFriendSettings = async (store) => {
  const saved = await store.get(VK_FRIENDS_JOB);
  return normalizeVkFriendSettings(
    saved ?? {
      enabled: false,
      everyMinutes: 20,
      maxFriends: 10000,
      batchSize: 23,
      priorityIds: [],
    }
  );
};
export const readVkFriends = async (store) => {
  const last = await store.get(VK_FRIENDS_STATE);
  return {
    ok: true,
    settings: await readVkFriendSettings(store),
    plan: await store.get(VK_FRIENDS_PLAN),
    last: last
      ? { ...last, status: last.status === 'pending' ? 'unknown' : last.status }
      : null,
  };
};
export const loadVkFriends = (store) =>
  serializeVkFriends(store, () => readVkFriends(store));
export const saveVkFriends = (store, input) =>
  serializeVkFriends(store, async () => {
    await saveAcknowledgedRecord(store, {
      id: VK_FRIENDS_JOB,
      ...normalizeVkFriendSettings(input),
    });
    return readVkFriends(store);
  });
