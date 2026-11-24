import React from 'react';
import {
  applicationConfirmationPolicy,
  applicationConfirmationSteps,
} from '../jobs/application-confirmations.js';

const el = React.createElement;
export const ApplicationConfirmationSettings = ({ options, setOptions, t }) => {
  const choices = applicationConfirmationPolicy(options);
  return el('fieldset', { className: 'automation-fieldset' }, [
    el('legend', { key: 'legend' }, t('application.confirmationSettings')),
    ...applicationConfirmationSteps.map((step) =>
      el('label', { key: step, className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          'data-application-confirmation': step,
          checked: choices.includes(step),
          disabled: options.supervised,
          onChange: (event) =>
            setOptions({
              ...options,
              confirmations: event.target.checked
                ? [...choices, step]
                : choices.filter((value) => value !== step),
            }),
        }),
        el('span', { key: 'label' }, t(`application.confirmation.${step}`)),
      ])
    ),
    el('p', { key: 'hint', className: 'meta' }, t('application.continueHint')),
  ]);
};

export const ApplicationContinuationView = ({
  receipt,
  application,
  ready,
  confirmed,
  t,
}) => {
  const pending = receipt.continuation;
  const enabled =
    ready &&
    ['ready', 'review'].includes(receipt.state) &&
    !receipt.hold &&
    !receipt.paused &&
    !receipt.attempted.submit &&
    receipt.delivery === 'none';
  const choices = receipt.confirmations ?? ['send'];
  return el('div', { className: 'col' }, [
    el(
      'p',
      { key: 'choices', 'data-application-confirmations': choices.join(',') },
      t('application.savedConfirmations', {
        steps: choices.length
          ? choices
              .map((step) => t(`application.confirmation.${step}`))
              .join(', ')
          : t('application.confirmation.none'),
      })
    ),
    pending
      ? el(
          'p',
          {
            key: 'pending',
            role: 'status',
            'data-application-continuation': pending.step,
          },
          t(`application.continuation.${pending.step}`)
        )
      : null,
    el('div', { key: 'actions', className: 'row' }, [
      el(
        'button',
        {
          key: 'continue',
          type: 'button',
          'data-application-action': 'continue',
          disabled: !enabled,
          onClick: () => application.action('Continue', {}),
        },
        t('application.continue')
      ),
      pending?.confirmationRequired
        ? el(
            'button',
            {
              key: 'confirm',
              type: 'button',
              'data-application-action': 'confirm-step',
              disabled: !enabled || !confirmed,
              onClick: () =>
                application.action('Continue', {
                  step: pending.step,
                  confirm: true,
                }),
            },
            t('application.confirmStep', {
              step: t(`application.confirmation.${pending.step}`),
            })
          )
        : null,
    ]),
  ]);
};
