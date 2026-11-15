import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VkFriendPolicy } from './vk-friends.js';
import {
  reengageKinds,
  reengageFields,
  reengageTextFields,
  reengageBooleans,
} from '../../automation/vk-reengage-settings.js';
const el = React.createElement;
const SequenceEvidence = ({ item }) => {
  const t = useT();
  return el('div', { className: 'col' }, [
    el(
      'p',
      { key: 'history', className: 'meta' },
      t('vkReengage.history', { count: item.historyCount ?? '?' })
    ),
    el(
      'ol',
      { key: 'steps', 'data-personal-sequence': '' },
      item.steps.map((step, index) =>
        el(
          'li',
          {
            key: index,
            'data-sequence-step': index + 1,
            'data-sequence-receipt': step.receipt ?? '',
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
          },
          [
            step.sticker
              ? t('vkReengage.selectedSticker', { id: step.sticker })
              : step.audio
                ? t('vkReengage.selectedAudio', { id: step.audio })
                : step.text,
            step.receipt
              ? ` · ${t('vkReengage.stepSent', { id: step.receipt })}`
              : ` · ${t('vkReengage.stepPending')}`,
          ]
        )
      )
    ),
  ]);
};
export const VkReengage = () =>
  el(
    React.Fragment,
    null,
    reengageKinds.map((kind) => {
      const title = `Vk${kind[0].toUpperCase()}${kind.slice(1)}`;
      return el(VkFriendPolicy, {
        key: kind,
        name: kind,
        prefix: `vk${title.slice(2)}`,
        fields: reengageFields,
        textFields: {
          ...reengageTextFields,
          ...(kind === 'music' ? { audio: 64 } : {}),
        },
        booleanFields: reengageBooleans,
        evidence: SequenceEvidence,
        resource: {
          load: api[`vk${title.slice(2)}`],
          save: api[`save${title}`],
          plan: api[`plan${title}`],
          run: api[`run${title}`],
        },
      });
    })
  );
