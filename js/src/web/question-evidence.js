import React from 'react';
import { useT } from './i18n.js';
import { AnswerModelStatus } from './answer-model-settings.js';
import {
  SalaryCalculationEvidence,
  SalaryExchangeEvidence,
  SalaryTemplateEvidence,
  SalaryGuidanceEvidence,
} from './question-salary-evidence.js';

const el = React.createElement;
const AnswerParts = ({ parts }) => {
  const t = useT();
  return parts?.length
    ? el('details', { 'data-answer-parts': true }, [
        el('summary', { key: 'title' }, t('questions.match.assembled')),
        ...parts.map((part, index) =>
          el('div', { key: index }, [
            el('p', { key: 'question' }, part.question),
            el(AnswerEvidence, { key: 'answer', answer: part }),
          ])
        ),
      ])
    : null;
};

// Shared across automation previews, Chat and Operator draft cards.
export const AnswerEvidence = ({ answer }) => {
  const t = useT();
  if (!answer) {
    return null;
  }
  return el('div', { className: 'col', 'data-answer-evidence': true }, [
    el(AnswerModelStatus, { key: 'model', model: answer.model }),
    el(AnswerParts, { key: 'parts', parts: answer.parts }),
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
    el(ProfileEvidence, { key: 'profile', source: answer.profileSource }),
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
    el(SalaryGuidanceEvidence, {
      key: 'guidance',
      salary: answer.salary,
    }),
    el(SalaryTemplateEvidence, {
      key: 'salary-templates',
      value: answer.salaryTemplates,
    }),
    answer.rules?.length || answer.evidence?.length
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

const ProfileEvidence = ({ source }) => {
  const t = useT();
  return source
    ? el('details', { key: 'profile', 'data-profile-evidence': true }, [
        el('summary', { key: 'summary' }, t('questions.sharedEvidence')),
        el(
          'p',
          { key: 'source', style: { overflowWrap: 'anywhere' } },
          `${source.name} · ${source.id} · ${source.updatedAt} · ${source.revision}`
        ),
        source.overriddenKeys?.length
          ? el(
              'p',
              { key: 'overrides' },
              t('questions.sharedOverriddenKeys', {
                fields: source.overriddenKeys.join(', '),
              })
            )
          : null,
      ])
    : null;
};
