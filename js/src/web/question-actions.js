import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const ProfileFields = ({ profile = {}, set }) => {
  const t = useT();
  const [newKey, setNewKey] = React.useState('');
  return el('div', { className: 'col', 'data-answer-profile': true }, [
    el('strong', { key: 'h' }, t('questions.profile')),
    ...Object.entries(profile).map(([key, value]) =>
      el('div', { key, className: 'field' }, [
        el('span', { key: 'l', className: 'field-label' }, key),
        el('textarea', {
          key: 'v',
          rows: 2,
          'aria-label': key,
          value,
          onChange: (event) => set({ ...profile, [key]: event.target.value }),
        }),
        el(
          'button',
          {
            key: 'd',
            type: 'button',
            onClick: () =>
              set(
                Object.fromEntries(
                  Object.entries(profile).filter(([name]) => name !== key)
                )
              ),
          },
          t('questions.removeField')
        ),
      ])
    ),
    el('div', { key: 'add', className: 'row' }, [
      el('input', {
        key: 'k',
        value: newKey,
        'aria-label': t('questions.fieldName'),
        placeholder: t('questions.fieldName'),
        onChange: (event) => setNewKey(event.target.value),
      }),
      el(
        'button',
        {
          key: 'b',
          type: 'button',
          disabled:
            !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u.test(newKey) ||
            Object.hasOwn(profile, newKey),
          onClick: () => {
            set({ ...profile, [newKey]: '' });
            setNewKey('');
          },
        },
        t('questions.addField')
      ),
    ]),
  ]);
};

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
