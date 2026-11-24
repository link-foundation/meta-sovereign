import React from 'react';
import { useT } from './i18n.js';
import {
  maxNoticePolicyOverrides,
  noticePolicyModes,
} from '../automation/question-notice-policy.js';

const el = React.createElement;

const NoticeDecisions = ({ value, change, scoped = false }) => {
  const t = useT();
  const update = (field, next) => {
    const { [field]: _previous, ...rest } = value;
    change(scoped && !next.trim() ? rest : { ...rest, [field]: next });
  };
  return el(React.Fragment, null, [
    ...Object.entries(noticePolicyModes).map(([kind, modes]) =>
      el('label', { key: kind, className: 'field' }, [
        el(
          'span',
          { key: 'label', className: 'field-label' },
          t(`noticePolicy.${kind}`)
        ),
        el(
          'select',
          {
            key: 'input',
            'aria-label': t(`noticePolicy.${kind}`),
            value: value[kind] ?? '',
            onChange: (event) => update(kind, event.target.value),
          },
          (scoped ? ['', ...modes] : modes).map((mode) =>
            el(
              'option',
              { key: mode, value: mode },
              mode
                ? t(
                    `noticePolicy.${kind === 'acknowledgements' && mode === 'reply' ? 'exactReply' : mode}`
                  )
                : t('noticePolicy.inherit')
            )
          )
        ),
      ])
    ),
    el('label', { key: 'reply', className: 'field' }, [
      el(
        'span',
        { key: 'label', className: 'field-label' },
        t('noticePolicy.rejectionReply')
      ),
      el('textarea', {
        key: 'input',
        rows: scoped ? 2 : 3,
        maxLength: 12000,
        required: !scoped,
        'aria-label': t('noticePolicy.rejectionReply'),
        value: value.rejectionReply ?? '',
        placeholder: scoped ? t('noticePolicy.inherit') : undefined,
        onChange: (event) => update('rejectionReply', event.target.value),
      }),
    ]),
  ]);
};

const ScopeField = ({ name, value, change, required, maxLength }) => {
  const t = useT();
  const label = t(`noticePolicy.${name}`);
  return el('label', { className: 'field' }, [
    el('span', { key: 'label', className: 'field-label' }, label),
    el('input', {
      key: 'input',
      'aria-label': label,
      value: value ?? '',
      required,
      maxLength,
      placeholder: name === 'providerId' ? 'hh' : undefined,
      onChange: (event) => change(event.target.value),
    }),
  ]);
};

const NoticeOverrides = ({ overrides, change }) => {
  const t = useT();
  return el('fieldset', { className: 'col', 'data-notice-overrides': true }, [
    el('legend', { key: 'title' }, t('noticePolicy.overrides')),
    ...overrides.map((entry, index) => {
      const edit = (next) =>
        change(
          overrides.map((previous, at) => (at === index ? next : previous))
        );
      return el(
        'fieldset',
        { key: index, className: 'col', 'data-notice-override': true },
        [
          el(ScopeField, {
            key: 'source',
            name: 'providerId',
            value: entry.source,
            change: (source) => edit({ ...entry, source }),
            maxLength: 80,
            required: true,
          }),
          el(ScopeField, {
            key: 'chat',
            name: 'chatId',
            value: entry.chat,
            change: (chat) => {
              const { chat: _previous, ...rest } = entry;
              edit(chat ? { ...rest, chat } : rest);
            },
            maxLength: 480,
          }),
          el(NoticeDecisions, {
            key: 'decisions',
            value: entry,
            change: edit,
            scoped: true,
          }),
          el(
            'button',
            {
              key: 'remove',
              type: 'button',
              onClick: () => change(overrides.filter((_, at) => at !== index)),
            },
            t('noticePolicy.removeOverride')
          ),
        ]
      );
    }),
    el(
      'button',
      {
        key: 'add',
        type: 'button',
        disabled: overrides.length >= maxNoticePolicyOverrides,
        onClick: () =>
          change([...overrides, { source: '', acknowledgements: 'review' }]),
      },
      t('noticePolicy.addOverride')
    ),
  ]);
};

export const NoticePolicyFields = ({ value, change }) => {
  const t = useT();
  return el('fieldset', { className: 'col', 'data-notice-policies': true }, [
    el('legend', { key: 'title' }, t('noticePolicy.title')),
    el('p', { key: 'hint', className: 'meta' }, t('noticePolicy.hint')),
    el(NoticeDecisions, { key: 'defaults', value, change }),
    el(NoticeOverrides, {
      key: 'overrides',
      overrides: value.overrides ?? [],
      change: (overrides) => change({ ...value, overrides }),
    }),
  ]);
};
