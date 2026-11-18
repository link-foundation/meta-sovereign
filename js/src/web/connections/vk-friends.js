import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { Busy } from '../spinner.js';
import {
  VkFriendPriorityActions,
  friendPriorityActions,
} from './vk-friend-priority.js';
import { useAcknowledgedResource } from './use-acknowledged-resource.js';
import { desktopFriendPolicy } from '../../automation/vk-friends-settings.js';
import { VkMessageDefaults } from './vk-message-defaults.js';
import {
  FriendAcceptanceChoice,
  FriendQuotaSummary,
  friendMutualLabel,
} from './vk-friend-choice.js';

const el = React.createElement;
/** Keep policy controls, review and transport naming consistent across VK jobs. */
export const VkFriendPolicies = ({ kinds, optionsFor }) =>
  el(
    React.Fragment,
    null,
    kinds.map((kind) => {
      const title = `Vk${kind[0].toUpperCase()}${kind.slice(1)}`;
      return el(VkFriendPolicy, {
        key: kind,
        name: kind,
        prefix: `vk${title.slice(2)}`,
        ...optionsFor(kind),
        resource: {
          load: api[`vk${title.slice(2)}`],
          save: api[`save${title}`],
          plan: api[`plan${title}`],
          run: api[`run${title}`],
        },
      });
    })
  );
