import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { loadSettings, optOutEntry } from './safety.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import {
  friendCredentialIdentity,
  observeFriendReceipt,
  uncertainFriendAction,
  readFriendState,
  refuseFriendAction,
} from './vk-friends-records.js';
import {
  cancelledKeys,
  cancelledLedgerId,
  cancelledMessage,
  readVkCancelledSettings,
  readVkCancelled,
} from './vk-cancelled-settings.js';

const legacyQuestion = 'Почему не хочешь больше дружить?';
const knownPrompt = (state, settings, prompted) =>
  state.messages.find(
    (message) =>
      message.out &&
      !message.service &&
      (prompted?.status === 'confirmed'
        ? message.id === prompted.messageId && message.text === prompted.text
        : [settings.question, legacyQuestion].some(
            (question) =>
              message.text === question ||
              message.text.endsWith(`\n${question}`)
          ))
  );
const unansweredDecision = (state, settings, prompt, now) => {
  const last = state.messages[0];
  const unanswered =
    prompt &&
    last?.out &&
    !last.service &&
    !state.messages.some(
      (message) => (!message.out || message.service) && message.id > prompt.id
    ) &&
    now - last.date * 1000 > settings.waitDays * 86400000;
  return unanswered && settings.blockUnanswered
    ? { reason: 'eligible', action: 'actionBlockUnanswered' }
    : { reason: 'alreadyPrompted' };
};
export const cancelledDecision = ({
  state,
  settings,
  prompted,
  blocked,
  now,
}) => {
  if (uncertainFriendAction(prompted) || uncertainFriendAction(blocked)) {
    return { reason: 'unknown' };
  }
  if (blocked?.status === 'confirmed') {
    return { reason: 'alreadyBlocked' };
  }
  if (state.relation !== 1 || state.deactivated) {
    return { reason: 'changed' };
  }
  if (!state.messages) {
    return { reason: 'historyLimit' };
  }
  if (state.messages.some((message) => message.date * 1000 > now)) {
    return { reason: 'futureHistory' };
  }
  const prompt = knownPrompt(state, settings, prompted);
  const reacted = prompted?.status === 'confirmed' || Boolean(prompt);
  if (!state.canWrite) {
    return {
      reason: settings.blockUnwritable ? 'eligible' : 'unwritable',
      action: 'actionBlockUnwritable',
    };
  }
  if (reacted) {
    return unansweredDecision(state, settings, prompt, now);
  }
  return {
    reason: 'eligible',
    action: 'prompt',
    text: cancelledMessage(settings),
  };
};
const initialReason = (userId, accountId, priorityIds, safety) => {
  if (userId === accountId) {
    return 'owner';
  }
  if (priorityIds.includes(userId)) {
    return 'protected';
  }
  return optOutEntry(safety, { source: 'vk', chat: userId })
    ? 'optedOut'
    : null;
};
const planItem = (userId, row, state) => ({
  userId,
  action: 'none',
  ...row,
  fingerprint: state?.fingerprint ?? null,
  historyCount: state?.messages?.length ?? null,
  canWrite: state?.canWrite ?? null,
  evidence: 'outgoing-only',
  randomId:
    (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646) + 1,
});
export const previewVkCancelled = async (context) => {
  if (context.isStopped()) {
    refuseFriendAction('Service stopped');
  }
  const settings = await readVkCancelledSettings(context.store);
  const priorityIds = await protectedVkFriends(context.store, settings);
  const safety = await loadSettings(context.store);
  const original = await context.provider();
  const source = await readFriendState(
    () =>
      original.live.cancelledSnapshot({
        ...original.options,
        limit: settings.limit,
      }),
    original.options.token
  );
  const items = [];
  for (const candidate of source.items) {
    const userId = candidate.userId;
    let row = {
      reason: initialReason(userId, source.accountId, priorityIds, safety),
    };
    let state;
    if (!row.reason) {
      state = await readFriendState(
        () => original.live.cancelledState(userId, original.options),
        original.options.token
      );
      if (state.accountId !== source.accountId) {
        refuseFriendAction('VK account changed during review');
      }
      const relationship = await observeFriendReceipt(
        context.store,
        source.accountId,
        userId,
        state.relation
      );
      row =
        uncertainFriendAction(relationship) ||
        (relationship?.status === 'confirmed' && !relationship.settled)
          ? { reason: 'unknown' }
          : cancelledDecision({
              state,
              settings,
              now: context.now(),
              prompted: await context.store.get(
                cancelledLedgerId(source.accountId, userId, 'prompt')
              ),
              blocked: await context.store.get(
                cancelledLedgerId(source.accountId, userId, 'block')
              ),
            });
    }
    items.push(planItem(userId, row, state));
  }
  await saveAcknowledgedRecord(context.store, {
    id: cancelledKeys.plan,
    planId: globalThis.crypto.randomUUID(),
    status: 'review',
    createdAt: context.now(),
    accountId: source.accountId,
    settings,
    priorityIds,
    items,
    credentialIdentity: await friendCredentialIdentity(original.options.token),
  });
  return readVkCancelled(context.store);
};
