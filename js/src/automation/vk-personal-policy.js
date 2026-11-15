import {
  equalFriendPolicy,
  refuseFriendAction,
  friendLedgerId,
  uncertainFriendAction,
} from './vk-friends-records.js';
import { protectedVkFriends } from './vk-maintenance-settings.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';
import { requireVkReviewLifetime } from './vk-review-lifetime.js';

const currentLifetime = (context, plan, item) => {
  requireVkReviewLifetime(
    context,
    plan,
    'VK messaging review stopped or expired'
  );
  if (
    context.policy.cycle &&
    item.cycle !== context.policy.cycle(plan.settings, context.now())
  ) {
    refuseFriendAction('VK reviewed calendar date changed; review again');
  }
};

/** Shared current consent, account policy and relationship admission. */
export const currentVkPersonalPolicy = async (
  context,
  plan,
  item,
  original
) => {
  currentLifetime(context, plan, item);
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
  currentLifetime(context, plan, item);
};
