import React, { useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { Busy } from '../spinner.js';
import { useAcknowledgedResource } from './use-acknowledged-resource.js';

const el = React.createElement;
const OnlineStatus = ({ data, busy, error }) => {
  const t = useT();
  const last = data?.last;
  return el(React.Fragment, null, [
    busy ? el(Busy, { key: 'busy' }, t('vkOnline.loading')) : null,
    error
      ? el('p', { key: 'error', role: 'alert' }, t('vkOnline.failed'))
      : null,
    data && !data.schedulerRunning
      ? el('p', { key: 'inactive', className: 'meta' }, t('vkOnline.inactive'))
      : null,
    el(
      'p',
      {
        key: 'last',
        role: 'status',
        'data-vk-online-status': last?.status ?? 'idle',
      },
      t(`vkOnline.${last?.status ?? 'idle'}`, {
        time: last?.confirmedAt ?? last?.attemptedAt ?? '',
      })
    ),
  ]);
};

export const VkOnline = () => {
  const t = useT();
  const { data, busy, error, run } = useAcknowledgedResource(api.vkOnline);
  const [minutes, setMinutes] = useState(null);
  const save = (enabled) =>
    run(() =>
      api.saveVkOnline({
        enabled,
        everyMinutes: Number(minutes ?? data.settings.everyMinutes),
      })
    );
  const settings = data?.settings ?? { enabled: false, everyMinutes: 14 };
  return el('section', { className: 'col', 'data-vk-online': '' }, [
    el('h3', { key: 'title' }, t('vkOnline.title')),
    el('p', { key: 'hint', className: 'meta' }, t('vkOnline.hint')),
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        'data-action': 'vk-online-enabled',
        checked: settings.enabled,
        disabled: busy || !data,
        onChange: (event) => save(event.target.checked),
      }),
      t('vkOnline.enabled'),
    ]),
    el('label', { key: 'minutes', className: 'col' }, [
      t('vkOnline.minutes'),
      el('input', {
        key: 'input',
        type: 'number',
        min: 1,
        max: 14,
        step: 1,
        value: minutes ?? settings.everyMinutes,
        disabled: busy || !data,
        'data-action': 'vk-online-minutes',
        onChange: (event) => setMinutes(event.target.value),
      }),
    ]),
    el('div', { key: 'buttons', className: 'row' }, [
      el(
        'button',
        {
          key: 'save',
          type: 'button',
          disabled: busy || !data,
          'data-action': 'vk-online-save',
          onClick: () => save(data.settings.enabled),
        },
        t('vkOnline.save')
      ),
      el(
        'button',
        {
          key: 'run',
          type: 'button',
          disabled: busy || !data?.canRun,
          'data-action': 'vk-online-run',
          onClick: () => run(api.runVkOnline),
        },
        t('vkOnline.run')
      ),
      el(
        'button',
        {
          key: 'refresh',
          type: 'button',
          disabled: busy,
          'data-action': 'vk-online-refresh',
          onClick: () => run(api.vkOnline),
        },
        t('vkOnline.refresh')
      ),
    ]),
    el(OnlineStatus, { key: 'status', data, busy, error }),
  ]);
};
