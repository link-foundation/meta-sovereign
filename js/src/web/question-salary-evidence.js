import React from 'react';
import { useT } from './i18n.js';
import { formatSalary } from '../automation/salary-config.js';

const el = React.createElement;
const percent = (rate) => `${Number((rate * 100).toFixed(10))}%`;
export const SalaryTemplateEvidence = ({ value }) => {
  const t = useT();
  if (!value) {
    return null;
  }
  return el('details', { 'data-salary-template-evidence': true }, [
    el('summary', { key: 'summary' }, t('questions.salaryTemplateEvidence')),
    ...value.fields.map((field) =>
      el('div', { key: field.key, className: 'col' }, [
        el(
          'p',
          { key: 'value', style: { overflowWrap: 'anywhere' } },
          `${field.key}: ${field.amount ? formatSalary(field.amount, field.currency) : field.missing}`
        ),
        el(SalaryCalculationEvidence, {
          key: 'calculation',
          calculation: field.calculation,
        }),
      ])
    ),
  ]);
};
export const SalaryCalculationEvidence = ({ calculation }) => {
  const t = useT();
  if (!calculation) {
    return null;
  }
  const { method, rates, payout, exchange } = calculation;
  return el('details', { 'data-salary-calculation-evidence': true }, [
    el('summary', { key: 's' }, t('questions.salaryCalculationEvidence')),
    el(
      'p',
      { key: 'method', className: 'meta' },
      `${t(`questions.salaryMethod.${method}`)} · ${rates.map(percent).join(' / ')}${payout === undefined ? '' : ` · ${t('questions.salaryPayout')}: ${percent(payout)}`}`
    ),
    exchange
      ? el(
          'p',
          { key: 'exchange', className: 'meta' },
          `${t('questions.salaryExchange')}: ${t(`questions.salaryExchangeSource.${exchange.source}`)} · ${exchange.asOf} · ${exchange.base}`
        )
      : null,
  ]);
};

export const SalaryExchangeEvidence = ({ state }) => {
  const t = useT();
  if (!state) {
    return null;
  }
  return el(
    'p',
    { role: 'status', 'data-salary-automatic-rate': state.status },
    [
      t(`questions.salaryRates.${state.status}`, { date: state.asOf ?? '' }),
      state.warning ? ` ${t('questions.salaryRatesFallback')}` : '',
    ].join('')
  );
};
