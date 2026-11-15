import { createVkFriendsJob } from './vk-friends.js';
import { runVkFriendBatch } from './vk-friend-delivery.js';
import { vkReengageSettings } from './vk-reengage-settings.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { previewVkReengage } from './vk-reengage-planner.js';
import { deliverReengageItem } from './vk-reengage-delivery.js';
import { refuseFriendAction } from './vk-friends-records.js';

export const createVkReengageJob = ({ kind, ...options }) => {
  const policy = vkReengageSettings[kind];
  if (!policy) {
    throw new Error('VK topic, help or music policy required');
  }
  const apply = async (context, plan) => {
    const original = await context.provider();
    if (
      plan.credentialIdentity !== (await evidenceHash(original.options.token))
    ) {
      refuseFriendAction('VK credential changed; review again');
    }
    return runVkFriendBatch(context, plan, {
      stateKey: policy.keys.state,
      pace: 30000,
      event: `vk_${kind}_batch`,
      read: policy.read,
      perform: (item) =>
        deliverReengageItem({ ...context, kind, policy }, plan, item, original),
    });
  };
  return createVkFriendsJob({
    ...options,
    profile: {
      state: policy.keys.state,
      plan: policy.keys.plan,
      settings: policy.settings,
      read: policy.read,
      capability: 'reengageSnapshot',
      failureEvent: `vk_${kind}_failed`,
      apply,
      preview: (context) => previewVkReengage({ ...context, kind, policy }),
    },
  });
};
