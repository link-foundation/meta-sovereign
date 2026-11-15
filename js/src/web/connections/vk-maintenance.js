import React from 'react';
import { api } from '../dom.js';
import { VkFriendPolicy } from './vk-friends.js';
const el = React.createElement;
export const VkMaintenance = () =>
  el(
    React.Fragment,
    null,
    ['cleanup', 'outgoing'].map((name) => {
      const suffix = name === 'cleanup' ? 'VkCleanup' : 'VkOutgoing';
      return el(VkFriendPolicy, {
        key: name,
        name,
        prefix: `vk${suffix.slice(2)}`,
        fields: { everyMinutes: [1, 1440], limit: [0, 10000] },
        resource: {
          load: api[`vk${suffix.slice(2)}`],
          save: api[`save${suffix}`],
          plan: api[`plan${suffix}`],
          run: api[`run${suffix}`],
        },
      });
    })
  );
