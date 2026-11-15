/** Reviewed friend cleanup/cancellation share scheduling and relationship receipts. */
import { createVkFriendsJob } from './vk-friends.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import {
  maintenanceKeys,
  readVkMaintenanceSettings,
  readVkMaintenance,
  protectedVkFriends,
} from './vk-maintenance-settings.js';
import {
  equalFriendPolicy as equal,
  refuseFriendAction as refuse,
  friendCredentialIdentity,
  observeFriendReceipt,
  uncertainFriendAction,
  friendObservationIds,
  readFriendState,
} from './vk-friends-records.js';
import {
  performVkFriendAction,
  runVkFriendBatch,
} from './vk-friend-delivery.js';
export {
  loadVkMaintenance,
  saveVkMaintenance,
} from './vk-maintenance-settings.js';

const eligibleDeactivation = (value) => ['banned', 'deleted'].includes(value);
const reasonFor = (item, accountId, priorityIds, previous, remaining, kind) => {
  if (item.userId === accountId) {
    return 'owner';
  }
  if (priorityIds.includes(item.userId)) {
    return 'protected';
  }
  if (uncertainFriendAction(previous)) {
    return 'unknown';
  }
  if (previous?.status === 'confirmed' && !previous.settled) {
    return 'unsettled';
  }
  if (kind === 'cleanup' && !eligibleDeactivation(item.deactivated)) {
    return 'active';
  }
  return remaining > 0 ? 'eligible' : 'limitReached';
};
const previewMaintenance = async (context, kind) => {
  const { store, provider, isStopped, now } = context;
  if (isStopped()) {
    refuse('Service stopped');
  }
  const keys = maintenanceKeys(kind);
  const settings = await readVkMaintenanceSettings(store, kind);
  const priorityIds = await protectedVkFriends(store, settings);
  const { live, options } = await provider();
  const last = await store.get(keys.state);
  const observeIds = friendObservationIds(last);
  const source = await readFriendState(
    () =>
      live.maintenanceSnapshot(kind, {
        ...options,
        ...settings,
        observeIds,
      }),
    options.token
  );
  for (const [userId, relation] of Object.entries(source.observed)) {
    await observeFriendReceipt(
      store,
      source.accountId,
      Number(userId),
      relation
    );
  }
  let remaining = settings.limit;
  const items = [];
  for (const item of source.items) {
    const previous = await observeFriendReceipt(
      store,
      source.accountId,
      item.userId,
      item.relation
    );
    const reason = reasonFor(
      item,
      source.accountId,
      priorityIds,
      previous,
      remaining,
      kind
    );
    if (reason === 'eligible') {
      remaining--;
    }
    items.push({
      ...item,
      reason,
      action: kind === 'cleanup' ? 'remove' : 'cancel',
    });
  }
  await saveAcknowledgedRecord(store, {
    id: keys.plan,
    planId: globalThis.crypto.randomUUID(),
    kind,
    createdAt: now(),
    accountId: source.accountId,
    settings,
    priorityIds,
    items,
    credentialIdentity: await friendCredentialIdentity(options.token),
    status: 'review',
  });
  return readVkMaintenance(store, kind);
};
const currentMaintenance = async (context, plan, original) => {
  if (
    context.isStopped() ||
    !equal(
      plan.settings,
      await readVkMaintenanceSettings(context.store, plan.kind)
    ) ||
    !equal(
      plan.priorityIds,
      await protectedVkFriends(context.store, plan.settings)
    ) ||
    (await context.optionsFor())?.token !== original.options.token
  ) {
    refuse('VK maintenance policy, account or consent changed; review again');
  }
};
const guardMaintenance = async (context, plan, item, original) => {
  await currentMaintenance(context, plan, original);
  const fresh = await original.live.maintenanceState(
    item.userId,
    original.options
  );
  if (
    fresh.accountId !== plan.accountId ||
    fresh.relation !== item.relation ||
    (plan.kind === 'cleanup' &&
      (!eligibleDeactivation(fresh.deactivated) ||
        fresh.deactivated !== item.deactivated))
  ) {
    refuse('VK account, relationship or deactivation changed; review again');
  }
  await currentMaintenance(context, plan, original);
};
const applyMaintenance = async (context, plan, kind) => {
  const original = await context.provider();
  if (
    plan.kind !== kind ||
    context.now() - plan.createdAt > 300000 ||
    context.now() < plan.createdAt ||
    plan.credentialIdentity !==
      (await friendCredentialIdentity(original.options.token))
  ) {
    refuse('VK maintenance plan expired or account changed; review again');
  }
  await currentMaintenance(context, plan, original);
  return runVkFriendBatch(context, plan, {
    stateKey: maintenanceKeys(kind).state,
    pace: kind === 'cleanup' ? 5000 : 3000,
    event: `vk_${kind}_batch`,
    read: (store) => readVkMaintenance(store, kind),
    perform: (item) =>
      performVkFriendAction(context, plan, item, original, {
        intentDetails: { action: kind, expectedRelation: 0 },
        issue: (beforeIssue) =>
          original.live.removeFriend(
            item.userId,
            kind,
            original.options,
            beforeIssue
          ),
        beforeIssue: () => guardMaintenance(context, plan, item, original),
      }),
  });
};
export const createVkMaintenanceJob = ({ kind, ...options }) => {
  const keys = maintenanceKeys(kind);
  return createVkFriendsJob({
    ...options,
    profile: {
      state: keys.state,
      plan: keys.plan,
      capability: 'maintenanceSnapshot',
      settings: (store) => readVkMaintenanceSettings(store, kind),
      read: (store) => readVkMaintenance(store, kind),
      preview: (context) => previewMaintenance(context, kind),
      apply: (context, plan) => applyMaintenance(context, plan, kind),
      failureEvent: `vk_${kind}_batch_failed`,
    },
  });
};
