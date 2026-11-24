import { createVkFriendsJob } from './vk-friends.js';
import { runVkFriendBatch } from './vk-friend-delivery.js';
import { refuseFriendAction } from './vk-friends-records.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { wallPolicy } from './vk-wall-settings.js';
import { previewVkWall } from './vk-wall-planner.js';
import { deliverVkWall } from './vk-wall-delivery.js';

export const createVkWallJob = (options) =>
  createVkFriendsJob({
    ...options,
    profile: {
      state: wallPolicy.keys.state,
      plan: wallPolicy.keys.plan,
      settings: wallPolicy.settings,
      read: wallPolicy.read,
      capability: 'wallInviteSnapshot',
      failureEvent: 'vk_wall_failed',
      preview: previewVkWall,
      apply: async (context, plan) => {
        const original = await context.provider();
        if (
          (await evidenceHash(original.options.token)) !==
          plan.credentialIdentity
        ) {
          refuseFriendAction('VK wall credentials changed; review again');
        }
        return runVkFriendBatch(context, plan, {
          stateKey: wallPolicy.keys.state,
          pace: 5000,
          event: 'vk_wall_batch',
          read: wallPolicy.read,
          perform: (item) => deliverVkWall(context, plan, item, original),
        });
      },
    },
  });
