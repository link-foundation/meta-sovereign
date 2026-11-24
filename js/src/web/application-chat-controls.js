import React from 'react';
import { ModelDraftControl } from './answer-model-settings.js';
import { UnreadFormOption } from './question-unread-forms.js';

const el = React.createElement;
export const ApplicationChatControls = ({ draft, update, frozen, t }) =>
  el('div', { className: 'col', 'data-application-chats': true }, [
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: draft.processChats,
        disabled: frozen,
        'data-application-batch-field': 'processChats',
        onChange: (event) => update('processChats', event.target.checked),
      }),
      t('application.chats.enable'),
    ]),
    el('p', { key: 'hint', className: 'meta' }, t('application.chats.hint')),
    ...(draft.processChats
      ? [
          el('label', { key: 'watch-waiting', className: 'row' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: draft.chatWatchWaiting,
              disabled: frozen,
              'data-application-batch-field': 'chatWatchWaiting',
              onChange: (event) =>
                update('chatWatchWaiting', event.target.checked),
            }),
            t('browserUnread.watchWaiting'),
          ]),
          ...[
            ['chatsIntervalMinutes', 'number', 1, 120],
            ['chatBrowserSlot', 'text', undefined, undefined],
          ].map(([name, type, min, max]) =>
            el('label', { key: name, className: 'col' }, [
              t(`application.chats.${name}`),
              el('input', {
                key: 'input',
                type,
                min,
                max,
                maxLength: type === 'text' ? 80 : undefined,
                value:
                  draft[name] ??
                  (name === 'chatsIntervalMinutes'
                    ? draft.chatWatchWaiting
                      ? 1
                      : 120
                    : ''),
                disabled: frozen,
                'data-application-batch-field': name,
                onChange: (event) =>
                  update(
                    name,
                    type === 'number'
                      ? Number(event.target.value)
                      : event.target.value
                  ),
              }),
            ])
          ),
          el(ModelDraftControl, {
            key: 'model',
            value: draft.chatModelDraft,
            set: (value) => update('chatModelDraft', value),
            busy: frozen,
          }),
          el(UnreadFormOption, {
            key: 'forms',
            value: draft.chatPrefillForms,
            set: (value) => update('chatPrefillForms', value),
            disabled: frozen,
            field: 'chatPrefillForms',
          }),
        ]
      : []),
  ]);

export const ApplicationChatReceipt = ({
  worker,
  watchWaiting,
  skip,
  disabled,
  t,
}) =>
  worker
    ? el(
        'div',
        { className: 'col', 'data-application-chats-phase': worker.phase },
        [
          el(
            'p',
            { key: 'phase' },
            t('application.chats.status', {
              phase: t(
                watchWaiting && worker.phase === 'running'
                  ? 'application.chats.phase.watching'
                  : `application.chats.phase.${worker.phase}`
              ),
              slot: worker.browserSlot,
            })
          ),
          worker.code
            ? el('p', { key: 'code', role: 'alert' }, worker.code)
            : null,
          worker.held
            ? el(
                'div',
                {
                  key: 'held',
                  className: 'col',
                  'data-application-chats-held': true,
                },
                [
                  el(
                    'p',
                    { key: 'title' },
                    t('application.chats.held', { title: worker.held.title })
                  ),
                  worker.held.url
                    ? el(
                        'a',
                        {
                          key: 'url',
                          href: worker.held.url,
                          target: '_blank',
                          rel: 'noreferrer',
                          style: { overflowWrap: 'anywhere' },
                        },
                        worker.held.url
                      )
                    : null,
                  worker.skip
                    ? el(
                        'button',
                        {
                          key: 'skip',
                          type: 'button',
                          disabled,
                          'data-application-chats-skip': true,
                          onClick: () => void skip(worker.skip).catch(() => {}),
                        },
                        t('browserUnread.skip')
                      )
                    : null,
                ]
              )
            : null,
          worker.lastSkip
            ? el(
                'p',
                {
                  key: 'skipped',
                  role: 'status',
                  'data-application-chats-skipped': true,
                },
                t('browserUnread.skipConfirmed', { chat: worker.lastSkip.chat })
              )
            : null,
        ]
      )
    : null;
