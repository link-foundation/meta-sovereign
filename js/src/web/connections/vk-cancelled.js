import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VkFriendPolicy } from './vk-friends.js';
import {
  cancelledFields,
  cancelledTextFields,
  cancelledBooleanFields,
} from '../../automation/vk-cancelled-settings.js';
const el = React.createElement;
const Evidence = ({ item }) => {
  const t = useT();
  return el('div', { className: 'col' }, [
    el(
      'p',
      { key: 'evidence', className: 'meta' },
      t('vkCancelled.outgoingEvidence')
    ),
    item.historyCount !== null
      ? el(
          'p',
          { key: 'count', className: 'meta' },
          t('vkCancelled.history', { count: item.historyCount })
        )
      : null,
    item.text
      ? el(
          'blockquote',
          {
            key: 'body',
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
            'data-cancelled-message': '',
          },
          item.text
        )
      : null,
  ]);
};
export const VkCancelled = () =>
  el(VkFriendPolicy, {
    name: 'cancelled',
    prefix: 'vkCancelled',
    fields: cancelledFields,
    textFields: cancelledTextFields,
    booleanFields: cancelledBooleanFields,
    evidence: Evidence,
    resource: {
      load: api.vkCancelled,
      save: api.saveVkCancelled,
      plan: api.planVkCancelled,
      run: api.runVkCancelled,
    },
  });
