import { evidenceHash } from './vk-reengage-evidence.js';
export const discoveryItemIdentity = (plan, item) =>
  evidenceHash({
    planId: plan.planId,
    createdAt: plan.createdAt,
    accountId: plan.accountId,
    kind: plan.kind,
    date: plan.date,
    policy: plan.policyIdentity,
    credential: plan.credentialIdentity,
    priority: plan.priorityIds,
    userId: item.userId,
    profile: item.profile,
    relation: item.relation,
    mutualCount: item.mutualCount ?? null,
    member: item.member ?? null,
    reason: item.reason,
    action: item.action,
    previous: item.previousFingerprint,
  });
const communityEligibility = (item, settings) => {
  if (!item.member) {
    return 'changed';
  }
  const profile = item.profile;
  if (
    (settings.onlineOnly && !profile.online) ||
    (settings.photoRequired && !profile.hasPhoto) ||
    (settings.openOnly && !profile.open) ||
    (settings.sex && profile.sex !== settings.sex)
  ) {
    return 'filtered';
  }
  return 'eligible';
};
export const discoveryEligibility = (kind, item, settings) => {
  if (kind === 'rejections') {
    if (item.relation !== 2) {
      return 'changed';
    }
    return ['banned', 'deleted'].includes(item.profile.deactivated)
      ? 'eligible'
      : 'active';
  }
  if (item.relation !== 0) {
    return 'existing';
  }
  const profile = item.profile;
  if (
    profile.deactivated ||
    !profile.canSee ||
    !profile.canWrite ||
    !profile.canRequest ||
    !profile.accessible
  ) {
    return 'permissions';
  }
  if (kind === 'suggestions') {
    return profile.canPost ? 'eligible' : 'permissions';
  }
  return communityEligibility(item, settings);
};
