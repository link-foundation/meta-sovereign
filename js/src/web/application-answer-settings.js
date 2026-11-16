import React from 'react';
import { useT } from './i18n.js';
import { SharedProfile } from './question-shared-profile.js';
import { SalaryFields } from './question-salary-fields.js';
import { formatSalary } from '../automation/salary-config.js';

const el = React.createElement;
export const ApplicationAnswerSettings = ({ application, disabled }) => {
  const t = useT();
  const { api, options, setOptions } = application;
  const update = (key, value) =>
    setOptions((current) => ({ ...current, [key]: value }));
  return el(
    'div',
    { className: 'col', 'data-application-answer-context': true },
    [
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t('application.answerContext')
      ),
      el(SharedProfile, {
        key: 'profile',
        api,
        profileId: options.profileId ?? '',
        setProfileId: (value) => update('profileId', value),
        disabled,
      }),
      el(SalaryFields, {
        key: 'salary',
        api,
        salary: options.salary,
        set: (value) => update('salary', value),
      }),
    ]
  );
};

/** Display only the acknowledged context; local edits cannot relabel a run. */
export const ApplicationAnswerReceipt = ({ receipt }) => {
  const t = useT();
  if (!receipt?.profileId && !receipt?.salary) {
    return null;
  }
  const salary = receipt.salary;
  const targets = salary?.currencies.flatMap((currency) =>
    ['net', 'gross', 'hourlyNet', 'hourlyGross']
      .filter((basis) => currency[basis] !== undefined)
      .map(
        (basis) =>
          `${formatSalary(currency[basis], currency.code)} ${t(`questions.salary.${basis}`)}`
      )
  );
  return el(
    'div',
    { className: 'col', 'data-application-answer-receipt': true },
    [
      receipt.profileId
        ? el(
            'p',
            { key: 'profile', style: { overflowWrap: 'anywhere' } },
            t('application.answerProfile', { profile: receipt.profileId })
          )
        : null,
      salary
        ? el('div', { key: 'salary', className: 'col' }, [
            ...['enabled', 'approved'].map((key) =>
              el('label', { key, className: 'row' }, [
                el('input', {
                  key: 'check',
                  type: 'checkbox',
                  checked: salary[key],
                  disabled: true,
                }),
                t(
                  key === 'enabled'
                    ? 'questions.salaryEnabled'
                    : 'questions.salaryApproved'
                ),
              ])
            ),
            el(
              'p',
              { key: 'targets' },
              t('application.answerTargets', { targets: targets.join('; ') })
            ),
          ])
        : null,
    ]
  );
};
