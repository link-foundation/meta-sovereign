import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

export const NoticePolicyFields = ({ value, change }) => {
  const t = useT();
  return el('fieldset', { className: 'col', 'data-notice-policies': true }, [
    el('legend', { key: 'title' }, t('noticePolicy.title')),
    el('p', { key: 'hint', className: 'meta' }, t('noticePolicy.hint')),
    ...['acknowledgements', 'rejections', 'invitations'].map((kind) =>
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
            value: value[kind],
            onChange: (event) =>
              change({ ...value, [kind]: event.target.value }),
          },
          (kind === 'invitations'
            ? ['review', 'ignore']
            : ['review', 'ignore', 'reply']
          ).map((mode) =>
            el(
              'option',
              { key: mode, value: mode },
              t(
                `noticePolicy.${kind === 'acknowledgements' && mode === 'reply' ? 'exactReply' : mode}`
              )
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
        rows: 3,
        maxLength: 12000,
        required: true,
        'aria-label': t('noticePolicy.rejectionReply'),
        value: value.rejectionReply,
        onChange: (event) =>
          change({ ...value, rejectionReply: event.target.value }),
      }),
    ]),
  ]);
};
