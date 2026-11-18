import React from 'react';
import { useT } from './i18n.js';
import { ProfileFields } from './question-profile-fields.js';

const el = React.createElement;
const Field = ({ label, value, set, rows, ...props }) =>
  el('label', { className: 'field' }, [
    el('span', { key: 'l', className: 'field-label' }, label),
    el(rows ? 'textarea' : 'input', {
      key: 'v',
      value,
      rows,
      'aria-label': label,
      onChange: (event) => set(event.target.value),
      ...props,
    }),
  ]);
const Button = ({ children, ...props }) =>
  el('button', { type: 'button', ...props }, children);
const blankChoice = () => ({ id: '', keywords: [], profile: {} });

const ContextChoice = ({ choice, set, remove }) => {
  const t = useT();
  return el('fieldset', { className: 'col', 'data-context-choice': true }, [
    el('legend', { key: 'l' }, t('questions.contextChoice')),
    el(Field, {
      key: 'id',
      label: t('questions.contextChoiceId'),
      value: choice.id,
      set: (id) => set({ ...choice, id }),
      maxLength: 64,
    }),
    el(Field, {
      key: 'keywords',
      label: t('questions.contextKeywords'),
      rows: 3,
      value: choice.keywordsText ?? choice.keywords.join('\n'),
      set: (value) =>
        set({
          ...choice,
          keywords: value.split('\n').filter((word) => word.trim()),
          keywordsText: value,
        }),
    }),
    el(ProfileFields, {
      key: 'profile',
      profile: choice.profile,
      set: (profile) => set({ ...choice, profile }),
    }),
    el(
      Button,
      { key: 'r', onClick: remove },
      t('questions.contextRemoveChoice')
    ),
  ]);
};

const ContextGroup = ({ group, set, remove }) => {
  const t = useT();
  const change = (index, choice) =>
    set({
      ...group,
      choices: group.choices.map((entry, at) =>
        at === index ? choice : entry
      ),
    });
  return el('fieldset', { className: 'col', 'data-context-group': true }, [
    el('legend', { key: 'l' }, group.key || t('questions.contextGroup')),
    el(Field, {
      key: 'key',
      label: t('questions.contextKey'),
      value: group.key,
      set: (key) => set({ ...group, key }),
      maxLength: 64,
    }),
    el('label', { key: 'default', className: 'field' }, [
      el(
        'span',
        { key: 'l', className: 'field-label' },
        t('questions.contextDefault')
      ),
      el(
        'select',
        {
          key: 's',
          'aria-label': t('questions.contextDefault'),
          value: group.default ?? '',
          onChange: (event) =>
            set({ ...group, default: event.target.value || null }),
        },
        [
          el('option', { key: '', value: '' }, t('questions.contextNoDefault')),
          ...group.choices
            .filter((choice) => choice.id)
            .map((choice, index) =>
              el('option', { key: index, value: choice.id }, choice.id)
            ),
        ]
      ),
    ]),
    ...group.choices.map((choice, index) =>
      el(ContextChoice, {
        key: index,
        choice,
        set: (value) => change(index, value),
        remove: () =>
          set({
            ...group,
            default: group.default === choice.id ? null : group.default,
            choices: group.choices.filter((_, at) => at !== index),
          }),
      })
    ),
    el(
      Button,
      {
        key: 'add',
        disabled: group.choices.length >= 10,
        onClick: () =>
          set({ ...group, choices: [...group.choices, blankChoice()] }),
      },
      t('questions.contextAddChoice')
    ),
    el(
      Button,
      { key: 'remove', onClick: remove },
      t('questions.contextRemoveGroup')
    ),
  ]);
};

export const AnswerContextFields = ({ contexts = [], set }) => {
  const t = useT();
  return el('details', { 'data-answer-contexts': true }, [
    el('summary', { key: 's' }, t('questions.contexts')),
    el('p', { key: 'h', className: 'meta' }, t('questions.contextHint')),
    ...contexts.map((group, index) =>
      el(ContextGroup, {
        key: index,
        group,
        set: (value) =>
          set(contexts.map((entry, at) => (at === index ? value : entry))),
        remove: () => set(contexts.filter((_, at) => at !== index)),
      })
    ),
    el(
      Button,
      {
        key: 'add',
        disabled: contexts.length >= 10,
        onClick: () =>
          set([
            ...contexts,
            { key: '', default: null, choices: [blankChoice()] },
          ]),
      },
      t('questions.contextAddGroup')
    ),
  ]);
};

// Preview-only context is kept separate from the persisted action. Automatic
// delivery rebuilds it from the actual archived conversation and vacancy.
export const AnswerEnvironmentFields = ({ environment, set }) => {
  const t = useT();
  return el('details', { 'data-answer-environment': true }, [
    el('summary', { key: 's' }, t('questions.contextPreview')),
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t('questions.contextPreviewHint')
    ),
    el(Field, {
      key: 'recent',
      rows: 4,
      label: t('questions.contextRecent'),
      value: environment.recentText ?? '',
      set: (recentText) => set({ ...environment, recentText }),
    }),
    el(Field, {
      key: 'pay',
      label: t('questions.contextPay'),
      value: environment.vacancy?.pay ?? '',
      set: (pay) =>
        set({ ...environment, vacancy: { ...environment.vacancy, pay } }),
      maxLength: 6000,
    }),
    el(Field, {
      key: 'description',
      rows: 3,
      label: t('questions.contextDescription'),
      value: environment.vacancy?.description ?? '',
      set: (description) =>
        set({
          ...environment,
          vacancy: { ...environment.vacancy, description },
        }),
      maxLength: 6000,
    }),
  ]);
};
