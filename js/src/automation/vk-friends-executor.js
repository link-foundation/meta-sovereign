import {
  VK_FRIENDS_STATE as STATE,
  readVkFriendSettings,
  readVkFriends,
} from './vk-friends-settings.js';
import {
  equalFriendPolicy as equal,
  refuseFriendAction as refuse,
  friendCredentialIdentity,
} from './vk-friends-records.js';
import {
  performVkFriendAction,
  runVkFriendBatch,
} from './vk-friend-delivery.js';
const currentPolicy = async (
  { store, isStopped, optionsFor },
  plan,
  original
) => {
  if (isStopped() || !equal(plan.settings, await readVkFriendSettings(store))) {
    refuse('Service stopped or friend policy changed; review again');
  }
  if ((await optionsFor())?.token !== original.options.token) {
    refuse('VK account credential changed; review again');
  }
};
const guard = async (context, plan, item, original, reserved) => {
  await currentPolicy(context, plan, original);
  const state = await original.live.friendState(item.userId, original.options);
  if (
    state.accountId !== plan.accountId ||
    state.statuses[item.userId] !== item.relation
  ) {
    refuse('VK account or friend relation changed; review again');
  }
  if (
    Math.max(state.count, plan.friendCount + reserved) >=
    plan.settings.maxFriends
  ) {
    refuse('Friend capacity reached');
  }
};
export const applyVkFriendPlan = async (context, plan) => {
  const { store, now, provider } = context;
  if (
    !equal(plan.settings, await readVkFriendSettings(store)) ||
    now() - plan.createdAt > 300000 ||
    now() < plan.createdAt
  ) {
    refuse('Friend plan changed or expired; review again');
  }
  const original = await provider();
  if (
    plan.credentialIdentity !==
    (await friendCredentialIdentity(original.options.token))
  ) {
    refuse('VK account credential changed; review again');
  }
  return runVkFriendBatch(context, plan, {
    stateKey: STATE,
    pace: 10000,
    event: 'vk_friend_batch',
    read: readVkFriends,
    perform: (item, reserved) =>
      performVkFriendAction(context, plan, item, original, {
        issue: (beforeIssue) =>
          original.live.addFriend(item.userId, original.options, beforeIssue),
        beforeIssue: async () => {
          await guard(context, plan, item, original, reserved);
          await currentPolicy(context, plan, original);
        },
      }),
  });
};
