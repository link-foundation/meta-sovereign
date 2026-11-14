import React from 'react';
import { useT } from './i18n.js';
import { NoticePolicyFields } from './question-notice-policy.js';
import { normalizeNoticePolicy } from '../automation/question-notice-policy.js';

const el = React.createElement;

export const AnswerPolicyControls = ({ api, busy, run }) => {
  const t = useT();
  const [rejected, setRejected] = React.useState('');
  const [equivalent, setEquivalent] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [notices, setNotices] = React.useState(normalizeNoticePolicy);
  const load = () =>
    run(async () => {
      const policy = await api.answerPolicy();
      setRejected(policy.rejected.join('\n'));
      setEquivalent(policy.punctuationEquivalent);
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
