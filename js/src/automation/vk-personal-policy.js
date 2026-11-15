import {
  equalFriendPolicy,
  refuseFriendAction,
  friendLedgerId,
  uncertainFriendAction,
} from './vk-friends-records.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';

const currentLifetime = (context, plan) => {
  if (
    context.isStopped() ||
    context.now() < plan.createdAt ||
    context.now() - plan.createdAt > 300000
  ) {
    refuseFriendAction('VK messaging review stopped or expired');
  }
};

/** Shared current consent, account policy and relationship admission. */
export const currentVkPersonalPolicy = async (
  context,
  plan,
  item,
  original
) => {
  currentLifetime(context, plan);
  const relationship = await context.store.get(
    friendLedgerId(plan.accountId, item.userId)
  );
  if (
    !equalFriendPolicy(
      await context.policy.settings(context.store),
      plan.settings
    ) ||
    !equalFriendPolicy(
      await protectedVkFriends(context.store, plan.settings),
      plan.priorityIds
    ) ||
    (await context.optionsFor())?.token !== original.options.token ||
    uncertainFriendAction(relationship) ||
    (relationship?.status === 'confirmed' && !relationship.settled)
  ) {
    refuseFriendAction(
      'VK policy, credential or relationship changed; review again'
    );
  }
  const safety = await loadSettings(context.store);
  if (
    optOutEntry(safety, { source: 'vk', chat: item.userId }) ||
    (context.scheduled && quietMsLeft(context.now(), safety))
  ) {
    refuseFriendAction('VK consent or quiet hours changed; review again');
  }
  currentLifetime(context, plan);
};
