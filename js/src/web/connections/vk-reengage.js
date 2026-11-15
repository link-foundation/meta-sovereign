import React from 'react';
import { useT } from '../i18n.js';
import { VkFriendPolicies } from './vk-friends.js';
import {
  reengageKinds,
  reengageFields,
  reengageTextFields,
  reengageBooleans,
} from '../../automation/vk-reengage-settings.js';
const el = React.createElement;
export const SequenceEvidence = ({ item }) => {
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
            step.attachments?.length ? ` · ${step.attachments.join(', ')}` : '',
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
  el(VkFriendPolicies, {
    kinds: reengageKinds,
    optionsFor: (kind) => ({
      fields: reengageFields,
      textFields: {
        ...reengageTextFields,
        ...(kind === 'music' ? { audio: 64 } : {}),
      },
      booleanFields: reengageBooleans,
      evidence: SequenceEvidence,
    }),
  });
