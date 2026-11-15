import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { Busy } from '../spinner.js';
import { useAcknowledgedResource } from './use-acknowledged-resource.js';

const el = React.createElement;
const fields = {
  everyMinutes: [1, 1440],
  maxFriends: [1, 10000],
  batchSize: [1, 100],
};
const FriendSettings = ({ settings, disabled, save }) => {
  const t = useT();
  const [draft, setDraft] = useState({});
  const update = (key, value) =>
    setDraft((before) => ({ ...before, [key]: value }));
  const controls = Object.entries(fields).map(([key, [min, max]]) =>
    el('label', { key, className: 'col' }, [
      t(`vkFriends.${key}`),
      el('input', {
        key: 'input',
        type: 'number',
        min,
        max,
        step: 1,
        disabled,
        'data-friend-field': key,
        value: draft[key] ?? settings[key],
        onChange: (event) => update(key, event.target.value),
      }),
    ])
  );
  const submit = () => {
    const next = { ...settings };
    for (const key of Object.keys(fields)) {
      next[key] = Number(draft[key] ?? settings[key]);
    }
    const ids = draft.priorityIds ?? settings.priorityIds.join(',');
    next.priorityIds = ids.trim() ? ids.split(',').map(Number) : [];
    return save(next);
  };
  return el('div', { className: 'col' }, [
    ...controls,
    el('label', { key: 'priority', className: 'col' }, [
      t('vkFriends.priorityIds'),
      el('input', {
        key: 'input',
        type: 'text',
        disabled,
        value: draft.priorityIds ?? settings.priorityIds.join(','),
        'data-friend-field': 'priorityIds',
        onChange: (event) => update('priorityIds', event.target.value),
      }),
    ]),
    el(
      'button',
      {
        key: 'save',
        type: 'button',
        disabled,
        'data-action': 'vk-friends-save',
        onClick: submit,
      },
      t('vkFriends.save')
    ),
  ]);
};
const FriendResults = ({ data }) => {
  const t = useT();
  const plan = data?.plan;
  const last = data?.last;
  return el(React.Fragment, null, [
    plan
      ? el(
          'div',
          {
            key: 'plan',
            className: 'col',
            'data-vk-friends-plan': plan.status,
          },
          [
            el(
              'p',
              { key: 'account' },
              t('vkFriends.account', {
                id: plan.accountId,
                count: plan.friendCount,
              })
            ),
            el(
              'ul',
              { key: 'items' },
              plan.items.map((item) =>
                el(
                  'li',
                  {
                    key: item.userId,
                    'data-friend-id': item.userId,
                    'data-friend-reason': item.reason,
                  },
                  `${item.userId}: ${t(`vkFriends.${item.action}`)} · ${t(`vkFriends.${item.reason}`)}${item.priority ? ` · ${t('vkFriends.priority')}` : ''}`
                )
              )
            ),
          ]
        )
      : null,
    el(
      'p',
      {
        key: 'last',
        role: 'status',
        'data-vk-friends-status': last?.status ?? 'idle',
      },
      t(`vkFriends.${last?.status ?? 'idle'}`)
    ),
    el(
      'ul',
      { key: 'outcomes' },
      (last?.results ?? []).map((row) =>
        el(
          'li',
          { key: row.userId },
          `${row.userId}: ${t(`vkFriends.${row.outcome ?? row.status}`)}`
        )
      )
    ),
  ]);
};
const FriendFeedback = ({ busy, error, data }) => {
  const t = useT();
  return el(React.Fragment, null, [
    busy ? el(Busy, { key: 'busy' }, t('vkFriends.loading')) : null,
    error
      ? el('p', { key: 'error', role: 'alert' }, t('vkFriends.failed'))
      : null,
    data && !data.schedulerRunning
      ? el('p', { key: 'inactive', className: 'meta' }, t('vkFriends.inactive'))
      : null,
  ]);
};
export const VkFriends = () => {
  const t = useT();
  const { data, busy, error, run } = useAcknowledgedResource(api.vkFriends);
  const save = (settings) => run(() => api.saveVkFriends(settings));
  const settings = data?.settings;
  return el('section', { className: 'col', 'data-vk-friends': '' }, [
    el('h3', { key: 'title' }, t('vkFriends.title')),
    el('p', { key: 'hint', className: 'meta' }, t('vkFriends.hint')),
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        disabled: busy || !settings,
        checked: settings?.enabled ?? false,
        'data-action': 'vk-friends-enabled',
        onChange: (event) =>
          save({ ...settings, enabled: event.target.checked }),
      }),
      t('vkFriends.enabled'),
    ]),
    settings
      ? el(FriendSettings, { key: 'settings', settings, disabled: busy, save })
      : null,
    el('div', { key: 'buttons', className: 'row' }, [
      el(
        'button',
        {
          key: 'plan',
          type: 'button',
          disabled: busy || !data?.canRun,
          'data-action': 'vk-friends-plan',
          onClick: () => run(api.planVkFriends),
        },
        t('vkFriends.plan')
      ),
      el(
        'button',
        {
          key: 'run',
          type: 'button',
          disabled: busy || !data?.canRun || data?.plan?.status !== 'review',
          'data-action': 'vk-friends-run',
          onClick: () => run(() => api.runVkFriends(data.plan.planId)),
        },
        t('vkFriends.run')
      ),
      el(
        'button',
        {
          key: 'refresh',
          type: 'button',
          disabled: busy,
          'data-action': 'vk-friends-refresh',
          onClick: () => run(api.vkFriends),
        },
        t('vkFriends.refresh')
      ),
    ]),
    el(FriendFeedback, { key: 'feedback', busy, error, data }),
    el(FriendResults, { key: 'results', data }),
  ]);
};
