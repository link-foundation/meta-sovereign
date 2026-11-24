import React from 'react';
import { useT } from './i18n.js';
import { NoticePolicyFields } from './question-notice-policy.js';
import { normalizeNoticePolicy } from '../automation/question-notice-policy.js';

const el = React.createElement;

const FinalPeriodField = ({ value, change, disabled }) => {
  const t = useT();
  return el('label', { className: 'field' }, [
    el(
      'span',
      { key: 'label', className: 'field-label' },
      t('questions.finalPeriod')
    ),
    el(
      'select',
      {
        key: 'input',
        'data-answer-final-period': true,
        value,
        disabled,
        onChange: (event) => change(event.target.value),
      },
      ['with', 'without'].map((style) =>
        el(
          'option',
          {
            key: style,
            value: style,
          },
          t(
            style === 'with'
              ? 'questions.finalPeriodWith'
              : 'questions.finalPeriodWithout'
          )
        )
      )
    ),
    el(
      'span',
      { key: 'hint', className: 'meta' },
      t('questions.finalPeriodHint')
    ),
  ]);
};

export const AnswerPolicyControls = ({ api, busy, run }) => {
  const t = useT();
  const [rejected, setRejected] = React.useState('');
  const [equivalent, setEquivalent] = React.useState(false);
  const [finalPeriod, setFinalPeriod] = React.useState('with');
  const [loaded, setLoaded] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [notices, setNotices] = React.useState(normalizeNoticePolicy);
  const load = () =>
    run(async () => {
      const policy = await api.answerPolicy();
      setRejected(policy.rejected.join('\n'));
      setEquivalent(policy.punctuationEquivalent);
      setFinalPeriod(policy.answerFinalPeriod ?? 'with');
      setNotices(normalizeNoticePolicy(policy.notices));
      setLoaded(true);
      setSaved(false);
    });
  return el(
    'details',
    {
      'data-answer-policy': true,
      onToggle: (event) => {
        if (
          event.target === event.currentTarget &&
          event.currentTarget.open &&
          !loaded
        ) {
          load();
        }
      },
    },
    [
      el('summary', { key: 'title' }, t('questions.policy')),
      el('p', { key: 'hint', className: 'meta' }, t('questions.policyHint')),
      el(
        'button',
        { key: 'refresh', type: 'button', disabled: busy, onClick: load },
        t('questions.refresh')
      ),
      el(
        'form',
        {
          key: 'form',
          className: 'col',
          onSubmit: (event) => {
            event.preventDefault();
            run(async () => {
              await api.saveAnswerPolicy({
                rejected: rejected
                  .split('\n')
                  .map((text) => text.trim())
                  .filter(Boolean),
                punctuationEquivalent: equivalent,
                answerFinalPeriod: finalPeriod,
                notices,
              });
              setSaved(true);
            });
          },
        },
        [
          el(
            'fieldset',
            { key: 'fields', disabled: busy || !loaded, className: 'col' },
            [
              el(NoticePolicyFields, {
                key: 'notices',
                value: notices,
                change: (value) => {
                  setNotices(value);
                  setSaved(false);
                },
              }),
              el('label', { key: 'rejected', className: 'field' }, [
                el(
                  'span',
                  { key: 'l', className: 'field-label' },
                  t('questions.rejected')
                ),
                el('textarea', {
                  key: 'input',
                  rows: 4,
                  'aria-label': t('questions.rejected'),
                  value: rejected,
                  maxLength: 1200100,
                  onChange: (event) => {
                    setRejected(event.target.value);
                    setSaved(false);
                  },
                }),
              ]),
              el(FinalPeriodField, {
                key: 'period',
                value: finalPeriod,
                disabled: equivalent,
                change: (value) => {
                  setFinalPeriod(value);
                  setSaved(false);
                },
              }),
              el('label', { key: 'equivalent', className: 'check' }, [
                el('input', {
                  key: 'input',
                  type: 'checkbox',
                  checked: equivalent,
                  onChange: (event) => {
                    setEquivalent(event.target.checked);
                    setSaved(false);
                  },
                }),
                ` ${t('questions.punctuationEquivalent')}`,
              ]),
              el(
                'button',
                { key: 'save', type: 'submit', className: 'primary' },
                t('common.save')
              ),
            ]
          ),
          saved
            ? el(
                'p',
                { key: 'saved', role: 'status' },
                t('questions.policySaved')
              )
            : null,
        ]
      ),
    ]
  );
};
