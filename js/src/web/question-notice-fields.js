import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const LearnedNoticePatterns = ({ patterns = [] }) => {
  const t = useT();
  return patterns.length
    ? el(
        'details',
        { className: 'col', 'data-learned-notice-patterns': true },
        [
          el('summary', { key: 'title' }, t('questions.learnedNoticePatterns')),
          el(
            'p',
            { key: 'hint', className: 'meta' },
            t('questions.learnedNoticePatternsHint')
          ),
          el(
            'ul',
            { key: 'patterns' },
            patterns.map((pattern) =>
              el('li', { key: pattern }, el('code', null, pattern))
            )
          ),
        ]
      )
    : null;
};

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
          onChange: (event) =>
            set({
              ...rule,
              kind: event.target.value,
              ...(event.target.value === 'question'
                ? { learnedPatterns: [] }
                : {}),
            }),
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
    el(LearnedNoticePatterns, {
      key: 'learned',
      patterns: rule.learnedPatterns,
    }),
  ]);
};
