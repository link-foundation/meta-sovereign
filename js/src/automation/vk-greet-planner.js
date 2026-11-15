import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { vkMessageRandomId } from './vk-message-random.js';
import { loadSettings, optOutEntry } from './safety.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import {
  friendCredentialIdentity,
  refuseFriendAction,
  observeFriendReceipt,
  uncertainFriendAction,
  readFriendState,
} from './vk-friends-records.js';
import { vkGreetSettings, greetLedgerId } from './vk-greet-settings.js';

export const greetDecision = ({ state, settings, previous, now }) => {
  if (uncertainFriendAction(previous)) {
    return 'unknown';
  }
  if (state.relation !== 3 || state.deactivated) {
    return 'changed';
  }
  if (!state.canWrite) {
    return 'unwritable';
  }
  if (settings.onlineOnly && !state.online) {
    return 'offline';
  }
  if (state.markedUnread || state.unreadCount) {
    return 'unread';
  }
  if (!state.messages) {
    return 'historyLimit';
  }
  return historyDecision(state, settings, previous, now);
};
const historyDecision = (state, settings, previous, now) => {
  if (state.messages.some((m) => m.date * 1000 > now)) {
    return 'futureHistory';
  }
  if (state.messages[0]?.service) {
    return 'serviceHistory';
  }
  if (settings.emptyOnly && state.messages.length) {
    return 'hasHistory';
  }
  const previousAt = Date.parse(previous?.attemptedAt ?? '');
  if (
    Number.isFinite(previousAt) &&
    (now < previousAt ||
      (previous.status === 'confirmed' &&
        now - previousAt < settings.cooldownDays * 86400000))
  ) {
    return 'cooldown';
  }
  if (
    state.messages.length &&
    now - state.messages[0].date * 1000 <
      Math.max(settings.staleDays, settings.cooldownDays) * 86400000
  ) {
    return 'recent';
  }
  return 'eligible';
};
const compare = (settings) => (a, b) =>
  (settings.orderByFriends
    ? (b.friendCount ?? -1) - (a.friendCount ?? -1)
    : 0) ||
  Number(Boolean(a.historyCount)) - Number(Boolean(b.historyCount)) ||
  (a.lastAt ?? 0) - (b.lastAt ?? 0) ||
  a.userId - b.userId;
const initial = (userId, accountId, priorityIds, safety) =>
  userId === accountId
    ? 'owner'
    : priorityIds.includes(userId)
      ? 'protected'
      : optOutEntry(safety, { source: 'vk', chat: userId })
        ? 'optedOut'
        : null;

const reviewCandidate = async (
  context,
  { source, candidate, settings, priorityIds, safety, options, live }
) => {
  const userId = candidate.userId;
  let reason = initial(userId, source.accountId, priorityIds, safety);
  let state;
  let previous;
  if (!reason) {
    state = await readFriendState(
      () => live.greetState(userId, { ...options, ...settings }),
      options.token
    );
    if (state.accountId !== source.accountId) {
      refuseFriendAction('VK account changed during review');
    }
    const relation = await observeFriendReceipt(
      context.store,
      source.accountId,
      userId,
      state.relation
    );
    previous = await context.store.get(greetLedgerId(source.accountId, userId));
    reason =
      uncertainFriendAction(relation) ||
      (relation?.status === 'confirmed' && !relation.settled)
        ? 'unknown'
        : greetDecision({
            state,
            settings,
            now: context.now(),
            previous,
          });
  }
  return { userId, state, previous, reason };
};
const reviewItem = async (settings, evidence) => {
  const { userId, previous, reason } = evidence;
  const state = evidence.state ?? {};
  const last = state.messages?.[0] ?? {};
  return {
    userId,
    action: 'prompt',
    reason,
    text: settings.stickerId ? null : settings.message,
    sticker: settings.stickerId || null,
    fingerprint: state.fingerprint ?? null,
    historyCount: state.messages?.length ?? null,
    lastAt: last.date ? last.date * 1000 : null,
    online: state.online ?? null,
    friendCount: state.friendCount ?? null,
    cycle: String(last.id ?? 'empty'),
    previousFingerprint: await friendCredentialIdentity(
      JSON.stringify(previous ?? null)
    ),
    randomId: vkMessageRandomId(),
  };
};
export const previewVkGreet = async (context) => {
  if (context.isStopped()) {
    refuseFriendAction('Service stopped');
  }
  const settings = await vkGreetSettings.settings(context.store);
  const priorityIds = await protectedVkFriends(context.store, settings);
  const safety = await loadSettings(context.store);
  const { options, live } = await context.provider();
  const source = await readFriendState(
    () => live.greetSnapshot({ ...options, ...settings }),
    options.token
  );
  const items = [];
  for (const candidate of source.items) {
    const evidence = await reviewCandidate(context, {
      source,
      candidate,
      settings,
      priorityIds,
      safety,
      options,
      live,
    });
    items.push(await reviewItem(settings, evidence));
  }
  items.sort(compare(settings));
  let admitted = 0;
  for (const item of items) {
    if (item.reason === 'eligible' && admitted++ >= settings.limit) {
      item.reason = 'runLimit';
    }
  }
  await saveAcknowledgedRecord(context.store, {
    id: vkGreetSettings.keys.plan,
    planId: globalThis.crypto.randomUUID(),
    status: 'review',
    createdAt: context.now(),
    accountId: source.accountId,
    friendCount: source.friendCount,
    inspected: source.items.length,
    settings,
    priorityIds,
    items,
    credentialIdentity: await friendCredentialIdentity(options.token),
  });
  return vkGreetSettings.read(context.store);
};
