import React from 'react';
import { useT } from '../i18n.js';
import { VkFriendPolicies } from './vk-friends.js';
import {
  discoveryKinds,
  discoveryFields,
  discoveryBooleans,
} from '../../automation/vk-discovery-settings.js';
const el = React.createElement;
const DiscoverySummary = ({ plan }) => {
  const t = useT();
  return el(
    'p',
    { className: 'meta', 'data-discovery-summary': '' },
    t('vkSuggestions.window', {
      inspected: plan.items.length,
      total: plan.total,
      offset: plan.offset,
      remaining: plan.dailyRemaining,
    })
  );
};
export const VkDiscovery = () =>
  el(VkFriendPolicies, {
    kinds: discoveryKinds,
    optionsFor: (kind) => ({
      fields: discoveryFields[kind],
      booleanFields: discoveryBooleans[kind],
      summary: DiscoverySummary,
    }),
  });
