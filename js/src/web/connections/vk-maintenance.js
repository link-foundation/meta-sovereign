import React from 'react';
import { VkFriendPolicies } from './vk-friends.js';
const el = React.createElement;
export const VkMaintenance = () =>
  el(VkFriendPolicies, {
    kinds: ['cleanup', 'outgoing'],
    optionsFor: () => ({
      fields: { everyMinutes: [1, 1440], limit: [0, 10000] },
    }),
  });
