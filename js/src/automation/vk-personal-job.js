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
  if (context.policy.repeatable) {
    const own = await context.store.get(context.policy.ledgerId(plan, item));
    if (own?.planId !== plan.planId || own?.status !== 'pending') {
      refuseFriendAction('VK greeting receipt changed; review again');
    }
  }
  const relationship = await context.store.get(
    friendLedgerId(plan.accountId, item.userId)
  );
  if (
    !equalFriendPolicy(
      plan.settings,
      await context.policy.settings(context.store)
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
  const state = await original.live[context.policy.stateMethod](item.userId, {
    ...original.options,
    ...plan.settings,
  });
  if (
    state.accountId !== plan.accountId ||
    state.fingerprint !== item.fingerprint
  ) {
    refuseFriendAction(
      'VK conversation, account or relationship changed; review again'
    );
  }
  const decision = await context.policy.decision(context, plan, item, state);
  if (
    decision.reason !== 'eligible' ||
    decision.action !== item.action ||
    !context.policy.matches(plan, item)
  ) {
    refuseFriendAction('VK message or action evidence changed; review again');
  }
  await current(context, plan, item, original);
};
const prompt = async (context, plan, item, original, beforeIssue) => {
  const draft = {
    source: 'vk',
    chat: String(item.userId),
    text: item.text,
    ...(item.sticker ? { sticker: { id: String(item.sticker) } } : {}),
    sequence: { policy: context.policy.name, step: 'reviewed-message' },
  };
  const outcome = await guardedSend({
    store: context.store,
    kind: `vk-${context.policy.name}`,
    owner: `vk-${context.policy.name}:${plan.accountId}`,
    key: context.policy.outboxKey(plan, item),
    draft,
    clock: () => new Date(context.now()),
    log: context.log,
    send: async () => {
      try {
        const receipt = await original.live[context.policy.effectMethod](
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
    automation: { id: `vk-${context.policy.name}:${plan.accountId}` },
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
    outcome: context.policy.messageOutcome,
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
    stateKey: context.policy.keys.state,
    pace: context.policy.pace,
    event: context.policy.event,
    read: context.policy.read,
    perform: (item) =>
      performVkFriendAction(context, plan, item, original, {
        ledgerId: context.policy.ledgerId(plan, item),
        beforeIntent: context.policy.repeatable
          ? async () => {
              const previous = await context.store.get(
                context.policy.ledgerId(plan, item)
              );
              if (
                (await friendCredentialIdentity(
                  JSON.stringify(previous ?? null)
                )) !== item.previousFingerprint
              ) {
                refuseFriendAction(
                  'VK greeting cooldown evidence changed; review again'
                );
              }
            }
          : undefined,
        intentDetails: {
          action: item.action,
          ...(context.policy.repeatable ? { settled: true } : {}),
          ...(item.text ? { text: item.text } : {}),
          ...(item.sticker ? { sticker: item.sticker } : {}),
        },
        beforeIssue: () => guard(context, plan, item, original),
        issue: (beforeIssue) =>
          item.action === 'prompt'
            ? prompt(context, plan, item, original, beforeIssue)
            : original.live[context.policy.effectMethod](
                item,
                original.options,
                beforeIssue
              ),
      }),
  });
};
export const createVkPersonalJob = (options, policy) =>
  createVkFriendsJob({
    ...options,
    profile: {
      state: policy.keys.state,
      plan: policy.keys.plan,
      capability: policy.capability,
      settings: policy.settings,
      read: policy.read,
      preview: policy.preview,
      apply: (context, plan) => apply({ ...context, policy }, plan),
      failureEvent: `${policy.event}_failed`,
    },
  });
