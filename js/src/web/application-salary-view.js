import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const ApplicationSalarySettings = ({
  options,
  setOptions,
  disabled,
}) => {
  const t = useT();
  const update = (key, value) =>
    setOptions((current) => ({ ...current, [key]: value }));
  return el(
    'div',
    { className: 'col', 'data-application-salary-settings': true },
    [
      el('label', { key: 'form', className: 'col' }, [
        t('application.directForm'),
        el('input', {
          key: 'input',
          type: 'url',
          value: options.formUrl ?? '',
          disabled,
          'data-application-option': 'formUrl',
          onChange: (event) =>
            update('formUrl', event.target.value || undefined),
        }),
      ]),
      el('label', { key: 'enabled', className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: options.salaryLadder !== false,
          disabled,
          'data-application-option': 'salaryLadder',
          onChange: (event) => update('salaryLadder', event.target.checked),
        }),
        t('application.salaryPolicy'),
      ]),
      el('label', { key: 'floor', className: 'col' }, [
        t('application.salaryFloor'),
        el('input', {
          key: 'input',
          type: 'number',
          min: 0,
          max: 1000000000,
          value: options.salaryFloorRub ?? '',
          disabled,
          'data-application-option': 'salaryFloorRub',
          onChange: (event) =>
            update(
              'salaryFloorRub',
              event.target.value === '' ? undefined : Number(event.target.value)
            ),
        }),
      ]),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t('application.salaryPolicyHint')
      ),
    ]
  );
};

export const ApplicationSalaryReceipt = ({ receipt }) => {
  const t = useT();
  const decision = receipt?.salaryAdmission;
  return decision
    ? el(
        'div',
        {
          className: 'col',
          role: 'status',
          'data-application-salary': decision.action,
        },
        [
          el(
            'p',
            { key: 'decision' },
            t(`application.salary.${decision.reason}`)
          ),
          decision.floorRub === null
            ? null
            : el(
                'p',
                { key: 'floor', className: 'meta' },
                t('application.salaryCurrentFloor', {
                  amount: decision.floorRub,
                })
              ),
        ]
      )
    : null;
};
