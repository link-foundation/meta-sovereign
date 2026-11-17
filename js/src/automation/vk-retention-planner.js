import { vkSafetyTarget } from './vk-safety-target.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import {
  uncertainFriendAction,
  refuseFriendAction,
} from './vk-friends-records.js';
import { loadSettings, optOutEntry } from './safety.js';
import {
  retentionPolicy,
  retentionLedgerId,
  retentionPeerIds,
} from './vk-retention-settings.js';
import {
  retentionLocal,
  retentionHistoryMatches,
  verifyRetentionLocal,
} from './vk-retention-evidence.js';
import { retentionItemIdentity } from './vk-retention-guards.js';
const retainedReceipts = (previous = {}) => ({
  deleted: previous?.deleted ?? [],
  receipts: previous?.receipts ?? [],
});
const candidate = async (context, plan, peer, original, safety) => {
  const item = { userId: peer, action: 'clear', messages: [], local: [] };
  if (
    plan.settings.priorityIds.includes(Math.abs(peer)) ||
    optOutEntry(safety, vkSafetyTarget(peer))
  ) {
    return { ...item, reason: 'protected' };
  }
  const previous = await context.store.get(
    retentionLedgerId(plan.accountId, peer)
  );
  if (uncertainFriendAction(previous)) {
    return { ...item, reason: 'unknown' };
  }
  const state = await original.live.retentionState(peer, {
    ...original.options,
    ...plan.settings,
  });
  if (state.accountId !== plan.accountId) {
    refuseFriendAction('VK account changed during retention review');
  }
  Object.assign(item, {
    count: state.count,
    previousFingerprint: await evidenceHash(previous),
    baseline: await evidenceHash(state),
  });
  if (!state.complete) {
    return { ...item, reason: 'incomplete' };
  }
  if (previous?.status === 'partial') {
    Object.assign(item, {
      messages: previous.messages,
      local: previous.local,
      resumed: true,
      deleted: previous.deleted,
      localDone: previous.localDone,
      receipts: previous.receipts,
    });
    if (
      previous.policyIdentity !== plan.policyIdentity ||
      previous.credentialIdentity !== plan.credentialIdentity ||
      !retentionHistoryMatches(item, state, previous.deleted)
    ) {
      return { ...item, reason: 'changed' };
    }
    await verifyRetentionLocal(context.store, item, previous.id);
    return { ...item, reason: context.scheduled ? 'manualReview' : 'eligible' };
  }
  if (state.count <= plan.settings.threshold) {
    return {
      ...item,
      reason: 'belowThreshold',
      ...retainedReceipts(previous),
    };
  }
  return {
    ...item,
    messages: state.messages,
    local: await retentionLocal(context.store, peer, state.messages),
    reason: 'eligible',
  };
};
export const previewVkRetention = async (context) => {
  if (context.isStopped()) {
    refuseFriendAction('Service stopped');
  }
  const settings = await retentionPolicy.settings(context.store);
  const original = await context.provider();
  const source = await original.live.retentionSnapshot(original.options);
  const peers = retentionPeerIds(settings.peers);
  const plan = {
    id: retentionPolicy.keys.plan,
    planId: globalThis.crypto.randomUUID(),
    status: 'review',
    createdAt: context.now(),
    accountId: source.accountId,
    friendCount: peers.length,
    settings,
    policyIdentity: await evidenceHash(settings),
    credentialIdentity: await evidenceHash(original.options.token),
    items: [],
  };
  const safety = await loadSettings(context.store);
  let count = 0;
  for (const peer of peers) {
    const item = await candidate(context, plan, peer, original, safety);
    if (item.reason === 'eligible' && count++ >= settings.limit) {
      item.reason = 'runLimit';
    }
    item.signature = await retentionItemIdentity(plan, item);
    plan.items.push(item);
  }
  await saveAcknowledgedRecord(context.store, plan);
  return retentionPolicy.read(context.store);
};
