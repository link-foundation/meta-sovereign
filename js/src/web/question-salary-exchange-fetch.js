import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const SalaryExchangeFetch = ({ api, exchange, patch }) => {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const alive = React.useRef(true);
  const running = React.useRef(false);
  const current = React.useRef({ exchange, patch });
  current.current = { exchange, patch };
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = async (refresh) => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    const original = JSON.stringify(current.current.exchange);
    try {
      const value = await api.salaryExchange({
        refresh,
        maxAgeDays: current.current.exchange?.maxAgeDays ?? 7,
      });
      if (!alive.current) {
        return;
      }
      if (JSON.stringify(current.current.exchange) !== original) {
        setError(t('questions.salaryRatesChanged'));
        return;
      }
      if (value.exchange) {
        current.current.patch({ exchange: value.exchange });
      }
      setResult({
        ...value,
        signature: JSON.stringify(value.exchange ?? current.current.exchange),
      });
    } catch (err) {
      if (alive.current) {
        setError(err.message);
      }
    } finally {
      running.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  if (!api?.salaryExchange) {
    return null;
  }
  const matches = result?.signature === JSON.stringify(exchange);
  return el('div', { className: 'col', 'data-salary-exchange-fetch': true }, [
    el('div', { key: 'buttons', className: 'row' }, [
      ...[true, false].map((refresh) =>
        el(
          'button',
          {
            key: String(refresh),
            type: 'button',
            disabled: busy,
            onClick: () => load(refresh),
          },
          t(
            refresh
              ? 'questions.salaryFetchRates'
              : 'questions.salaryUseCachedRates'
          )
        )
      ),
    ]),
    busy
      ? el(
          'p',
          { key: 'busy', role: 'status' },
          t('questions.salaryRatesLoading')
        )
      : null,
    error ? el('p', { key: 'error', role: 'alert' }, error) : null,
    result && matches
      ? el(
          'p',
          {
            key: 'result',
            role: 'status',
            'data-salary-rate-result': result.status,
          },
          [
            t(`questions.salaryRates.${result.status}`, {
              date: result.exchange?.asOf ?? '',
            }),
            result.warning ? ` ${t('questions.salaryRatesFallback')}` : '',
            result.exchange ? ` ${t('questions.salaryRatesDraft')}` : '',
          ].join('')
        )
      : null,
  ]);
};
