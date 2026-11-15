import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import {
  VK_FRIENDS_STATE as STATE,
  VK_FRIENDS_PLAN as PLAN,
  readVkFriendSettings,
  readVkFriends,
} from './vk-friends-settings.js';
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
}) => {
  if (isStopped()) {
    refuse('Service stopped');
  }
  const settings = await readVkFriendSettings(store);
  const { options, live } = await provider();
  const last = await store.get(STATE);
  const observeIds = friendObservationIds(last);
  const source = await readFriendState(
    () => live.friendSnapshot({ ...options, ...settings, observeIds }),
    options.token
  );
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
  let slots = Math.max(0, settings.maxFriends - source.count);
  const items = [];
  for (const userId of source.ids) {
    const relation = source.statuses[userId];
    const priority = settings.priorityIds.includes(userId);
    const reason = friendPlanReason({
      userId,
      accountId: source.accountId,
      previous: previous.get(userId),
      relation,
      priority,
      slots,
    });
    if (reason === 'eligible') {
      slots--;
    }
    items.push({
      userId,
      priority,
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
    credentialIdentity: await friendCredentialIdentity(options.token),
    items,
    status: 'review',
  });
  return readVkFriends(store);
};
