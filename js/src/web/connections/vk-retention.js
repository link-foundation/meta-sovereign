import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VkFriendPolicy } from './vk-friends.js';
import {
  retentionFields,
  retentionTextFields,
} from '../../automation/vk-retention-settings.js';
const el = React.createElement;
const RetentionEvidence = ({ item }) => {
  const t = useT();
  return el(
    'p',
    { className: 'meta', 'data-retention-evidence': '' },
    t('vkRetention.evidence', {
      count: item.messages.length,
      local: item.local.length,
      deleted: item.deleted?.length ?? 0,
      receipts: item.receipts?.length ?? 0,
    })
  );
};
export const VkRetention = () =>
  el(VkFriendPolicy, {
    name: 'retention',
    prefix: 'vkRetention',
    fields: retentionFields,
    textFields: retentionTextFields,
    evidence: RetentionEvidence,
    resource: {
      load: api.vkRetention,
      save: api.saveVkRetention,
      plan: api.planVkRetention,
      run: api.runVkRetention,
    },
  });
