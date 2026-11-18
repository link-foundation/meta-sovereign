import React from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { Busy } from '../spinner.js';

import { useAcknowledgedResource } from './use-acknowledged-resource.js';

const el = React.createElement;

export const VkAttachments = () => {
  const t = useT();
  const { data, busy, error, run } = useAcknowledgedResource(api.vkAttachments);
  return el('section', { className: 'col', 'data-vk-attachments': '' }, [
    el('h3', { key: 'title' }, t('vkAttachments.title')),
    el('p', { key: 'hint', className: 'meta' }, t('vkAttachments.hint')),
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: data?.settings.enabled ?? false,
        disabled: busy || !data,
        'data-action': 'vk-attachments-enabled',
        onChange: (event) =>
          run(() => api.saveVkAttachmentCollection(event.target.checked)),
      }),
      el('span', { key: 'text' }, t('vkAttachments.enabled')),
    ]),
    el(
      'button',
      {
        key: 'refresh',
        type: 'button',
        disabled: busy,
        'data-action': 'vk-attachments-refresh',
        onClick: () => run(() => api.vkAttachments()),
      },
      t('vkAttachments.refresh')
    ),
    busy ? el(Busy, { key: 'busy' }, t('vkAttachments.loading')) : null,
    error
      ? el('p', { key: 'error', role: 'alert' }, t('vkAttachments.failed'))
      : null,
    data && !data.items.length
      ? el('p', { key: 'empty', className: 'meta' }, t('vkAttachments.empty'))
      : null,
    ...(data?.items ?? []).map((row) =>
      el('details', { key: row.id, 'data-vk-attachment': row.id }, [
        el('summary', { key: 'summary' }, `${row.type} · ${row.externalId}`),
        el(
          'pre',
          {
            key: 'metadata',
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
          },
          JSON.stringify(row.metadata, null, 2)
        ),
      ])
    ),
    data?.next
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            disabled: busy,
            'data-action': 'vk-attachments-more',
            onClick: () =>
              run(async () => {
                const next = await api.vkAttachments(data.next);
                return next.ok
                  ? { ...next, items: [...data.items, ...next.items] }
                  : next;
              }),
          },
          t('vkAttachments.more')
        )
      : null,
  ]);
};
