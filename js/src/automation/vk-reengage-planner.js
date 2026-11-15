import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { vkMessageRandomId } from './vk-message-random.js';
import { loadSettings, optOutEntry } from './safety.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import {
  readFriendState,
  uncertainFriendAction,
  observeFriendReceipt,
  refuseFriendAction,
} from './vk-friends-records.js';
import { questionVariants, reengageLedgerId } from './vk-reengage-settings.js';
import {
  completedSteps,
  priorConversation,
  dormantDecision,
  evidenceHash,
  verifyStepReceipts,
  sequenceIdentity,
} from './vk-reengage-evidence.js';

const stepsFor = (kind, settings) => {
  const variants = questionVariants(settings.questions);
  const question = variants[Math.floor(Math.random() * variants.length)];
  return [
    {
      text: settings.stickerId ? '' : settings.greeting,
      ...(settings.stickerId ? { sticker: settings.stickerId } : {}),
    },
    ...(kind === 'music' ? [{ text: '', audio: settings.audio }] : []),
    { text: question },
  ].map((step) => ({ ...step, randomId: vkMessageRandomId() }));
};
const resumeReason = async (context, plan, item, state, previous) => {
  if (context.scheduled) {
    return 'manualReview';
  }
  if (
    previous.policyIdentity !== plan.policyIdentity ||
    previous.credentialIdentity !== plan.credentialIdentity
  ) {
    return 'changed';
  }
  try {
    await verifyStepReceipts(context.store, context.kind, plan, item);
  } catch {
    return 'unknown';
  }
  const prior = priorConversation(state, item.steps);
  if (!prior || (await evidenceHash(prior)) !== item.baseline) {
    return 'changed';
  }
  return dormantDecision(prior, plan.settings, null, context.now());
};
const initialReason = (plan, userId, safety) =>
  userId === plan.accountId
    ? 'owner'
    : plan.priorityIds.includes(userId)
      ? 'protected'
      : optOutEntry(safety, { source: 'vk', chat: userId })
        ? 'optedOut'
        : null;
const reviewedItem = async (context, plan, userId, state, previous) => {
  const resuming = previous?.status === 'partial';
  const steps = resuming
    ? previous.steps
    : stepsFor(context.kind, plan.settings);
  const item = {
    userId,
    action: 'prompt',
    steps,
    cycle: resuming
      ? previous.cycle
      : String(state.messages?.[0]?.id ?? 'empty'),
    baseline: resuming
      ? previous.baseline
      : await evidenceHash(priorConversation(state, [])),
    historyCount: state.messages?.length ?? null,
    lastAt: (state.messages?.[0]?.date ?? 0) * 1000,
    previousFingerprint: await evidenceHash(previous),
    signature: resuming ? previous.signature : null,
    resumed: resuming,
  };
  item.signature ??= await sequenceIdentity(context.kind, plan, item);
  return item;
};
const candidateReason = async (
  context,
  plan,
  item,
  state,
  previous,
  relationship
) => {
  let reason =
    uncertainFriendAction(relationship) ||
    (relationship?.status === 'confirmed' && !relationship.settled) ||
    uncertainFriendAction(previous)
      ? 'unknown'
      : item.resumed
        ? await resumeReason(context, plan, item, state, previous)
        : dormantDecision(state, plan.settings, previous, context.now());
  if (
    reason === 'eligible' &&
    state.messages.length - completedSteps(item.steps).length >
      1000 - item.steps.length
  ) {
    reason = 'historyLimit';
  }
  return context.kind === 'music' && !plan.settings.audio
    ? 'audioMissing'
    : reason;
};
const candidateItem = async (context, plan, candidate, original, safety) => {
  const userId = candidate.userId;
  const reason = initialReason(plan, userId, safety);
  if (reason) {
    return { userId, action: 'prompt', reason, steps: [] };
  }
  const state = await readFriendState(
    () =>
      original.live.reengageState(userId, {
        ...original.options,
        ...plan.settings,
      }),
    original.options.token
  );
  if (state.accountId !== plan.accountId) {
    refuseFriendAction('VK account changed during review');
  }
  const relationship = await observeFriendReceipt(
    context.store,
    plan.accountId,
    userId,
    state.relation
  );
  const previous = await context.store.get(
    reengageLedgerId(context.kind, plan.accountId, userId)
  );
  const item = await reviewedItem(context, plan, userId, state, previous);
  item.reason = await candidateReason(
    context,
    plan,
    item,
    state,
    previous,
    relationship
  );
  return item;
};
export const previewVkReengage = async (context) => {
  if (context.isStopped()) {
    refuseFriendAction('Service stopped');
  }
  const settings = await context.policy.settings(context.store);
  const priorityIds = await protectedVkFriends(context.store, settings);
  const original = await context.provider();
  const source = await readFriendState(
    () => original.live.reengageSnapshot({ ...original.options, ...settings }),
    original.options.token
  );
  const plan = {
    id: context.policy.keys.plan,
    planId: globalThis.crypto.randomUUID(),
    status: 'review',
    accountId: source.accountId,
    friendCount: source.friendCount,
    createdAt: context.now(),
    settings,
    priorityIds,
    items: [],
    policyIdentity: await evidenceHash(settings),
    credentialIdentity: await evidenceHash(original.options.token),
  };
  const safety = await loadSettings(context.store);
  for (const candidate of source.items) {
    plan.items.push(
      await candidateItem(context, plan, candidate, original, safety)
    );
  }
  plan.items.sort(
    (a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0) || a.userId - b.userId
  );
  let count = 0;
  for (const item of plan.items) {
    if (item.reason === 'eligible' && count++ >= settings.limit) {
      item.reason = 'runLimit';
    }
  }
  await saveAcknowledgedRecord(context.store, plan);
  return context.policy.read(context.store);
};
