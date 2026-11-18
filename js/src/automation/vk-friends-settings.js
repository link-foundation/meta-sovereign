/** Browser-safe acknowledged policy; priority IDs belong to the owner. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { createStoreQueue } from '../storage/serialized.js';
import { readVkFriendStats } from './vk-friend-stats.js';
import { emptyLegacyList } from './vk-legacy-lists.js';
import { readAutomationSettings } from './configured-settings.js';

export const VK_FRIENDS_JOB = 'provider-job:vk:friends';
export const VK_FRIENDS_STATE = 'provider-job-state:vk:friends';
export const VK_FRIENDS_PLAN = 'provider-job-plan:vk:friends';
export const MAX_FRIEND_PRIORITY = 10000;
export const serializeVkFriends = createStoreQueue();
export const positiveVkId = (value) => Number.isSafeInteger(value) && value > 0;
export const desktopFriendPolicy = (settings) =>
  ['desktop-ten-percent', 'desktop-configured'].includes(
    settings.acceptancePolicy
  );
export const mutualThresholdPolicy = (settings) =>
  settings.acceptancePolicy === 'desktop-ten-percent';
export const friendCapacity = (settings) =>
  mutualThresholdPolicy(settings) ? 10000 : settings.maxFriends;
const normalizePercentage = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('topPercentMutuals must be a number from 0 to 100');
  }
  return value;
};
export const normalizeVkFriendSettings = (input) => {
  const ranges = {
    everyMinutes: [1, 1440],
    maxFriends: [1, 10000],
    batchSize: [1, 100],
  };
  if (
    typeof input?.enabled !== 'boolean' ||
    !Array.isArray(input.priorityIds) ||
    input.priorityIds.length > MAX_FRIEND_PRIORITY ||
    !input.priorityIds.every(positiveVkId)
  ) {
    throw new Error(
      'enabled and up to 10000 positive numeric priorityIds required'
    );
  }
  const settings = { enabled: input.enabled };
  if (input.acceptancePolicy !== undefined) {
    if (
      !['ranked-batch', 'desktop-ten-percent', 'desktop-configured'].includes(
        input.acceptancePolicy
      )
    ) {
      throw new Error(
        'ranked-batch, desktop-ten-percent or desktop-configured acceptancePolicy required'
      );
    }
    settings.acceptancePolicy = input.acceptancePolicy;
  }
  if (input.topPercentMutuals !== undefined) {
    settings.topPercentMutuals = normalizePercentage(input.topPercentMutuals);
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) {
      throw new Error(`${key} must be an integer from ${min} to ${max}`);
    }
    settings[key] = input[key];
  }
  return { ...settings, priorityIds: [...new Set(input.priorityIds)] };
};
export const readVkFriendSettings = async (store) => {
  const saved = (await readAutomationSettings(store, VK_FRIENDS_JOB)) ?? {
    enabled: false,
    everyMinutes: 20,
    maxFriends: 10000,
    batchSize: 23,
    priorityIds: [],
  };
  return normalizeVkFriendSettings({
    ...saved,
    priorityIds: legacyFriendPriority(saved.priorityIds),
  });
};
// Old Lino settings used null/empty text/an empty bare-key object or a numeric
// singleton. Normalize only persisted reads; preserve invalid populated shapes
// for strict refusal rather than silently dropping potentially protected users.
export const legacyFriendPriority = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  emptyLegacyList(value)
    ? []
    : positiveVkId(value)
      ? [value]
      : value;
export const readVkFriends = async (store, time = Date.now()) => {
  const last = await store.get(VK_FRIENDS_STATE);
  return {
    ok: true,
    statistics: await readVkFriendStats(store, time),
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
