import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const percent = (rate) => `${Number((rate * 100).toFixed(10))}%`;
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
