import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

// Shared across automation previews, Chat and Operator draft cards.
export const AnswerEvidence = ({ answer }) => {
  const t = useT();
  if (!answer) {
    return null;
  }
  return el('div', { className: 'col', 'data-answer-evidence': true }, [
    el('strong', { key: 'match' }, t(`questions.match.${answer.match}`)),
    el(
      'p',
      { key: 'state', className: 'meta' },
      t(
        answer.requiresReview
          ? 'questions.reviewRequired'
          : 'questions.approvedComplete'
      )
    ),
    answer.missing?.length
      ? el(
          'p',
          { key: 'missing' },
          t('questions.missing', { fields: answer.missing.join(', ') })
        )
      : null,
    Number.isSafeInteger(answer.count)
      ? el(
          'small',
          { key: 'count', className: 'meta' },
          t('questions.frequency', { count: answer.count })
        )
      : null,
    answer.rules?.length
      ? el('details', { key: 'evidence' }, [
          el('summary', { key: 'summary' }, t('questions.evidence')),
          el(
            'ul',
            { key: 'rules', style: { overflowWrap: 'anywhere' } },
            [...answer.rules, ...(answer.evidence ?? [])].map((id) =>
              el('li', { key: id }, id)
            )
          ),
        ])
      : null,
  ]);
};
