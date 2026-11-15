import { createVkFriendsJob } from './vk-friends.js';
import {
  performVkFriendAction,
  runVkFriendBatch,
} from './vk-friend-delivery.js';
import {
  equalFriendPolicy,
  friendCredentialIdentity,
  refuseFriendAction,
  friendLedgerId,
  uncertainFriendAction,
} from './vk-friends-records.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import { guardedSend } from './outbox.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';
import { recordOutcome } from './record-outcome.js';
import {
  cancelledKeys,
  cancelledLedgerId,
  readVkCancelledSettings,
  readVkCancelled,
  cancelledMessage,
} from './vk-cancelled-settings.js';
import {
  previewVkCancelled,
  cancelledDecision,
} from './vk-cancelled-planner.js';
export { loadVkCancelled, saveVkCancelled } from './vk-cancelled-settings.js';

const lifetime = (context, plan) => {
  if (
    context.isStopped() ||
    context.now() < plan.createdAt ||
    context.now() - plan.createdAt > 300000
  ) {
    refuseFriendAction('VK follow-up stopped or expired; review again');
  }
};
const current = async (context, plan, item, original) => {
  lifetime(context, plan);
  const relationship = await context.store.get(
    friendLedgerId(plan.accountId, item.userId)
  );
  if (
    !equalFriendPolicy(
      plan.settings,
      await readVkCancelledSettings(context.store)
    ) ||
    !equalFriendPolicy(
      plan.priorityIds,
      await protectedVkFriends(context.store, plan.settings)
    ) ||
    (await context.optionsFor())?.token !== original.options.token ||
    uncertainFriendAction(relationship) ||
    (relationship?.status === 'confirmed' && !relationship.settled)
  ) {
    refuseFriendAction(
      'VK follow-up policy, relationship, time or consent changed; review again'
    );
  }
  const safety = await loadSettings(context.store);
  if (
    optOutEntry(safety, { source: 'vk', chat: item.userId }) ||
    (context.scheduled && quietMsLeft(context.now(), safety))
  ) {
    refuseFriendAction(
      'VK messaging consent or quiet hours changed; review again'
    );
  }
  lifetime(context, plan);
};
const guard = async (context, plan, item, original) => {
  await current(context, plan, item, original);
  const state = await original.live.cancelledState(
    item.userId,
    original.options
  );
  if (
    state.accountId !== plan.accountId ||
    state.fingerprint !== item.fingerprint
  ) {
    refuseFriendAction(
      'VK conversation, account or relationship changed; review again'
    );
  }
  const decision = cancelledDecision({
    state,
    settings: plan.settings,
    now: context.now(),
    prompted:
      item.action === 'prompt'
        ? null
        : await context.store.get(
            cancelledLedgerId(plan.accountId, item.userId, 'prompt')
          ),
    blocked: null,
  });
  if (
    decision.reason !== 'eligible' ||
    decision.action !== item.action ||
    (item.action === 'prompt' && item.text !== cancelledMessage(plan.settings))
  ) {
    refuseFriendAction('VK prompt or blocking evidence changed; review again');
  }
  await current(context, plan, item, original);
};
const prompt = async (context, plan, item, original, beforeIssue) => {
  const draft = {
    source: 'vk',
    chat: String(item.userId),
    text: item.text,
    sequence: { policy: 'cancelled', step: 'greeting-and-question' },
  };
  const outcome = await guardedSend({
    store: context.store,
    kind: 'vk-cancelled',
    owner: `vk-cancelled:${plan.accountId}`,
    key: `vk-cancelled:${plan.accountId}:${item.userId}:once`,
    draft,
    clock: () => new Date(context.now()),
    log: context.log,
    send: async () => {
      try {
        const receipt = await original.live.cancelledEffect(
          item,
          original.options,
          beforeIssue
        );
        return { via: 'api', result: receipt.messageId };
      } catch (error) {
        if (!error.vkCode && error.code !== 'review-required') {
          error.ambiguous = true;
        }
        throw error;
      }
    },
  });
  await recordOutcome({
    store: context.store,
    automation: { id: `vk-cancelled:${plan.accountId}` },
    draft,
    outcome,
    nowIso: () => new Date(context.now()).toISOString(),
    log: context.log,
  });
  if (outcome.status !== 'sent') {
    throw Object.assign(
      new Error(outcome.error ?? 'VK prompt was not acknowledged'),
      {
        ambiguous:
          outcome.status === 'unknown' || outcome.code === 'send-in-doubt',
      }
    );
  }
  return {
    confirmed: true,
    outcome: 'prompted',
    messageId: outcome.result.result,
  };
};
const apply = async (context, plan) => {
  const original = await context.provider();
  if (
    plan.credentialIdentity !==
    (await friendCredentialIdentity(original.options.token))
  ) {
    refuseFriendAction('VK account credential changed; review again');
  }
  return runVkFriendBatch(context, plan, {
    stateKey: cancelledKeys.state,
    pace: 15000,
    event: 'vk_cancelled_batch',
    read: readVkCancelled,
    perform: (item) =>
      performVkFriendAction(context, plan, item, original, {
        ledgerId: cancelledLedgerId(
          plan.accountId,
          item.userId,
          item.action === 'prompt' ? 'prompt' : 'block'
        ),
        intentDetails: {
          action: item.action,
          ...(item.text ? { text: item.text } : {}),
        },
        beforeIssue: () => guard(context, plan, item, original),
        issue: (beforeIssue) =>
          item.action === 'prompt'
            ? prompt(context, plan, item, original, beforeIssue)
            : original.live.cancelledEffect(
                item,
                original.options,
                beforeIssue
              ),
      }),
  });
};
export const createVkCancelledJob = (options) =>
  createVkFriendsJob({
    ...options,
    profile: {
      state: cancelledKeys.state,
      plan: cancelledKeys.plan,
      capability: 'cancelledSnapshot',
      settings: readVkCancelledSettings,
      read: readVkCancelled,
      preview: previewVkCancelled,
      apply,
      failureEvent: 'vk_cancelled_batch_failed',
    },
  });
