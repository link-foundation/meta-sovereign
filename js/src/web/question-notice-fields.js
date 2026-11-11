import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const NoticeRuleFields = ({ rule, set, disabled }) => {
  const t = useT();
  return el('div', { className: 'col', 'data-notice-rule': true }, [
    el('label', { key: 'kind', className: 'field' }, [
      el(
        'span',
        { key: 'label', className: 'field-label' },
        t('questions.ruleKind')
      ),
      el(
        'select',
        {
          key: 'select',
          'aria-label': t('questions.ruleKind'),
          value: rule.kind ?? 'question',
          disabled,
          onChange: (event) => set({ ...rule, kind: event.target.value }),
        },
        ['question', 'notice'].map((kind) =>
          el(
            'option',
            {
              key: kind,
              value: kind,
            },
            t(`questions.ruleKind.${kind}`)
          )
        )
      ),
    ]),
    rule.kind === 'notice'
      ? el('p', { key: 'hint', className: 'meta' }, t('questions.noticeHint'))
      : null,
  ]);
};
