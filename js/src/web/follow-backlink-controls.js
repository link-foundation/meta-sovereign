import React from 'react';
import { useT } from './i18n.js';
import { useFollowBacklink } from './follow-backlink-state.js';

const el = React.createElement;
const label = (key, t) => t(`followBacklink.${key}`);
const action = (key, state, t, id) =>
  el(
    'button',
    {
      key,
      type: 'button',
      disabled: state.busy,
      'data-follow-backlink-action': key,
      onClick: () => state.perform(key, id),
    },
    label(key, t)
  );
const field = (key, state, t) => {
  const checkbox = key === 'deleteIncoming';
  const text = ['chats', 'backlink'].includes(key);
  const input = el('input', {
    key: 'input',
    type: checkbox ? 'checkbox' : text ? 'text' : 'number',
    ...(checkbox ? { checked: state.form[key] } : { value: state.form[key] }),
    disabled: state.busy,
    'data-follow-backlink-field': key,
    onChange: (event) =>
      state.change(key, checkbox ? event.target.checked : event.target.value),
  });
  return el(
    'label',
    { key, className: checkbox ? 'check' : 'field' },
    checkbox
      ? [input, ` ${label(key, t)}`]
      : [
          el('span', { key: 'label', className: 'field-label' }, label(key, t)),
          input,
        ]
  );
};
const status = (key, t) => {
  const translated = label(key, t);
  return translated === `followBacklink.${key}`
    ? label('failed', t)
    : translated;
};
const summary = (value, t) => [
  el('p', { key: 'owner' }, t('followBacklink.owner', { owner: value.owner })),
  el(
    'code',
    { key: 'link', style: { overflowWrap: 'anywhere' } },
    value.config.backlink
  ),
  el(
    'p',
    { key: 'window' },
    t('followBacklink.window', {
      duration: value.config.monitorMs,
      interval: value.config.intervalMs,
    })
  ),
  value.config.deleteIncoming
    ? el(
        'p',
        { key: 'delete', className: 'meta' },
        t('followBacklink.cleanupHint', { limit: value.config.historyLimit })
      )
    : null,
];
const rows = (value, t) =>
  el(
    'ul',
    { key: 'rows' },
    value.rows.map((row) =>
      el('li', { key: row.chat, style: { overflowWrap: 'anywhere' } }, [
        el('strong', { key: 'chat' }, `${row.title || row.chat} · ${row.chat}`),
        el(
          'p',
          { key: 'status' },
          `${status(row.status, t)}${row.messageId ? ` · ${t('followBacklink.message', { id: row.messageId })}` : ''}`
        ),
        row.skipRetry ? el('p', { key: 'skip' }, label('skipNotice', t)) : null,
        row.code ? el('p', { key: 'error' }, status(row.code, t)) : null,
        row.providerCode
          ? el(
              'code',
              { key: 'provider' },
              t('followBacklink.providerCode', { code: row.providerCode })
            )
          : null,
        row.cleanup
          ? el(
              'p',
              { key: 'cleanup' },
              t('followBacklink.cleanupResult', {
                status: status(row.cleanup.status, t),
                count: row.cleanup.confirmed.length,
              })
            )
          : null,
      ])
    )
  );

export const FollowBacklinkControls = ({ api }) => {
  const t = useT();
  const state = useFollowBacklink(api);
  return el('details', { className: 'card col', 'data-follow-backlinks': '' }, [
    el('summary', { key: 'title' }, label('title', t)),
    el('p', { key: 'hint', className: 'meta' }, label('hint', t)),
    ...[
      'chats',
      'backlink',
      'monitorMs',
      'intervalMs',
      'delayMs',
      'deleteIncoming',
      'historyLimit',
      'attempts',
      'retryDelayMs',
      'retryMaxDelayMs',
    ].map((key) => field(key, state, t)),
    el(
      'div',
      { key: 'actions', className: 'row', style: { flexWrap: 'wrap' } },
      [action('preview', state, t), action('list', state, t)]
    ),
    state.busy
      ? el('p', { key: 'busy', role: 'status' }, label('working', t))
      : null,
    state.error
      ? el('p', { key: 'error', role: 'alert' }, status(state.error, t))
      : null,
    state.plan
      ? el(
          'article',
          {
            key: 'plan',
            className: 'card col',
            'data-follow-backlink-plan': '',
          },
          [
            el('h3', { key: 'h' }, label('review', t)),
            ...summary(state.plan, t),
            rows(state.plan, t),
            action('apply', state, t),
          ]
        )
      : null,
    state.job
      ? el(
          'article',
          {
            key: 'job',
            className: 'card col',
            'data-follow-backlink-job': state.job.id,
          },
          [
            el('h3', { key: 'h' }, status(state.job.status, t)),
            el(
              'code',
              { key: 'id', style: { overflowWrap: 'anywhere' } },
              state.job.id
            ),
            ...summary(state.job, t),
            rows(state.job, t),
            state.job.failure
              ? el(
                  'p',
                  { key: 'failure', role: 'alert' },
                  status(state.job.failure.code, t)
                )
              : null,
            el(
              'div',
              { key: 'actions', className: 'row', style: { flexWrap: 'wrap' } },
              [
                action('status', state, t),
                ['queued', 'running'].includes(state.job.status)
                  ? action('cancel', state, t)
                  : null,
                state.job.status === 'paused'
                  ? action('resume', state, t)
                  : null,
              ]
            ),
          ]
        )
      : null,
    state.history
      ? el('div', { key: 'history', className: 'col' }, [
          el(
            'p',
            { key: 'count' },
            t('followBacklink.history', { count: state.history.total })
          ),
          state.history.nextOffset !== null
            ? el(
                'button',
                {
                  key: 'next',
                  type: 'button',
                  disabled: state.busy,
                  onClick: () =>
                    state.perform('list', state.history.nextOffset),
                },
                label('next', t)
              )
            : null,
          ...state.history.jobs.map((job) =>
            el(
              'button',
              {
                key: job.id,
                type: 'button',
                disabled: state.busy,
                onClick: () => state.perform('status', job.id),
                style: { overflowWrap: 'anywhere' },
              },
              `${status(job.status, t)} · ${job.id}`
            )
          ),
        ])
      : null,
  ]);
};
