import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { VkFriendPolicy } from './vk-friends.js';
import {
  wallFields,
  wallTextFields,
  wallBooleans,
} from '../../automation/vk-wall-settings.js';
const el = React.createElement;
const WallEvidence = ({ item }) => {
  const t = useT();
  return el(
    'div',
    {
      className: 'col',
      style: { overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
    },
    [
      el('p', { key: 'text', 'data-wall-message': '' }, item.text ?? ''),
      el(
        'p',
        { key: 'media' },
        t('vkWall.selectedAttachments', {
          ids: item.attachments.join(', ') || '—',
        })
      ),
      el(
        'p',
        { key: 'replace' },
        t(`vkWall.${item.reason === 'eligible' ? 'oldPosts' : 'heldPosts'}`, {
          ids:
            item.old
              .filter((p) => !item.deleted?.includes(p.id))
              .map((p) => p.id)
              .join(', ') || '—',
        })
      ),
      item.postId
        ? el(
            'p',
            { key: 'receipt', 'data-wall-post-receipt': item.postId },
            t('vkWall.postReceipt', { id: item.postId })
          )
        : null,
    ]
  );
};
export const VkWall = () =>
  el(VkFriendPolicy, {
    name: 'wall',
    prefix: 'vkWall',
    fields: wallFields,
    textFields: wallTextFields,
    booleanFields: wallBooleans,
    evidence: WallEvidence,
    resource: {
      load: api.vkWall,
      save: api.saveVkWall,
      plan: api.planVkWall,
      run: api.runVkWall,
    },
  });
