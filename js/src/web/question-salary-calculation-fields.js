import React from 'react';
import { useT } from './i18n.js';
import {
  SalaryField as Field,
  SalarySelect,
} from './question-salary-inputs.js';
import { SalaryExchangeFetch } from './question-salary-exchange-fetch.js';

const el = React.createElement;
const number = (value) => (value === '' ? undefined : Number(value));
const percent = (value) =>
  value === undefined ? '' : Number((value * 100).toFixed(10));
const button = (key, label, onClick, disabled = false) =>
  el('button', { key, type: 'button', onClick, disabled }, label);
const codeField = (key, label, value, change) =>
  el(Field, {
    key,
    label,
    value,
    maxLength: 10,
    change: (text) => change(text.toUpperCase()),
  });

const Bands = ({ schedule, company, set }) => {
  const t = useT();
  const update = (index, patch) =>
    set({
      ...schedule,
      bands: schedule.bands.map((band, at) =>
        at === index ? { ...band, ...patch } : band
      ),
    });
  return el('div', { className: 'col' }, [
    ...schedule.bands.map((band, index) =>
      el(
        'fieldset',
        { key: index, className: 'col', 'data-salary-tax-band': true },
        [
          el(
            'legend',
            { key: 'l' },
            t('questions.salaryBand', { number: index + 1 })
          ),
          index === schedule.bands.length - 1
            ? el(
                'p',
                { key: 'unlimited', className: 'meta' },
                t('questions.salaryUnlimited')
              )
            : el(Field, {
                key: 'limit',
                type: 'number',
                min: '0.000001',
                step: 'any',
                label: t('questions.salaryBandLimit'),
                value: band.upTo,
                change: (value) => update(index, { upTo: number(value) }),
              }),
          company
            ? codeField(
                'currency',
                t('questions.salaryBandCurrency'),
                band.currency,
                (currency) => update(index, { currency: currency || undefined })
              )
            : null,
          el(Field, {
            key: 'rate',
            label: t('questions.salaryTaxRate'),
            type: 'number',
            min: '0',
            max: '99.999999',
            step: 'any',
            value: percent(band.rate),
            change: (value) =>
              update(index, {
                rate: value === '' ? undefined : Number(value) / 100,
              }),
          }),
          button(
            'remove',
            t('questions.salaryRemoveBand'),
            () =>
              set({
                ...schedule,
                bands: schedule.bands.filter((_, at) => at !== index),
              }),
            index === schedule.bands.length - 1
          ),
        ]
      )
    ),
    button(
      'add',
      t('questions.salaryAddBand'),
      () =>
        set({
          ...schedule,
          bands: [
            ...schedule.bands.slice(0, -1),
            { rate: undefined, upTo: undefined },
            schedule.bands.at(-1),
          ],
        }),
      schedule.bands.length >= 20
    ),
  ]);
};

const TaxFields = ({ kind, salary, patch }) => {
  const t = useT();
  const schedule = salary.taxes?.[kind];
  const set = (value) => {
    const taxes = { ...salary.taxes };
    if (value) {
      taxes[kind] = value;
    } else {
      delete taxes[kind];
    }
    patch({ taxes });
  };
  return el('details', { 'data-salary-tax': kind }, [
    el('summary', { key: 's' }, t(`questions.salaryMethod.${kind}`)),
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t(`questions.salaryTaxHint.${kind}`)
    ),
    schedule
      ? el('div', { key: 'config', className: 'col' }, [
          kind === 'personal'
            ? codeField(
                'currency',
                t('questions.salaryTaxCurrency'),
                schedule.currency,
                (currency) => set({ ...schedule, currency })
              )
            : el(Field, {
                key: 'payout',
                type: 'number',
                min: '0',
                max: '99.999999',
                step: 'any',
                label: t('questions.salaryPayout'),
                value: percent(schedule.payout ?? 0),
                change: (value) =>
                  set({
                    ...schedule,
                    payout: value === '' ? undefined : Number(value) / 100,
                  }),
              }),
          el(Bands, {
            key: 'bands',
            schedule,
            company: kind === 'company',
            set,
          }),
          button('remove', t('questions.salaryRemoveTax'), () =>
            set(undefined)
          ),
        ])
      : button('create', t('questions.salaryAddTax'), () =>
          set({
            bands: [{ upTo: null, rate: undefined }],
            ...(kind === 'personal'
              ? {
                  currency:
                    salary.defaultCurrency ?? salary.currencies[0]?.code ?? '',
                }
              : { payout: 0 }),
          })
        ),
  ]);
};

