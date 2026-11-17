import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { observeInitialFriendCount } from './vk-friend-stats.js';
import { loadSettings, optOutEntry } from './safety.js';
import { vkSafetyTarget } from './vk-safety-target.js';
import {
  VK_FRIENDS_STATE as STATE,
  VK_FRIENDS_PLAN as PLAN,
  readVkFriendSettings,
  readVkFriends,
  desktopFriendPolicy,
  friendCapacity,
} from './vk-friends-settings.js';
import {
  observeFriendQuota,
  availableFriendQuota,
  desktopFriendReason,
} from './vk-friend-quota.js';
import {
  refuseFriendAction as refuse,
  friendCredentialIdentity,
  observeFriendReceipt,
  friendPlanReason,
  friendObservationIds,
  readFriendState,
} from './vk-friends-records.js';

export const friendProvider = async (
  resolve,
  optionsFor,
  capability = 'friendSnapshot'
) => {
  const options = await optionsFor();
  const live = resolve('vk')?.live;
  if (!options?.token || typeof live?.[capability] !== 'function') {
    refuse('VK user-token friend API required');
  }
  return { options, live };
};
export const previewVkFriendPlan = async ({
  store,
  provider,
  isStopped,
  now,
  publishFriendStats,
}) => {
  if (isStopped()) {
    refuse('Service stopped');
  }
  const settings = await readVkFriendSettings(store);
  const safety = await loadSettings(store);
  const { options, live } = await provider();
  const last = await store.get(STATE);
  const observeIds = friendObservationIds(last);
  const source = await readFriendState(
    () => live.friendSnapshot({ ...options, ...settings, observeIds }),
    options.token
  );
  await observeInitialFriendCount(store, source.accountId, source.count, now());
  await publishFriendStats?.(source.accountId);
  const previous = new Map();
  for (const userId of new Set([...observeIds, ...source.ids])) {
    previous.set(
      userId,
      await observeFriendReceipt(
        store,
        source.accountId,
        userId,
        source.statuses[userId]
      )
    );
  }
  const quota = desktopFriendPolicy(settings)
    ? await observeFriendQuota(store, source.accountId, source.incoming)
    : null;
  let allowance = quota ? availableFriendQuota(quota) : Infinity;
  let slots = Math.max(0, friendCapacity(settings) - source.count);
  const items = [];
  for (const userId of source.ids) {
    const relation = source.statuses[userId];
    const priority = settings.priorityIds.includes(userId);
    let reason = friendPlanReason({
      userId,
      accountId: source.accountId,
      previous: previous.get(userId),
      relation,
      priority,
      slots,
    });
    if (optOutEntry(safety, vkSafetyTarget(userId))) {
      reason = 'optedOut';
    }
    if (reason === 'eligible') {
      reason = desktopFriendReason(
        { settings, friendCount: source.count },
        { priority, reason, mutualCount: source.mutuals[userId] },
        allowance
      );
    }
    if (reason === 'eligible') {
      slots--;
      if (!priority) {
        allowance--;
      }
    }
    items.push({
      userId,
      priority,
      ...(quota ? { mutualCount: source.mutuals[userId] ?? null } : {}),
      relation,
      action: relation === 2 ? 'accept' : 'request',
      reason,
    });
  }
  await saveAcknowledgedRecord(store, {
    id: PLAN,
    planId: globalThis.crypto.randomUUID(),
    createdAt: now(),
    accountId: source.accountId,
    friendCount: source.count,
    settings,
    ...(quota
      ? {
          quota: {
            observed: quota.seenIds.length,
            reserved: quota.reservations.length,
            available: availableFriendQuota(quota),
          },
        }
      : {}),
    credentialIdentity: await friendCredentialIdentity(options.token),
    items,
    status: 'review',
  });
  return readVkFriends(store, now());
};
