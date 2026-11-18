import { createVkFriendsJob } from './vk-friends.js';
import { runVkFriendBatch } from './vk-friend-delivery.js';
import { refuseFriendAction } from './vk-friends-records.js';
import { evidenceHash } from './vk-reengage-evidence.js';
import { retentionPolicy } from './vk-retention-settings.js';
import { previewVkRetention } from './vk-retention-planner.js';
import { deliverVkRetention } from './vk-retention-delivery.js';
export const createVkRetentionJob = (options) =>
  createVkFriendsJob({
    ...options,
    profile: {
      state: retentionPolicy.keys.state,
      plan: retentionPolicy.keys.plan,
      settings: retentionPolicy.settings,
      read: retentionPolicy.read,
      capability: 'retentionSnapshot',
      failureEvent: 'vk_retention_failed',
      preview: previewVkRetention,
      apply: async (context, plan) => {
        const original = await context.provider();
        if (
          (await evidenceHash(original.options.token)) !==
          plan.credentialIdentity
        ) {
          refuseFriendAction('VK credentials changed; review again');
        }
        return runVkFriendBatch(context, plan, {
          stateKey: retentionPolicy.keys.state,
          pace: 2000,
          event: 'vk_retention_batch',
          read: retentionPolicy.read,
          perform: (item) => deliverVkRetention(context, plan, item, original),
        });
      },
    },
  });
