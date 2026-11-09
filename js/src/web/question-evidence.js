import React from 'react';
import { useT } from './i18n.js';
import {
  SalaryCalculationEvidence,
  SalaryExchangeEvidence,
} from './question-salary-evidence.js';

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
        answer.noReply
          ? 'questions.noReply'
          : answer.requiresReview
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
    answer.contexts?.length
      ? el(
          'details',
          { key: 'contexts', 'data-answer-context-evidence': true },
          [
            el('summary', { key: 'summary' }, t('questions.contextEvidence')),
            el(
              'ul',
              { key: 'values', style: { overflowWrap: 'anywhere' } },
              answer.contexts.map((entry) =>
                el(
                  'li',
                  { key: entry.key },
                  `${entry.key}: ${entry.choice ?? t('questions.contextNoDefault')} · ${t(`questions.contextSource.${entry.source}`)}${entry.evidence ? ` · ${entry.evidence}` : ''}`
                )
              )
            ),
          ]
        )
      : null,
    el(SalaryExchangeEvidence, {
      key: 'rate-state',
      state: answer.salaryExchange,
    }),
    el(SalaryCalculationEvidence, {
      key: 'calculation',
      calculation: answer.salary?.calculation,
    }),
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
