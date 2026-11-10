import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const AnswerEvidence = ({ evidence }) => {
  const t = useT();
  return evidence?.length
    ? el(
        'ul',
        { key: 'evidence' },
        evidence.map((item, index) =>
          el(
            'li',
            { key: index, className: 'meta' },
            t('forms.plan.evidence', { source: String(item) })
          )
        )
      )
    : null;
};
const proposedValue = (answer, t) =>
  answer.proposal?.checked === undefined
    ? (answer.proposal?.option ?? answer.proposal?.value)
    : t(answer.proposal.checked ? 'forms.checked' : 'forms.unchecked');
export const FormAnswer = ({ answer }) => {
  const t = useT();
  if (!answer) {
    return null;
  }
  const value = proposedValue(answer, t);
  return el(
    'div',
    { className: 'col form-answer', 'data-form-answer': answer.source },
    [
      el(
        'p',
        { key: 'value' },
        t(answer.proposal ? 'forms.plan.proposal' : 'forms.plan.unresolved', {
          value,
        })
      ),
      el(
        'p',
        { key: 'source', className: 'meta' },
        t('forms.plan.source', {
          source: t(`forms.plan.source.${answer.source}`),
        })
      ),
      Number.isFinite(answer.similarity)
        ? el(
            'p',
            { key: 'similarity', className: 'meta' },
            t('forms.plan.similarity', {
              percent: Math.round(answer.similarity * 100),
            })
          )
        : null,
      el(
        'p',
        { key: 'reason', className: 'meta' },
        t(`forms.plan.reason.${answer.reason}`)
      ),
      answer.missing?.length
        ? el(
            'p',
            { key: 'missing' },
            t('forms.plan.missing', { keys: answer.missing.join(', ') })
          )
        : null,
      answer.profileKeys?.length
        ? el(
            'p',
            { key: 'keys', className: 'meta' },
            t('forms.plan.keys', { keys: answer.profileKeys.join(', ') })
          )
        : null,
      answer.rules?.length
        ? el(
            'ul',
            { key: 'rules' },
            answer.rules.map((rule) =>
              el(
                'li',
                { key: rule.id },
                t('forms.plan.rule', { question: rule.question || rule.id })
              )
            )
          )
        : null,
      el(AnswerEvidence, { key: 'evidence', evidence: answer.evidence }),
    ]
  );
};
export const FormPlanSummary = ({ planning }) => {
  const t = useT();
  if (!planning) {
    return null;
  }
  return el(
    'div',
    { className: 'col', 'data-form-plan-summary': '', role: 'status' },
    [
      el('p', { key: 'count' }, t('forms.plan.count', planning)),
      el('p', { key: 'review', className: 'meta' }, t('forms.plan.review')),
      planning.profileSource
        ? el(
            'p',
            { key: 'profile', className: 'meta' },
            t('forms.plan.profileSource', {
              name: planning.profileSource.name ?? planning.profileSource.id,
              revision: planning.profileSource.revision,
            })
          )
        : null,
      el(
        'p',
        { key: 'model', className: 'meta' },
        t('forms.plan.modelUnavailable')
      ),
    ]
  );
};
