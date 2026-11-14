import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const QuestionMatchResults = ({ results, busy, page }) => {
  const t = useT();
  if (!results) {
    return null;
  }
  return el('section', { className: 'col', 'data-answer-matches': '' }, [
    el('h3', { key: 'title' }, t('questions.matchesTitle')),
    el(
      'p',
      { key: 'range', role: 'status' },
      t('questions.matchesRange', {
        start: results.items.length ? results.offset + 1 : 0,
        end: results.offset + results.items.length,
        total: results.total,
      })
    ),
    !results.complete
      ? el(
          'p',
          { key: 'partial', role: 'alert' },
          t('questions.matchesPartial')
        )
      : null,
    el(
      'ol',
      {
        key: 'list',
        start: results.offset + 1,
        style: { overflowWrap: 'anywhere' },
      },
      results.items.map((item, index) =>
        el(
          'li',
          { key: index, 'data-ranked-match': item.rule, className: 'col' },
          [
            el('strong', { key: 'question' }, item.question),
            el(
              'small',
              { key: 'score', className: 'meta' },
              t('questions.matchScore', {
                score: Math.round(item.similarity * 10000) / 100,
              })
            ),
            el(
              'span',
              { key: 'answer', style: { whiteSpace: 'pre-wrap' } },
              item.text
            ),
            el(
              'small',
              { key: 'count', className: 'meta' },
              t('questions.frequency', { count: item.count })
            ),
            item.selected
              ? el('small', { key: 'selected' }, t('questions.matchSelected'))
              : null,
            el('small', { key: 'rule', className: 'meta' }, item.rule),
          ]
        )
      )
    ),
    page
      ? el('div', { key: 'pages', className: 'row' }, [
          el(
            'button',
            {
              key: 'previous',
              type: 'button',
              disabled: busy || results.offset === 0,
              onClick: () => page(Math.max(0, results.offset - results.limit)),
            },
            t('questions.matchesPrevious')
          ),
          el(
            'button',
            {
              key: 'next',
              type: 'button',
              disabled: busy || !results.hasMore,
              onClick: () => page(results.offset + results.limit),
            },
            t('questions.matchesNext')
          ),
        ])
      : null,
  ]);
};
