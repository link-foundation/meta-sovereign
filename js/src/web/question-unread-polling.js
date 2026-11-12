import React from 'react';
import { useT } from './i18n.js';
import { normalizeUnreadPolling } from '../automation/question-unread-polling-state.js';

const el = React.createElement;
const fields = [
  ['intervalMs', 1000, 1, 7200],
  ['durationMs', 60000, 1, 1440],
  ['retryMaxMs', 1000, 1, 7200],
  ['maxFailures', 1, 1, 10],
];

export const useUnreadPolling = () => {
  const [enabled, setEnabled] = React.useState(false);
  const [values, setValues] = React.useState({
    intervalMs: '10',
    durationMs: '120',
    retryMaxMs: '60',
    maxFailures: '3',
  });
  let settings;
  try {
    settings = normalizeUnreadPolling(
      Object.fromEntries(
        fields.map(([key, scale]) => [key, Number(values[key]) * scale])
      )
    );
  } catch {
    settings = null;
  }
  return {
    enabled,
    setEnabled,
    values,
    setValues,
    valid: !enabled || Boolean(settings),
    input: enabled ? { polling: settings } : {},
  };
};

export const UnreadPollingFields = ({ polling, disabled }) => {
  const t = useT();
  return el('div', { className: 'col' }, [
    el('label', { key: 'enabled', className: 'check' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: polling.enabled,
        disabled,
        'data-browser-unread-polling': true,
        onChange: (event) => polling.setEnabled(event.target.checked),
      }),
      t('browserUnread.polling'),
    ]),
    ...(polling.enabled
      ? [
          el(
            'p',
            { key: 'hint', className: 'meta' },
            t('browserUnread.pollingHint')
          ),
          ...fields.map(([key, , min, max]) =>
            el('label', { key, className: 'field' }, [
              el(
                'span',
                { key: 'label', className: 'field-label' },
                t(`browserUnread.${key}`)
              ),
              el('input', {
                key: 'input',
                type: 'number',
                min,
                max,
                step: 1,
                disabled,
                value: polling.values[key],
                'data-browser-unread-poll-field': key,
                onChange: (event) =>
                  polling.setValues({
                    ...polling.values,
                    [key]: event.target.value,
                  }),
              }),
            ])
          ),
        ]
      : []),
  ]);
};

export const UnreadPollingStatus = ({ polling }) => {
  const t = useT();
  if (!polling) {
    return null;
  }
  return el(
    'div',
    { className: 'col', 'data-browser-unread-poll-phase': polling.phase },
    [
      el(
        'p',
        { key: 'phase', role: 'status' },
        t(`browserUnread.poll.${polling.phase}`)
      ),
      el(
        'p',
        { key: 'counts', className: 'meta' },
        t('browserUnread.pollCounts', {
          passes: polling.passes,
          failures: polling.failures,
          max: polling.settings.maxFailures,
          expires: polling.expiresAt,
        })
      ),
      polling.nextAt
        ? el(
            'p',
            { key: 'next', className: 'meta' },
            t('browserUnread.pollNext', { next: polling.nextAt })
          )
        : null,
      polling.receiptPassId
        ? el(
            'p',
            { key: 'receipt', className: 'meta wrap' },
            t('browserUnread.pollReceipt', { id: polling.receiptPassId })
          )
        : null,
      polling.reason
        ? el(
            'p',
            { key: 'reason', className: 'meta' },
            t('browserWatch.reason', { code: polling.reason })
          )
        : null,
    ]
  );
};
