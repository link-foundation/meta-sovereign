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
const answerStatusKey = (answer, noticeAdmitted) => {
  if (noticeAdmitted) {
    return 'noticePolicy.admitted';
  }
  if (answer.noReply) {
    return 'questions.noReply';
  }
  if (answer.requiresReview) {
    return 'questions.reviewRequired';
  }
  return answer.acceptedSummary?.state === 'matched'
    ? 'questions.acceptedSummary.matched'
    : 'questions.approvedComplete';
};
const AcceptedSummaryEvidence = ({ value }) => {
  const t = useT();
  return value && value.state !== 'matched'
    ? el(
        'p',
        {
          className: 'meta',
          'data-answer-summary-state': value.state,
        },
        t(`questions.acceptedSummary.${value.state}`)
      )
    : null;
};

const NoticeReviewEvidence = ({ answer, noticeAdmitted }) => {
  const t = useT();
  return answer.notice && !noticeAdmitted
    ? el(
        'p',
        { key: 'notice', className: 'meta', 'data-notice-evidence': true },
        t('questions.noticeReview')
      )
    : null;
};

export const AnswerEvidence = ({ answer, noticeAdmitted = false }) => {
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
      t(answerStatusKey(answer, noticeAdmitted))
    ),
    el(NoticeReviewEvidence, { key: 'notice', answer, noticeAdmitted }),
    el(AcceptedSummaryEvidence, {
      key: 'summary-proof',
      value: answer.acceptedSummary,
    }),
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
