import {
  friendCredentialIdentity,
  equalFriendPolicy,
  refuseFriendAction,
} from './vk-friends-records.js';
import { currentVkPersonalPolicy } from './vk-personal-policy.js';
import { greetDecision } from './vk-greet-planner.js';
import { matchesReengageReceipt } from './vk-reengage-payload.js';

export const evidenceHash = (value) =>
  friendCredentialIdentity(JSON.stringify(value ?? null));
export const reengageKey = (kind, plan, item, index) =>
  `vk-${kind}:${plan.accountId}:${item.userId}:${item.cycle}:${index + 1}`;
export const completedSteps = (steps) => steps.filter((step) => step.receipt);
export const sequenceIdentity = (kind, plan, item) =>
  evidenceHash({
    kind,
    account: plan.accountId,
    userId: item.userId,
    cycle: item.cycle,
    baseline: item.baseline,
    policy: plan.policyIdentity,
    steps: item.steps.map(({ receipt: _receipt, ...step }) => step),
  });
const matchesStep = (message, step) =>
  message?.id === step.receipt &&
  message.out === 1 &&
  !message.service &&
  message.text === (step.text ?? '') &&
  equalFriendPolicy(
    message.attachments,
    step.sticker
      ? [`sticker${step.sticker}`]
      : step.audio
        ? [step.audio]
        : (step.attachments ?? []).map((id) =>
            id.replace(/^(photo|audio|video|doc)(-?\d+_\d+)(?:_.*)?$/u, '$1$2')
          )
  );
export const priorConversation = (state, steps) => {
  const sent = completedSteps(steps).toReversed();
  if (
    !state.messages ||
    sent.some((step, i) => !matchesStep(state.messages[i], step))
  ) {
    return null;
  }
  const { fingerprint: _fingerprint, ...rest } = state;
  return { ...rest, messages: state.messages.slice(sent.length) };
};
export const dormantDecision = (state, settings, previous, now) => {
  const reason = greetDecision({ state, settings, previous, now });
  if (reason !== 'eligible') {
    return reason;
  }
  return state.messages.length ? 'eligible' : 'noHistory';
};
export const verifyStepReceipts = async (store, kind, plan, item) => {
  let gap = false;
  for (const [index, step] of item.steps.entries()) {
    if (!step.receipt) {
      gap = true;
      continue;
    }
    const record = await store.get(
      `outbox:${reengageKey(kind, plan, item, index)}`
    );
    if (
      gap ||
      !matchesReengageReceipt(record, kind, item, index, step.receipt)
    ) {
      refuseFriendAction(
        'VK step receipt is incomplete; check the conversation'
      );
    }
  }
};
export const guardReengage = async (context, plan, item, original) => {
  if ((await sequenceIdentity(context.kind, plan, item)) !== item.signature) {
    refuseFriendAction('VK reviewed message sequence changed');
  }
  await currentVkPersonalPolicy(context, plan, item, original);
  await verifyStepReceipts(context.store, context.kind, plan, item);
  const state = await original.live[
    context.policy.stateMethod ?? 'reengageState'
  ](item.userId, {
    ...original.options,
    ...plan.settings,
  });
  const prior = priorConversation(state, item.steps);
  if (
    !prior ||
    (await evidenceHash(prior)) !== item.baseline ||
    (context.policy.decision ?? dormantDecision)(
      prior,
      plan.settings,
      null,
      context.now(),
      item.cycle
    ) !== 'eligible'
  ) {
    refuseFriendAction(
      'VK conversation or prior delivery changed; review again'
    );
  }
  await currentVkPersonalPolicy(context, plan, item, original);
};
