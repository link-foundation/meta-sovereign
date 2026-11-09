import React from 'react';
import { useT } from './i18n.js';
import {
  SalaryField as Field,
  SalaryCheck as Check,
  SalarySelect,
} from './question-salary-inputs.js';
import { SalaryCalculationFields } from './question-salary-calculation-fields.js';

const el = React.createElement;
const blankCurrency = () => ({ code: '', keywords: [], hourlyStep: 5 });
const initial = () => ({
  enabled: false,
  approved: false,
  defaultCurrency: null,
  defaultBasis: 'net',
  monthlyHours: 160,
  currencies: [blankCurrency()],
});
const CurrencyFields = ({ entry, set, remove }) => {
  const t = useT();
  return el('fieldset', { className: 'col', 'data-salary-currency': true }, [
    el('legend', { key: 'l' }, entry.code || t('questions.salaryCurrency')),
    el(Field, {
      key: 'code',
      label: t('questions.salaryCode'),
      value: entry.code,
      maxLength: 10,
      change: (code) => set({ ...entry, code: code.toUpperCase() }),
    }),
    el(Field, {
      key: 'keywords',
      label: t('questions.salaryKeywords'),
      value: entry.keywordsText ?? entry.keywords.join(', '),
      change: (value) =>
        set({
          ...entry,
          keywords: value
            .split(',')
            .map((word) => word.trim())
            .filter(Boolean),
          keywordsText: value,
        }),
    }),
    el(SalarySelect, {
      key: 'method',
      label: t('questions.salaryMethod'),
      value: entry.grossMethod ?? 'explicit',
      change: (grossMethod) => set({ ...entry, grossMethod }),
      options: ['explicit', 'personal', 'company'].map((method) => [
        method,
        t(`questions.salaryMethod.${method}`),
      ]),
    }),
    ...['net', 'gross', 'grossStep', 'hourlyStep'].map((field) =>
      el(Field, {
        key: field,
        label: t(`questions.salary.${field}`),
        type: 'number',
        min: '0.000001',
        step: 'any',
        value: entry[field],
        disabled:
          field === 'gross' &&
          entry.grossMethod &&
          entry.grossMethod !== 'explicit',
        placeholder:
          field === 'grossStep'
            ? String(entry.code === 'RUB' ? 10000 : 100)
            : undefined,
        change: (value) =>
          set({ ...entry, [field]: value === '' ? undefined : Number(value) }),
      })
    ),
    el(
      'button',
      { key: 'r', type: 'button', onClick: remove },
      t('questions.salaryRemove')
    ),
  ]);
};

export const SalaryFields = ({ salary, set, api }) => {
  const t = useT();
  const value = salary ?? initial();
  const patch = (change) => set({ ...value, ...change });
  return el('details', { 'data-answer-salary': true }, [
    el('summary', { key: 's' }, t('questions.salaryTitle')),
    el('p', { key: 'h', className: 'meta' }, t('questions.salaryHint')),
    el(Check, {
      key: 'enable',
      label: t('questions.salaryEnabled'),
      value: value.enabled,
      change: (enabled) =>
        set(!enabled && !salary ? undefined : { ...value, enabled }),
    }),
    salary
      ? el('div', { key: 'config', className: 'col' }, [
          el(Check, {
            key: 'approve',
            label: t('questions.salaryApproved'),
            value: value.approved,
            change: (approved) => patch({ approved }),
          }),
          el(Field, {
            key: 'hours',
            type: 'number',
            min: '0.000001',
            max: '744',
            step: 'any',
            label: t('questions.salaryHours'),
            value: value.monthlyHours,
            change: (hours) =>
              patch({ monthlyHours: hours === '' ? null : Number(hours) }),
          }),
          el('label', { key: 'default', className: 'field' }, [
            el(
              'span',
              { key: 'l', className: 'field-label' },
              t('questions.salaryDefault')
            ),
            el(
              'select',
              {
                key: 's',
                'aria-label': t('questions.salaryDefault'),
                value: value.defaultCurrency ?? '',
                onChange: (event) =>
                  patch({ defaultCurrency: event.target.value || null }),
              },
              [
                el(
                  'option',
                  { key: '', value: '' },
                  t('questions.contextNoDefault')
                ),
                ...value.currencies
                  .filter((entry) => entry.code)
                  .map((entry, index) =>
                    el('option', { key: index, value: entry.code }, entry.code)
                  ),
              ]
            ),
          ]),
          el('label', { key: 'basis', className: 'field' }, [
            el(
              'span',
              { key: 'l', className: 'field-label' },
              t('questions.salaryBasis')
            ),
            el(
              'select',
              {
                key: 's',
                'aria-label': t('questions.salaryBasis'),
                value: value.defaultBasis,
                onChange: (event) =>
                  patch({ defaultBasis: event.target.value }),
              },
              ['net', 'gross'].map((basis) =>
                el(
                  'option',
                  { key: basis, value: basis },
                  t(`questions.salary.${basis}`)
                )
              )
            ),
          ]),
          ...value.currencies.map((entry, index) =>
            el(CurrencyFields, {
              key: index,
              entry,
              set: (currency) =>
                patch({
                  currencies: value.currencies.map((item, at) =>
                    at === index ? currency : item
                  ),
                }),
              remove: () =>
                patch({
                  defaultCurrency:
                    value.defaultCurrency === entry.code
                      ? null
                      : value.defaultCurrency,
                  currencies: value.currencies.filter((_, at) => at !== index),
                }),
            })
          ),
          el(
            'button',
            {
              key: 'add',
              type: 'button',
              disabled: value.currencies.length >= 10,
              onClick: () =>
                patch({ currencies: [...value.currencies, blankCurrency()] }),
            },
            t('questions.salaryAdd')
          ),
          el(SalaryCalculationFields, {
            key: 'calculation',
            api,
            salary: value,
            patch,
          }),
          el(
            'button',
            { key: 'clear', type: 'button', onClick: () => set(undefined) },
            t('questions.salaryClear')
          ),
        ])
      : null,
  ]);
};