const ExchangeFields = ({ salary, patch, api }) => {
  const t = useT();
  const value = salary.exchange;
  const set = (change) => patch({ exchange: { ...value, ...change } });
  const rates = Array.isArray(value?.rates)
    ? value.rates
    : Object.entries(value?.rates ?? {}).map(([code, rate]) => ({
        code,
        rate,
      }));
  const update = (index, change) =>
    set({
      rates: rates.map((entry, at) =>
        at === index ? { ...entry, ...change } : entry
      ),
    });
  return el('details', { 'data-salary-exchange': true }, [
    el('summary', { key: 's' }, t('questions.salaryExchange')),
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t('questions.salaryExchangeHint')
    ),
    el(SalaryExchangeFetch, { key: 'fetch', api, exchange: value, patch }),
    value
      ? el('div', { key: 'config', className: 'col' }, [
          codeField(
            'base',
            t('questions.salaryExchangeBase'),
            value.base,
            (base) => set({ base })
          ),
          el(Field, {
            key: 'date',
            type: 'date',
            label: t('questions.salaryExchangeDate'),
            value: value.asOf,
            change: (asOf) => set({ asOf }),
          }),
          el(SalarySelect, {
            key: 'source',
            label: t('questions.salaryExchangeSource'),
            value: value.source ?? 'manual',
            change: (source) => set({ source }),
            options: ['manual', 'cbr'].map((source) => [
              source,
              t(`questions.salaryExchangeSource.${source}`),
            ]),
          }),
          el(Field, {
            key: 'age',
            type: 'number',
            min: '1',
            max: '365',
            step: '1',
            label: t('questions.salaryExchangeAge'),
            value: value.maxAgeDays ?? 7,
            change: (age) => set({ maxAgeDays: number(age) }),
          }),
          ...rates.map((entry, index) =>
            el(
              'fieldset',
              {
                key: index,
                className: 'col',
                'data-salary-exchange-rate': true,
              },
              [
                el(
                  'legend',
                  { key: 'l' },
                  entry.code || t('questions.salaryCurrency')
                ),
                codeField(
                  'code',
                  t('questions.salaryCode'),
                  entry.code,
                  (code) => update(index, { code })
                ),
                el(Field, {
                  key: 'rate',
                  type: 'number',
                  min: '0.000000001',
                  step: 'any',
                  label: t('questions.salaryExchangeRate'),
                  value: entry.rate,
                  change: (rate) => update(index, { rate: number(rate) }),
                }),
                button('remove', t('questions.salaryRemoveRate'), () =>
                  set({ rates: rates.filter((_, at) => at !== index) })
                ),
              ]
            )
          ),
          button(
            'add',
            t('questions.salaryAddRate'),
            () => set({ rates: [...rates, { code: '', rate: undefined }] }),
            rates.length >= 100
          ),
          button('clear', t('questions.salaryRemoveExchange'), () =>
            patch({ exchange: undefined })
          ),
        ])
      : button('create', t('questions.salaryAddExchange'), () =>
          patch({
            exchange: {
              base: salary.defaultCurrency ?? salary.currencies[0]?.code ?? '',
              rates: [],
              asOf: new Date().toISOString().slice(0, 10),
              source: 'manual',
              maxAgeDays: 7,
            },
          })
        ),
  ]);
};

export const SalaryCalculationFields = ({ salary, patch, api }) =>
  el('div', { className: 'col', 'data-salary-calculation': true }, [
    ...['personal', 'company'].map((kind) =>
      el(TaxFields, { key: kind, kind, salary, patch })
    ),
    el(ExchangeFields, { key: 'exchange', salary, patch, api }),
  ]);
