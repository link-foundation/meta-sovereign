import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VkFriendPolicy } from './vk-friends.js';
import {
  greetFields,
  greetTextFields,
  greetBooleanFields,
} from '../../automation/vk-greet-settings.js';
const el = React.createElement;
const GreetEvidence = ({ item }) => {
  const t = useT();
  return el('div', { className: 'col', 'data-greet-evidence': '' }, [
    el(
      'p',
      { key: 'history', className: 'meta' },
      t('vkGreet.history', { count: item.historyCount ?? '?' })
    ),
    item.sticker
      ? el(
          'p',
          { key: 'sticker', 'data-greet-sticker': '' },
          t('vkGreet.selectedSticker', { id: item.sticker })
        )
      : el(
          'blockquote',
          {
            key: 'text',
            'data-greet-message': '',
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
          },
          item.text
        ),
  ]);
};
export const VkGreet = () =>
  el(VkFriendPolicy, {
    name: 'greet',
    prefix: 'vkGreet',
    fields: greetFields,
    textFields: greetTextFields,
    booleanFields: greetBooleanFields,
    evidence: GreetEvidence,
    resource: {
      load: api.vkGreet,
      save: api.saveVkGreet,
      plan: api.planVkGreet,
      run: api.runVkGreet,
    },
  });