const friendFields = {
  everyMinutes: [1, 1440],
  maxFriends: [1, 10000],
  batchSize: [1, 100],
};
const FriendSettings = ({
  settings,
  disabled,
  save,
  fields,
  textFields,
  booleanFields,
  prefix,
  name,
  priorityVersion,
  priorityActions,
  messageDefaults,
}) => {
  const t = useT();
  const [draft, setDraft] = useState({});
  const update = (key, value) =>
    setDraft((before) => ({ ...before, [key]: value }));
  const savedPriority = settings.priorityIds.join(',');
  const priorityKey = `${priorityVersion}:${savedPriority}`;
  const priorityText =
    draft.priorityKey === priorityKey ? draft.priorityIds : savedPriority;
  const numericFields = {
    ...fields,
    ...(name === 'friends' && desktopFriendPolicy(settings)
      ? { topPercentMutuals: [0, 100] }
      : {}),
  };
  const numberValue = (key) =>
    draft[key] ?? settings[key] ?? (key === 'topPercentMutuals' ? 10 : '');
  const controls = Object.entries(numericFields).map(([key, [min, max]]) =>
    el('label', { key, className: 'col' }, [
      t(
        `${prefix}.${key === 'maxFriends' && settings.acceptancePolicy === 'desktop-ten-percent' ? 'mutualOnlyAt' : key}`
      ),
      el('input', {
        key: 'input',
        type: 'number',
        min,
        max,
        step: key === 'topPercentMutuals' ? 'any' : 1,
        disabled,
        [`data-${name === 'friends' ? 'friend' : name}-field`]: key,
        value: numberValue(key),
        onChange: (event) => update(key, event.target.value),
      }),
    ])
  );
  const submit = () => {
    const next = { ...settings };
    for (const key of Object.keys(numericFields)) {
      next[key] = Number(numberValue(key));
    }
    for (const key of [...Object.keys(textFields), ...booleanFields]) {
      next[key] = draft[key] ?? settings[key];
    }
    const ids = priorityText;
    next.priorityIds = ids.trim() ? ids.split(',').map(Number) : [];
    return save(next);
  };
  return el('div', { className: 'col' }, [
    name === 'friends'
      ? el(FriendAcceptanceChoice, { key: 'policy', settings, disabled, save })
      : null,
    ...controls,
    ...Object.entries(textFields).map(([key, maxLength]) =>
      el('label', { key, className: 'col' }, [
        t(`${prefix}.${key}`),
        el('textarea', {
          key: 'input',
          maxLength,
          rows: 2,
          disabled,
          [`data-${name}-field`]: key,
          value: draft[key] ?? settings[key],
          onChange: (event) => update(key, event.target.value),
        }),
      ])
    ),
    messageDefaults
      ? el(VkMessageDefaults, {
          key: 'message-defaults',
          name,
          defaults: messageDefaults,
          settings,
          draft,
          disabled,
          replace: (patch) => setDraft((before) => ({ ...before, ...patch })),
        })
      : null,
    ...booleanFields.map((key) =>
      el('label', { key, className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          disabled,
          [`data-${name}-field`]: key,
          checked: draft[key] ?? settings[key],
          onChange: (event) => update(key, event.target.checked),
        }),
        t(`${prefix}.${key}`),
      ])
    ),
    el('label', { key: 'priority', className: 'col' }, [
      t(`${prefix}.priorityIds`),
      el('input', {
        key: 'input',
        type: 'text',
        disabled,
        value: priorityText,
        [`data-${name === 'friends' ? 'friend' : name}-field`]: 'priorityIds',
        onChange: (event) =>
          setDraft((before) => ({
            ...before,
            priorityIds: event.target.value,
            priorityKey,
          })),
      }),
    ]),
    priorityActions
      ? el(VkFriendPriorityActions, {
          key: 'priority-actions',
          disabled,
          ...priorityActions,
        })
      : null,
    el(
      'button',
      {
        key: 'save',
        type: 'button',
        disabled,
        'data-action': `vk-${name}-save`,
        onClick: submit,
      },
      t(`${prefix}.save`)
    ),
  ]);
};
const FriendResults = ({
  data,
  prefix,
  name,
  evidence: Evidence,
  summary: Summary,
}) => {
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
            [`data-vk-${name}-plan`]: plan.status,
          },
          [
            el(
              'p',
              { key: 'account' },
              t(`${prefix}.account`, {
                id: plan.accountId,
                count: plan.friendCount,
              })
            ),
            Summary ? el(Summary, { key: 'summary', plan, last }) : null,
            el(
              'ul',
              { key: 'items' },
              plan.items.map((item) =>
                el(
                  'li',
                  {
                    key: item.userId,
                    [`data-${name === 'friends' ? 'friend' : name}-id`]:
                      item.userId,
                    [`data-${name === 'friends' ? 'friend' : name}-reason`]:
                      item.reason,
                  },
                  [
                    `${item.userId}: ${t(`${prefix}.${item.action}`)} · ${t(`${prefix}.${item.reason}`)}${item.priority ? ` · ${t(`${prefix}.priority`)}` : ''}${friendMutualLabel(t, item)}`,
                    Evidence
                      ? el(Evidence, { key: 'evidence', item, plan, last })
                      : null,
                  ]
                )
              )
            ),
            el(FriendQuotaSummary, { key: 'quota', quota: plan.quota }),
          ]
        )
      : null,
    el(
      'p',
      {
        key: 'last',
        role: 'status',
        [`data-vk-${name}-status`]: last?.status ?? 'idle',
      },
      t(`${prefix}.${last?.status ?? 'idle'}`)
    ),
    el(
      'ul',
      { key: 'outcomes' },
      (last?.results ?? []).map((row) =>
        el(
          'li',
          { key: row.userId },
          `${row.userId}: ${t(`${prefix}.${row.outcome ?? row.status}`)}`
        )
      )
    ),
  ]);
};
const FriendFeedback = ({ busy, error, data, prefix }) => {
  const t = useT();
  return el(React.Fragment, null, [
    busy ? el(Busy, { key: 'busy' }, t(`${prefix}.loading`)) : null,
    error
      ? el('p', { key: 'error', role: 'alert' }, t(`${prefix}.failed`))
      : null,
    data && !data.schedulerRunning
      ? el('p', { key: 'inactive', className: 'meta' }, t(`${prefix}.inactive`))
      : null,
  ]);
};
export const VkFriendPolicy = ({
  resource,
  name,
  prefix,
  fields,
  textFields = {},
  booleanFields = [],
  evidence,
  summary,
}) => {
  const t = useT();
  const { data, busy, error, run } = useAcknowledgedResource(resource.load);
  const [priorityVersion, setPriorityVersion] = useState(0);
  const editPriority = (operation) =>
    run(async () => {
      const answer = await operation();
      if (answer?.ok) {
        setPriorityVersion((version) => version + 1);
      }
      return answer;
    });
  const save = (settings) => run(() => resource.save(settings));
  const settings = data?.settings;
  return el('section', { className: 'col', [`data-vk-${name}`]: '' }, [
    el('h3', { key: 'title' }, t(`${prefix}.title`)),
    el('p', { key: 'hint', className: 'meta' }, t(`${prefix}.hint`)),
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        disabled: busy || !settings,
        checked: settings?.enabled ?? false,
        'data-action': `vk-${name}-enabled`,
        onChange: (event) =>
          save({ ...settings, enabled: event.target.checked }),
      }),
      t(`${prefix}.enabled`),
    ]),
    settings
      ? el(FriendSettings, {
          key: 'settings',
          settings,
          disabled: busy,
          save,
          fields,
          textFields,
          booleanFields,
          prefix,
          name,
          priorityVersion,
          messageDefaults: data.messageDefaults,
          priorityActions: friendPriorityActions(resource, data, editPriority),
        })
      : null,
    el('div', { key: 'buttons', className: 'row' }, [
      el(
        'button',
        {
          key: 'plan',
          type: 'button',
          disabled: busy || !data?.canRun,
          'data-action': `vk-${name}-plan`,
          onClick: () => run(resource.plan),
        },
        t(`${prefix}.plan`)
      ),
      el(
        'button',
        {
          key: 'run',
          type: 'button',
          disabled: busy || !data?.canRun || data?.plan?.status !== 'review',
          'data-action': `vk-${name}-run`,
          onClick: () => run(() => resource.run(data.plan.planId)),
        },
        t(`${prefix}.run`)
      ),
      el(
        'button',
        {
          key: 'refresh',
          type: 'button',
          disabled: busy,
          'data-action': `vk-${name}-refresh`,
          onClick: () => run(resource.load),
        },
        t(`${prefix}.refresh`)
      ),
    ]),
    el(FriendFeedback, { key: 'feedback', busy, error, data, prefix }),
    el(FriendResults, {
      key: 'results',
      data,
      prefix,
      name,
      evidence,
      summary,
    }),
  ]);
};

export const VkFriends = () =>
  el(VkFriendPolicy, {
    name: 'friends',
    prefix: 'vkFriends',
    fields: friendFields,
    resource: {
      load: api.vkFriends,
      save: api.saveVkFriends,
      plan: api.planVkFriends,
      run: api.runVkFriends,
      seedPriority: api.seedVkFriendPriority,
      clearPriority: api.clearVkFriendPriority,
    },
  });
