import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { discoveryPolicies } from './vk-discovery-settings.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import { loadSettings, optOutEntry } from './safety.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import {
  observeFriendReceipt,
  uncertainFriendAction,
  refuseFriendAction,
  readFriendState,
} from './vk-friends-records.js';
import {
  discoveryItemIdentity,
  discoveryEligibility,
} from './vk-discovery-evidence.js';
import {
  discoveryDate,
  readDiscoveryQuota,
  discoveryPaused,
} from './vk-discovery-quota.js';
const reasonFor = (plan, item, previous, safety, remaining, paused) => {
  if (item.userId === plan.accountId) {
    return 'owner';
  }
  if (
    plan.priorityIds.includes(item.userId) ||
    optOutEntry(safety, { source: 'vk', chat: item.userId })
  ) {
    return 'protected';
  }
  if (uncertainFriendAction(previous)) {
    return 'unknown';
  }
  if (previous?.status === 'confirmed' && !previous.settled) {
    return 'unsettled';
  }
  if (paused) {
    return 'paused';
  }
  const eligible = discoveryEligibility(plan.kind, item, plan.settings);
  if (eligible !== 'eligible') {
    return eligible;
  }
  if (
    plan.kind !== 'rejections' &&
    plan.friendCount >= plan.settings.maxFriends
  ) {
    return 'capacity';
  }
  return remaining > 0 ? 'eligible' : 'runLimit';
};
export const previewVkDiscovery = async (context, kind) => {
  if (context.isStopped()) {
    refuseFriendAction('Service stopped');
  }
  const policy = discoveryPolicies[kind];
  const settings = await policy.settings(context.store);
  const original = await context.provider();
  const source = await readFriendState(
    () =>
      original.live.discoverySnapshot(kind, {
        ...original.options,
        ...settings,
      }),
    original.options.token
  );
  const plan = {
    id: policy.keys.plan,
    planId: globalThis.crypto.randomUUID(),
    status: 'review',
    createdAt: context.now(),
    date: discoveryDate(context.now()),
    kind,
    accountId: source.accountId,
    friendCount: source.friendCount,
    total: source.total,
    complete: source.complete,
    offset: source.offset,
    settings,
    policyIdentity: await evidenceHash(settings),
    credentialIdentity: await evidenceHash(original.options.token),
    priorityIds: await protectedVkFriends(context.store, settings),
    items: [],
  };
  const safety = await loadSettings(context.store);
  const quota = await readDiscoveryQuota(
    context.store,
    plan.accountId,
    plan.date
  );
  const paused = await discoveryPaused(
    context.store,
    plan.accountId,
    context.now()
  );
  let remaining = Math.min(
    settings.limit,
    kind === 'rejections'
      ? Infinity
      : Math.max(0, 40 - quota.reservations.length)
  );
  plan.dailyRemaining = Math.max(0, 40 - quota.reservations.length);
  for (const candidate of source.items) {
    const previous = await observeFriendReceipt(
      context.store,
      plan.accountId,
      candidate.userId,
      candidate.relation
    );
    const item = {
      ...candidate,
      action: kind === 'rejections' ? 'reject' : 'request',
      previousFingerprint: await evidenceHash(previous),
    };
    item.reason = reasonFor(plan, item, previous, safety, remaining, paused);
    if (item.reason === 'eligible') {
      remaining--;
    }
    item.signature = await discoveryItemIdentity(plan, item);
    plan.items.push(item);
  }
  await saveAcknowledgedRecord(context.store, plan);
  return policy.read(context.store);
};
