/** Account-bound, acknowledged desktop quota; reading never replenishes it. */
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { desktopFriendPolicy } from './vk-friends-settings.js';
import { refuseFriendAction as refuse } from './vk-friends-records.js';

const quotaId = (account) => `provider-friend-quota:vk:${account}`;
export const readFriendQuota = async (store, account) =>
  (await store.get(quotaId(account))) ?? {
    id: quotaId(account),
    seenIds: [],
    reservations: [],
  };
export const availableFriendQuota = (quota) =>
  Math.max(
    0,
    Math.floor(quota.seenIds.length / 10) - quota.reservations.length
  );
export const observeFriendQuota = async (store, account, incoming) => {
  const quota = await readFriendQuota(store, account);
  const seenIds = [...new Set([...quota.seenIds, ...incoming])];
  // Keep every observed ID, without silently recycling lifetime allowance.
  // Reaching this finite review bound refuses further automation.
  if (seenIds.length > 100000 || quota.reservations.length > 100000) {
    refuse('Desktop friend quota reached its review bound');
  }
  if (seenIds.length !== quota.seenIds.length) {
    await saveAcknowledgedRecord(store, { ...quota, seenIds });
  }
  return { ...quota, seenIds };
};
export const desktopFriendReason = (plan, item, remaining) => {
  if (!desktopFriendPolicy(plan.settings) || item.priority) {
    return item.reason;
  }
  if (plan.friendCount >= plan.settings.maxFriends) {
    return item.mutualCount > 0 ? item.reason : 'noMutual';
  }
  return remaining > 0 ? item.reason : 'quota';
};
export const reserveFriendQuota = async (store, plan, item) => {
  if (!desktopFriendPolicy(plan.settings) || item.priority) {
    return;
  }
  const quota = await readFriendQuota(store, plan.accountId);
  if (quota.reservations.length >= 100000) {
    refuse('Desktop friend quota reached its review bound');
  }
  if (
    plan.friendCount < plan.settings.maxFriends &&
    availableFriendQuota(quota) <= 0
  ) {
    refuse('Desktop friend quota changed; review again');
  }
  await saveAcknowledgedRecord(store, {
    ...quota,
    reservations: [...quota.reservations, `${plan.planId}:${item.userId}`],
  });
};
export const releaseRefusedFriendQuota = async (store, plan, item, result) => {
  if (!desktopFriendPolicy(plan.settings) || result.status !== 'refused') {
    return result;
  }
  const quota = await readFriendQuota(store, plan.accountId);
  const reservation = `${plan.planId}:${item.userId}`;
  if (quota.reservations.includes(reservation)) {
    await saveAcknowledgedRecord(store, {
      ...quota,
      reservations: quota.reservations.filter((key) => key !== reservation),
    });
  }
  return result;
};
