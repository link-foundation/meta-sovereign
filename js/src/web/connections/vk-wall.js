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
const WallEvidence = ({ item: reviewed, plan, last }) => {
  const t = useT();
  const receipt =
    last?.planId === plan.planId
      ? last.results?.find((result) => result.userId === reviewed.userId)
      : null;
  const item = { ...reviewed, ...receipt };
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
        { key: 'replace', 'data-wall-remaining': '' },
        t(`vkWall.${item.reason === 'eligible' ? 'oldPosts' : 'heldPosts'}`, {
          ids:
            item.old
              .filter(
                (p) =>
                  !item.deleted?.includes(p.id) && !item.absent?.includes(p.id)
              )
              .map((p) => p.id)
              .join(', ') || '—',
        })
      ),
      !receipt && item.absent?.length
        ? el(
            'p',
            { key: 'absent', 'data-wall-reviewed-absent': '' },
            t('vkWall.alreadyAbsent', { ids: item.absent.join(', ') })
          )
        : null,
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
const WallSummary = ({ last }) => {
  const t = useT();
  return (last?.results ?? [])
    .filter((result) => result.absent?.length)
    .map((result) =>
      el(
        'p',
        { key: result.userId, 'data-wall-absent': result.userId },
        `${result.userId}: ${t('vkWall.alreadyAbsent', {
          ids: result.absent.join(', '),
        })}`
      )
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
    summary: WallSummary,
    resource: {
      load: api.vkWall,
      save: api.saveVkWall,
      plan: api.planVkWall,
      run: api.runVkWall,
    },
  });
