import { createVkFriendsJob } from './vk-friends.js';
import { discoveryPolicies } from './vk-discovery-settings.js';
import { previewVkDiscovery } from './vk-discovery-planner.js';
import {
  validateDiscoveryPlan,
  guardDiscovery,
  currentDiscovery,
} from './vk-discovery-guards.js';
import {
  reserveDiscoveryRequest,
  pauseDiscoveryError,
} from './vk-discovery-quota.js';
import {
  performVkFriendAction,
  runVkFriendBatch,
} from './vk-friend-delivery.js';
const applyDiscovery = async (context, plan, kind) => {
  const original = await context.provider();
  await validateDiscoveryPlan(context, plan, kind, original);
  const policy = discoveryPolicies[kind];
  return runVkFriendBatch(context, plan, {
    stateKey: policy.keys.state,
    pace: { suggestions: 3000, community: 5000, rejections: 10000 }[kind],
    event: `vk_${kind}_batch`,
    read: policy.read,
    perform: (item) =>
      performVkFriendAction(context, plan, item, original, {
        intentDetails: {
          action: kind,
          expectedRelation: kind === 'rejections' ? 0 : 1,
          signature: item.signature,
        },
        beforeIntent: async () => {
          await guardDiscovery(context, plan, item, original);
          await reserveDiscoveryRequest(context, plan, item);
          await currentDiscovery(context, plan, item, original);
        },
        beforeIssue: () => guardDiscovery(context, plan, item, original, true),
        issue: async (beforeIssue) => {
          try {
            const method =
              kind === 'rejections' ? 'rejectFriendRequest' : 'addFriend';
            return await original.live[method](
              item.userId,
              original.options,
              beforeIssue
            );
          } catch (error) {
            await pauseDiscoveryError(context, plan, error);
            throw error;
          }
        },
      }),
  });
};
export const createVkDiscoveryJob = ({ kind, ...options }) => {
  const policy = discoveryPolicies[kind];
  if (!policy) {
    throw new Error('VK discovery policy required');
  }
  return createVkFriendsJob({
    ...options,
    profile: {
      state: policy.keys.state,
      plan: policy.keys.plan,
      capability: 'discoverySnapshot',
      settings: policy.settings,
      read: policy.read,
      preview: (context) => previewVkDiscovery(context, kind),
      apply: (context, plan) => applyDiscovery(context, plan, kind),
      failureEvent: `vk_${kind}_batch_failed`,
    },
  });
};
