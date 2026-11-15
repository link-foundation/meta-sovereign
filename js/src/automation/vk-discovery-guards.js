import { evidenceHash } from './vk-reengage-evidence.js';
import { requireVkReviewLifetime } from './vk-review-lifetime.js';
import { discoveryPolicies } from './vk-discovery-settings.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import {
  discoveryItemIdentity,
  discoveryEligibility,
} from './vk-discovery-evidence.js';
import { discoveryDate, discoveryPaused } from './vk-discovery-quota.js';
import { friendLedgerId, refuseFriendAction } from './vk-friends-records.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';
const refuse = () =>
  refuseFriendAction(
    'VK discovery evidence, consent or receipt changed; review again'
  );
const lifetime = (context, plan) =>
  requireVkReviewLifetime(
    context,
    plan,
    'VK discovery review stopped or expired'
  );
const policyMatches = async (plan, settings, priority) =>
  (await evidenceHash(settings)) === plan.policyIdentity &&
  (await evidenceHash(plan.settings)) === plan.policyIdentity &&
  (await evidenceHash(priority)) === (await evidenceHash(plan.priorityIds));
const ownPending = (previous, plan, item) =>
  previous?.status === 'pending' &&
  previous.planId === plan.planId &&
  previous.action === plan.kind &&
  previous.signature === item.signature;
export const currentDiscovery = async (
  context,
  plan,
  item,
  original,
  ownIntent = false
) => {
  lifetime(context, plan);
  const settings = await discoveryPolicies[plan.kind].settings(context.store);
  const safety = await loadSettings(context.store);
  const priority = await protectedVkFriends(context.store, settings);
  if (
    !(await policyMatches(plan, settings, priority)) ||
    (await context.optionsFor())?.token !== original.options.token ||
    discoveryDate(context.now()) !== plan.date ||
    priority.includes(item.userId) ||
    optOutEntry(safety, { source: 'vk', chat: item.userId }) ||
    (context.scheduled &&
      (!settings.enabled || quietMsLeft(context.now(), safety))) ||
    (await discoveryPaused(context.store, plan.accountId, context.now()))
  ) {
    refuse();
  }
  const previous = await context.store.get(
    friendLedgerId(plan.accountId, item.userId)
  );
  if (
    ownIntent
      ? !ownPending(previous, plan, item)
      : (await evidenceHash(previous)) !== item.previousFingerprint
  ) {
    refuse();
  }
  lifetime(context, plan);
};
export const guardDiscovery = async (
  context,
  plan,
  item,
  original,
  ownIntent = false
) => {
  await currentDiscovery(context, plan, item, original, ownIntent);
  const fresh = await original.live.discoveryState(plan.kind, item.userId, {
    ...original.options,
    ...plan.settings,
  });
  if (
    fresh.accountId !== plan.accountId ||
    fresh.relation !== item.relation ||
    (await evidenceHash(fresh.profile)) !==
      (await evidenceHash(item.profile)) ||
    fresh.mutualCount !== item.mutualCount ||
    fresh.member !== item.member ||
    discoveryEligibility(plan.kind, fresh, plan.settings) !== 'eligible' ||
    (plan.kind !== 'rejections' &&
      fresh.friendCount >= plan.settings.maxFriends)
  ) {
    refuse();
  }
  await currentDiscovery(context, plan, item, original, ownIntent);
};
export const validateDiscoveryPlan = async (context, plan, kind, original) => {
  lifetime(context, plan);
  if (
    plan.kind !== kind ||
    plan.credentialIdentity !== (await evidenceHash(original.options.token)) ||
    plan.items.filter((item) => item.reason === 'eligible').length >
      plan.settings.limit
  ) {
    refuse();
  }
  const ids = plan.items.map((item) => item.userId);
  if (new Set(ids).size !== ids.length) {
    refuse();
  }
  for (const item of plan.items) {
    if (item.signature !== (await discoveryItemIdentity(plan, item))) {
      refuse();
    }
  }
};
