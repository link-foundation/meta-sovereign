import React from 'react';
import { applicationMayRetry } from './application-session.js';

const el = React.createElement;
export const ApplicationQueueView = ({ application, idle, confirmed, t }) =>
  el('div', { className: 'col', 'data-application-queue': true }, [
    el('h4', { key: 'title' }, t('application.queueTitle')),
    el('p', { key: 'hint', className: 'meta' }, t('application.queueHint')),
    el(
      'button',
      {
        key: 'refresh',
        type: 'button',
        'data-application-action': 'queue',
        disabled: application.queueBusy,
        onClick: () => {
          void application.refreshQueue().catch(() => {});
        },
      },
      t('application.queueRead')
    ),
    application.queueBusy
      ? el('p', { key: 'busy', role: 'status' }, t('application.queueLoading'))
      : application.queueError
        ? el(
            'p',
            { key: 'error', role: 'alert' },
            t('application.queueUnknown')
          )
        : application.queue?.entries.length === 0
          ? el(
              'p',
              { key: 'empty', role: 'status' },
              t('application.queueEmpty')
            )
          : null,
    ...(application.queue?.entries ?? []).map((entry) =>
      el(
        'div',
        {
          key: entry.id,
          className: 'col',
          'data-application-queued': entry.url,
        },
        [
          el('p', { key: 'title' }, entry.title),
          entry.reason === 'generic-error'
            ? el(
                'p',
                { key: 'retryAt', 'data-application-retry-at': entry.retryAt },
                t(
                  entry.ready
                    ? 'application.retryReady'
                    : 'application.retryWaiting',
                  { at: entry.retryAt }
                )
              )
            : null,
          el(
            'p',
            {
              key: 'url',
              className: 'meta',
              style: { overflowWrap: 'anywhere' },
            },
            entry.url
          ),
          el(
            'button',
            {
              key: 'retry',
              type: 'button',
              'data-application-action': 'retry',
              disabled:
                !idle || !confirmed || !applicationMayRetry(application, entry),
              onClick: () => application.retry(entry),
            },
            t('application.retry')
          ),
        ]
      )
    ),
  ]);
