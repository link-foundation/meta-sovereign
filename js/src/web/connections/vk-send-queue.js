import React, { useEffect, useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { Busy } from '../spinner.js';
import { useAcknowledgedResource } from './use-acknowledged-resource.js';

const el = React.createElement;
const Speed = ({ value, busy, save }) => {
  const t = useT();
  const [speed, setSpeed] = useState(value);
  useEffect(() => setSpeed(value), [value]);
  return el(
    'form',
    {
      className: 'row',
      onSubmit: (event) => {
        event.preventDefault();
        save({ charsPerMinute: Number(speed) });
      },
    },
    [
      el('label', { key: 'speed', className: 'col' }, [
        t('vkQueue.speed'),
        el('input', {
          key: 'input',
          type: 'number',
          min: 60,
          max: 3000,
          step: 1,
          required: true,
          value: speed,
          disabled: busy,
          'data-action': 'vk-queue-speed',
          onChange: (event) => setSpeed(event.target.value),
        }),
      ]),
      el(
        'button',
        { key: 'save', type: 'submit', disabled: busy },
        t('vkQueue.save')
      ),
    ]
  );
};
const statusText = (t, value) => t(`vkQueue.state.${value}`);
const Receipt = ({ item }) => {
  const t = useT();
  return el('li', { 'data-vk-queue-receipt': item.id }, [
    el('p', { key: 'chat' }, `${item.chat} · ${statusText(t, item.status)}`),
    el(
      'p',
      { key: 'delivery', className: 'meta' },
      `${t('vkQueue.delivery')}: ${statusText(t, item.delivery)}`
    ),
    el(
      'p',
      { key: 'read', className: 'meta' },
      `${t('vkQueue.read')}: ${statusText(t, item.read)}`
    ),
    el(
      'p',
      { key: 'typing', className: 'meta' },
      `${t('vkQueue.typingReceipt')}: ${statusText(t, item.typing)}`
    ),
  ]);
};
export const VkSendQueue = () => {
  const t = useT();
  const { data, busy, error, run } = useAcknowledgedResource(api.vkSendQueue);
  const save = (patch) => run(() => api.saveVkSendQueue(patch));
  return el(
    'section',
    { className: 'col', 'data-vk-send-queue': '', 'aria-busy': busy },
    [
      el('h3', { key: 'title' }, t('vkQueue.title')),
      el('p', { key: 'hint', className: 'meta' }, t('vkQueue.hint')),
      ...['enabled', 'markRead', 'typing'].map((key) =>
        el('label', { key, className: 'row' }, [
          el('input', {
            key: 'input',
            type: 'checkbox',
            checked: data?.settings[key] ?? false,
            disabled: busy || !data,
            'data-action': `vk-queue-${key}`,
            onChange: (event) => save({ [key]: event.target.checked }),
          }),
          el('span', { key: 'text' }, t(`vkQueue.${key}`)),
        ])
      ),
      data
        ? el(Speed, {
            key: 'speed',
            value: data.settings.charsPerMinute,
            busy,
            save,
          })
        : null,
      el(
        'button',
        {
          key: 'refresh',
          type: 'button',
          disabled: busy,
          'data-action': 'vk-queue-refresh',
          onClick: () => run(api.vkSendQueue),
        },
        t('vkQueue.refresh')
      ),
      busy ? el(Busy, { key: 'busy' }, t('vkQueue.loading')) : null,
      error
        ? el('p', { key: 'error', role: 'alert' }, t('vkQueue.failed'))
        : null,
      data
        ? el(
            'p',
            { key: 'runtime', className: 'meta' },
            data.runtime && !data.runtime.stopped
              ? t('vkQueue.waiting', { count: data.runtime.waiting })
              : t('vkQueue.inactive')
          )
        : null,
      data
        ? el('details', { key: 'receipts' }, [
            el(
              'summary',
              { key: 'summary' },
              t('vkQueue.receipts', {
                count: data.items.length,
                total: data.total,
              })
            ),
            el(
              'ul',
              { key: 'items' },
              data.items.map((item) => el(Receipt, { key: item.id, item }))
            ),
          ])
        : null,
      data
        ? el('details', { key: 'peers', 'data-vk-queue-peers': '' }, [
            el(
              'summary',
              { key: 'summary' },
              t('vkQueue.peers', {
                count: data.peers.length,
                total: data.peerTotal,
              })
            ),
            el(
              'ul',
              { key: 'items' },
              data.peers.map((peer) =>
                el('li', { key: peer.id }, [
                  `${peer.chat} · ${peer.automation} · ${peer.lastTriggered} · `,
                  t('vkQueue.drafts', { count: peer.drafts }),
                ])
              )
            ),
          ])
        : null,
    ]
  );
};
