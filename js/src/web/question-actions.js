import React from 'react';
import { useT } from './i18n.js';
import { ProfileFields } from './question-profile-fields.js';
import { AnswerContextFields } from './question-context-fields.js';
import { SalaryFields } from './question-salary-fields.js';

const el = React.createElement;
export const AutomationActionFields = ({
  form,
  set,
  error,
  Input,
  Choice,
  Check,
}) => {
  const t = useT();
  const p = { form, set, error };
  return el(React.Fragment, null, [
    el(Choice, {
      ...p,
      key: 'kind',
      name: 'actionKind',
      label: t('questions.action'),
      options: ['send-template', 'answer-questions'].map((kind) => [
        kind,
        t(`questions.kind.${kind}`),
      ]),
    }),
    ...(form.actionKind === 'answer-questions'
      ? [
          el(
            'p',
            { key: 'hint', className: 'meta' },
            t('questions.actionHint')
          ),
          el(Input, {
            ...p,
            key: 'ids',
            name: 'ruleIds',
            label: t('questions.ruleIds'),
            hint: t('questions.ruleIdsHint'),
          }),
          el(Check, {
            ...p,
            key: 'approx',
            name: 'approximate',
            label: t('questions.approximate'),
          }),
          el(AnswerContextFields, {
            key: 'contexts',
            contexts: form.contexts,
            set: (contexts) => set('contexts', contexts),
          }),
          el(SalaryFields, {
            key: 'salary',
            salary: form.salary,
            set: (salary) => set('salary', salary),
          }),
          el(ProfileFields, {
            key: 'profile',
            profile: form.profile,
            set: (profile) => set('profile', profile),
          }),
        ]
      : [
          el(Choice, {
            ...p,
            key: 'f',
            name: 'form',
            label: t('automations.field.form'),
            options: ['auto', 'informal', 'formal'].map((value) => [
              value,
              t(`automations.form.${value}`),
            ]),
          }),
          el(Input, {
            ...p,
            key: 'i',
            name: 'informal',
            multiline: 6,
            label: t('automations.form.informal'),
          }),
          el(Input, {
            ...p,
            key: 'o',
            name: 'formal',
            multiline: 6,
            label: t('automations.form.formal'),
            hint: t('automations.hint.template'),
          }),
        ]),
  ]);
};
