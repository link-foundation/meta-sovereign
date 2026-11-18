import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { guardedSend } from './outbox.js';
import { currentVkPersonalPolicy } from './vk-personal-policy.js';
import { recordOutcome } from './record-outcome.js';
import { queueVkPolicyMessage } from './vk-queued-delivery.js';
import { vkEffectError } from './vk-effect-error.js';
import { refuseFriendAction } from './vk-friends-records.js';
import { reengageLedgerId } from './vk-reengage-settings.js';
import {
  reengageDraft,
  matchesReengageReceipt,
} from './vk-reengage-payload.js';
import {
  completedSteps,
  evidenceHash,
  reengageKey,
  guardReengage,
} from './vk-reengage-evidence.js';

const persist = async (state, patch) => {
  const { context, intent } = state;
  if (
    (await evidenceHash(await context.store.get(intent.id))) !== state.expected
  ) {
    refuseFriendAction('VK sequence receipt changed; review again');
  }
  const next = {
    ...intent,
    ...patch,
    steps: state.item.steps.map((step) => ({ ...step })),
  };
  const admitted = await saveAcknowledgedRecord(context.store, next);
  // Admission may add a causal clock. Compare subsequent reads with the
  // acknowledged record, while retaining concurrent-write detection.
  state.expected = await evidenceHash(admitted);
};
const admitStep = async (state) => {
  await persist(state, { status: 'pending' });
  await guardReengage(state.context, state.plan, state.item, state.original);
  if (
    (await evidenceHash(await state.context.store.get(state.intent.id))) !==
    state.expected
  ) {
    refuseFriendAction('VK sequence receipt changed during acknowledgement');
  }
  if (state.context.isStopped()) {
    refuseFriendAction('VK messaging review stopped');
  }
  state.issued = true;
};
const sendStep = async (state, step) => {
  try {
    const result = await state.original.live[
      state.context.policy.effectMethod ?? 'reengageEffect'
    ]({ userId: state.item.userId, ...step }, state.original.options, () =>
      admitStep(state)
    );
    state.uncertain = true;
    return { via: 'api', result: result.messageId };
  } catch (error) {
    if (state.issued && !error.vkCode && error.code !== 'review-required') {
      error.ambiguous = true;
    }
    throw error;
  }
};
const deliverStep = async (state, index) => {
  const { context, plan, item } = state;
  const step = item.steps[index];
  const key = reengageKey(context.kind, plan, item, index);
  const draft = reengageDraft(context.kind, item, index);
  state.issued = false;
  const outcome = await queueVkPolicyMessage(
    context,
    state.original,
    key,
    draft,
    () =>
      guardedSend({
        store: context.store,
        kind: `vk-${context.kind}`,
        owner: `vk-${context.kind}:${plan.accountId}`,
        key,
        draft,
        clock: () => new Date(context.now()),
        log: context.log,
        send: () => sendStep(state, step),
      }),
    () => currentVkPersonalPolicy(context, plan, item, state.original)
  );
  await recordOutcome({
    store: context.store,
    automation: { id: `vk-${context.kind}:${plan.accountId}` },
    draft,
    outcome,
    nowIso: () => new Date(context.now()).toISOString(),
    log: context.log,
  });
  if (outcome.status !== 'sent') {
    throw Object.assign(
      new Error(outcome.error ?? 'VK sequence step was refused'),
      {
        ambiguous:
          outcome.status === 'unknown' || outcome.code === 'send-in-doubt',
      }
    );
  }
  // A durable positive native receipt is necessary before the next effect.
  // Any storage failure here retains the pending journal and prevents replay.
  state.uncertain = true;
  await context.store.flush?.();
  const retained = await context.store.get(`outbox:${key}`);
  if (
    !matchesReengageReceipt(
      retained,
      context.kind,
      item,
      index,
      outcome.result.result
    )
  ) {
    throw new Error('VK step acknowledgement could not be retained');
  }
  step.receipt = outcome.result.result;
  await persist(state, { status: 'partial' });
  state.uncertain = false;
};
const failure = async (state, error) => {
  const status =
    state.uncertain || error.ambiguous
      ? 'unknown'
      : completedSteps(state.item.steps).length
        ? 'partial'
        : 'refused';
  const message = vkEffectError(error, state.original.options.token);
  try {
    await persist(state, { status, error: message });
  } catch {
    // The last durable pending receipt is authoritative; a failed write must
    // not turn an uncertain action into success or permit automatic replay.
    return {
      userId: state.item.userId,
      status: state.issued ? 'unknown' : 'refused',
    };
  }
  return {
    userId: state.item.userId,
    status: status === 'partial' ? 'refused' : status,
    outcome: status === 'partial' ? 'partial' : undefined,
    sent: completedSteps(state.item.steps).length,
  };
};
export const deliverReengageItem = async (
  context,
  plan,
  reviewed,
  original
) => {
  const item = {
    ...reviewed,
    steps: reviewed.steps.map((step) => ({ ...step })),
  };
  const state = {
    context,
    plan,
    item,
    original,
    expected: item.previousFingerprint,
    issued: false,
    uncertain: false,
    intent: {
      id: reengageLedgerId(context.kind, plan.accountId, item.userId),
      accountId: plan.accountId,
      userId: item.userId,
      planId: plan.planId,
      attemptedAt: new Date(context.now()).toISOString(),
      cycle: item.cycle,
      baseline: item.baseline,
      signature: item.signature,
      policyIdentity: plan.policyIdentity,
      credentialIdentity: plan.credentialIdentity,
    },
  };
  try {
    if (context.scheduled && item.resumed) {
      refuseFriendAction('Review the partial sequence manually');
    }
    for (const [index, step] of item.steps.entries()) {
      if (step.receipt) {
        continue;
      }
      if (index) {
        await context.sleep(15000, context.signal);
      }
      await deliverStep(state, index);
    }
    await persist(state, { status: 'confirmed' });
    return {
      userId: item.userId,
      status: 'confirmed',
      outcome: 'delivered',
      sent: item.steps.length,
    };
  } catch (error) {
    return failure(state, error);
  }
};
