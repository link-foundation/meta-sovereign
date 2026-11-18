import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { vkEffectError } from './vk-effect-error.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { refuseFriendAction } from './vk-friends-records.js';
import { retentionLedgerId } from './vk-retention-settings.js';
import { clearRetentionLocal } from './vk-retention-evidence.js';
import {
  retentionCurrent,
  retentionJournal,
  retentionItemIdentity,
  guardRetention,
} from './vk-retention-guards.js';
const persist = async (state, status, extra = {}) => {
  await retentionJournal(state);
  state.ledger = { ...state.ledger, ...extra, status };
  const row = await saveAcknowledgedRecord(state.context.store, state.ledger);
  state.expected = await evidenceHash(row);
};
const issue = async (state, method, messages) => {
  state.issued = false;
  const receipt = await state.original.live.deleteRetention(
    { method, peer: state.item.userId, messages },
    state.original.options,
    async () => {
      await persist(state, 'pending');
      await guardRetention(state, method);
      state.issued = true;
    }
  );
  if (
    !state.issued ||
    receipt?.confirmed !== true ||
    !Array.isArray(receipt.deleted) ||
    !receipt.deleted.every((id) => messages.some((m) => m.cmid === id))
  ) {
    throw Object.assign(new Error('Missing admitted VK deletion receipt'), {
      ambiguous: true,
    });
  }
  state.uncertain = true;
  await persist(state, 'partial', {
    deleted: [...state.ledger.deleted, ...receipt.deleted],
    receipts: [...state.ledger.receipts, { method, ...receipt }],
  });
  state.uncertain = false;
  state.issued = false;
  if (receipt.deleted.length !== messages.length) {
    refuseFriendAction('VK refused part of the reviewed deletion batch');
  }
};
const remove = async (state) => {
  if (!state.item.resumed) {
    try {
      await issue(state, 'conversation', state.item.messages);
    } catch (error) {
      // Only this explicit API refusal proves no conversation write occurred.
      if (!(state.issued && error.vkCode === 3 && !state.uncertain)) {
        throw error;
      }
      state.issued = false;
      await persist(state, 'partial', { fallback: true });
    }
  }
  while (true) {
    const deleted = new Set(state.ledger.deleted);
    const remaining = state.item.messages.filter((m) => !deleted.has(m.cmid));
    if (!remaining.length) {
      return;
    }
    await state.context.sleep(2000, state.context.signal);
    await issue(state, 'messages', remaining.slice(0, 100));
  }
};
const failed = async (state, error) => {
  const unknown =
    state.uncertain ||
    error.ambiguous ||
    (state.issued && !error.vkCode && error.code !== 'review-required');
  const status = unknown
    ? 'unknown'
    : state.ledger.deleted.length || state.ledger.fallback || state.item.resumed
      ? 'partial'
      : 'refused';
  try {
    await persist(state, status, {
      error: vkEffectError(error, state.original.options.token),
    });
  } catch {
    return {
      userId: state.item.userId,
      status: state.issued || state.uncertain ? 'unknown' : 'refused',
    };
  }
  return {
    userId: state.item.userId,
    status: status === 'partial' ? 'refused' : status,
    outcome: status === 'partial' ? 'partial' : status,
  };
};
export const deliverVkRetention = async (context, plan, item, original) => {
  if ((await retentionItemIdentity(plan, item)) !== item.signature) {
    return { userId: item.userId, status: 'refused' };
  }
  const state = {
    context,
    plan,
    item,
    original,
    expected: item.previousFingerprint,
    issued: false,
    uncertain: false,
    ledger: {
      id: retentionLedgerId(plan.accountId, item.userId),
      planId: plan.planId,
      accountId: plan.accountId,
      userId: item.userId,
      attemptedAt: new Date(context.now()).toISOString(),
      policyIdentity: plan.policyIdentity,
      credentialIdentity: plan.credentialIdentity,
      messages: item.messages,
      local: item.local,
      deleted: item.deleted ?? [],
      localDone: item.localDone ?? [],
      receipts: item.receipts ?? [],
    },
  };
  try {
    if (context.scheduled && item.resumed) {
      refuseFriendAction('Review partial retention manually');
    }
    await guardRetention(state, item.resumed ? 'messages' : 'conversation');
    await remove(state);
    await guardRetention(state, 'messages');
    await clearRetentionLocal(
      context,
      state,
      item,
      () => retentionCurrent(state),
      (extra) => persist(state, 'partial', extra)
    );
    await retentionCurrent(state);
    await persist(state, 'confirmed');
    return {
      userId: item.userId,
      status: 'confirmed',
      outcome: 'cleared',
      deleted: state.ledger.deleted.length,
      local: state.ledger.localDone.length,
    };
  } catch (error) {
    return failed(state, error);
  }
};
