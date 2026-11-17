import { vkSafetyTarget } from './vk-safety-target.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { refuseFriendAction } from './vk-friends-records.js';
import { retentionPolicy, retentionLedgerId } from './vk-retention-settings.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';
import { requireVkReviewLifetime } from './vk-review-lifetime.js';
import {
  retentionHistoryMatches,
  verifyRetentionLocal,
} from './vk-retention-evidence.js';
export const retentionItemIdentity = (plan, item) =>
  evidenceHash({
    account: plan.accountId,
    policy: plan.policyIdentity,
    credential: plan.credentialIdentity,
    planId: plan.planId,
    createdAt: plan.createdAt,
    resumed: item.resumed === true,
    peer: item.userId,
    reason: item.reason,
    previousFingerprint: item.previousFingerprint,
    messages: item.messages,
    local: item.local,
    baseline: item.baseline,
    deleted: item.deleted ?? [],
    localDone: item.localDone ?? [],
    receipts: item.receipts ?? [],
  });
export const retentionJournal = async (state) => {
  if (
    (await evidenceHash(
      await state.context.store.get(
        retentionLedgerId(state.plan.accountId, state.item.userId)
      )
    )) !== state.expected
  ) {
    refuseFriendAction('VK retention receipt changed; review again');
  }
};
const lifetime = (context, plan) =>
  requireVkReviewLifetime(
    context,
    plan,
    'VK retention review stopped or expired'
  );
export const retentionCurrent = async (state) => {
  const { context, plan, item, original } = state;
  lifetime(context, plan);
  const settings = await retentionPolicy.settings(context.store);
  const safety = await loadSettings(context.store);
  if (
    (await evidenceHash(settings)) !== plan.policyIdentity ||
    (await evidenceHash(plan.settings)) !== plan.policyIdentity ||
    (await context.optionsFor())?.token !== original.options.token ||
    settings.priorityIds.includes(Math.abs(item.userId)) ||
    optOutEntry(safety, vkSafetyTarget(item.userId)) ||
    (context.scheduled &&
      (!settings.enabled || quietMsLeft(context.now(), safety)))
  ) {
    refuseFriendAction('VK retention policy, account or consent changed');
  }
  await retentionJournal(state);
  lifetime(context, plan);
};
export const guardRetention = async (state, method) => {
  await retentionCurrent(state);
  const { context, plan, item, ledger, original } = state;
  const current = await original.live.retentionState(item.userId, {
    ...original.options,
    ...plan.settings,
  });
  if (
    current.accountId !== plan.accountId ||
    !retentionHistoryMatches(item, current, ledger.deleted) ||
    (method === 'conversation' &&
      (await evidenceHash(current)) !== item.baseline)
  ) {
    refuseFriendAction('VK history or account changed; review again');
  }
  await verifyRetentionLocal(context.store, item, ledger.id);
  await retentionCurrent(state);
};
