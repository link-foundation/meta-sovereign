import React from 'react';
import { followReadPolicy } from '../follow/read-policy.js';

const el = React.createElement;
export const initialFollowReadForm = {
  attempts: '3',
  retryDelayMs: '100',
  retryMaxDelayMs: '2000',
};
export const followReadFormPolicy = (form) =>
  followReadPolicy({
    attempts: form.attempts,
    retryDelayMs: form.retryDelayMs,
    retryMaxDelayMs: form.retryMaxDelayMs,
  });
export const FollowReadControls = ({ form, change, busy, t }) =>
  el(
    'fieldset',
    {
      disabled: busy,
      className: 'automation-fieldset col',
      'data-follow-read-policy': '',
    },
    [
      el('legend', { key: 'l' }, t('followRead.title')),
      el('p', { key: 'h', className: 'meta' }, t('followRead.hint')),
      ...[
        ['attempts', 1, 10],
        ['retryDelayMs', 0, 60000],
        ['retryMaxDelayMs', 0, 300000],
      ].map(([name, min, max]) =>
        el('label', { key: name, className: 'field' }, [
          el(
            'span',
            { key: 'l', className: 'field-label' },
            t(`followRead.${name}`)
          ),
          el('input', {
            key: 'i',
            type: 'number',
            min,
            max,
            step: 1,
            value: form[name],
            'data-follow-read-field': name,
            onChange: (event) => change(name, event.target.value),
          }),
        ])
      ),
    ]
  );
