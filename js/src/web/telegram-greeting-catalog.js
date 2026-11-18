import React, { useEffect, useMemo, useState } from 'react';
import { useT, useDates } from './i18n.js';
import { Busy } from './spinner.js';
import { activeAccount } from './telegram-account-scope.js';
import {
  createGreetingCatalogModel,
  catalogRunning,
} from './telegram-greeting-catalog-model.js';

const el = React.createElement;
const button = (action, label, use, disabled = false) =>
  el(
    'button',
    {
      key: action,
      type: 'button',
      'data-catalog-action': action,
      onClick: use,
      disabled,
    },
    label
  );
const useCatalog = (api) => {
  const [, render] = useState(0);
  const model = useMemo(
    () => createGreetingCatalogModel(api, () => render((value) => value + 1)),
    [api]
  );
  useEffect(() => {
    model.start();
    return model.stop;
  }, [model]);
  return model;
};
const CatalogCoverage = ({ coverage, t }) =>
  !coverage
    ? null
    : el(
        'ul',
        { className: 'meta', 'data-catalog-coverage': '' },
        Object.entries(coverage).map(([name, part]) =>
          el(
            'li',
            { key: name },
            `${t(`telegram.catalog.source.${name}`)}: ${t(`telegram.catalog.${part.complete ? 'complete' : part.error ? 'unavailable' : 'partial'}`)}`
          )
        )
      );
const CatalogItems = ({ data, onSelect, selected, t }) =>
  el(
    'ul',
    { className: 'telegram-greeting-items', 'data-catalog-items': '' },
    data.stickers.map((item) =>
      el('li', { key: item.id }, [
        el(
          'span',
          {
            key: 'emoji',
            className: 'telegram-greeting-emoji',
            'aria-hidden': true,
          },
          item.emoji || '👋'
        ),
        el(
          'span',
          { key: 'id', className: 'meta' },
          `${item.id} · ${t(`telegram.catalog.source.${item.origin}`)}`
        ),
        onSelect && item.greeting
          ? button(
              item.id,
              t(
                item.id === selected
                  ? 'telegram.catalog.selected'
                  : 'telegram.catalog.select'
              ),
              () => onSelect(item.id),
              item.id === selected
            )
          : null,
      ])
    )
  );
const CatalogResult = ({ model, t, onSelect, selected }) => {
  const dates = useDates();
  const { data, busy, greetingsOnly, offset } = model.state;
  if (!data) {
    return null;
  }
  const job = data.job;
  return el('div', { className: 'col' }, [
    el(
      'p',
      { key: 'count', 'data-catalog-count': '', role: 'status' },
      t('telegram.catalog.count', {
        total: data.cache.total,
        greetings: data.cache.greetings,
      })
    ),
    el(
      'p',
      { key: 'age', className: 'meta' },
      data.cache.updatedAt
        ? t(
            data.cache.stale
              ? 'telegram.catalog.stale'
              : 'telegram.catalog.updated',
            { at: dates.dateTime(data.cache.updatedAt) }
          )
        : t('telegram.catalog.empty')
    ),
    job
      ? el(
          'p',
          { key: 'job', role: 'status', 'data-catalog-job': job.state },
          t(`telegram.catalog.state.${job.state}`)
        )
      : null,
    el(CatalogCoverage, {
      key: 'coverage',
      coverage: job?.coverage ?? data.cache.coverage,
      t,
    }),
    el('label', { key: 'filter', className: 'telegram-catalog-filter' }, [
      el('input', {
        key: 'check',
        type: 'checkbox',
        'data-catalog-field': 'greetingsOnly',
        checked: greetingsOnly,
        disabled: busy,
        onChange: (event) =>
          model.read({ greetingsOnly: event.target.checked, offset: 0 }),
      }),
      el('span', { key: 'label' }, t('telegram.catalog.greetingsOnly')),
    ]),
    el(CatalogItems, { key: 'items', data, onSelect, selected, t }),
    el('div', { key: 'pages', className: 'row wrap' }, [
      button(
        'previous',
        t('telegram.catalog.previous'),
        () => model.read({ offset: Math.max(0, offset - 100) }),
        busy || offset === 0
      ),
      button(
        'next',
        t('telegram.catalog.next'),
        () => model.read({ offset: offset + 100 }),
        busy || !data.more
      ),
    ]),
  ]);
};

const GreetingCatalog = ({ api, onSelect, selected = null }) => {
  const t = useT();
  const model = useCatalog(api);
  const { availability, busy, data, error } = model.state;
  const [options, setOptions] = useState({
    maxSets: 1000,
    maxDocuments: 10_000,
  });
  const running = catalogRunning(data?.job);
  const valid =
    Number.isInteger(options.maxSets) &&
    options.maxSets >= 1 &&
    options.maxSets <= 10_000 &&
    Number.isInteger(options.maxDocuments) &&
    options.maxDocuments >= 1 &&
    options.maxDocuments <= 50_000;
  return el(
    'section',
    {
      className: 'col telegram-greeting-catalog',
      'data-telegram-catalog': '',
      'aria-label': t('telegram.catalog.title'),
    },
    [
      el('h3', { key: 'title' }, t('telegram.catalog.title')),
      el('p', { key: 'note', className: 'meta' }, t('telegram.catalog.note')),
      error
        ? el(
            'p',
            { key: 'error', role: 'alert' },
            t(`telegram.catalog.error.${error}`)
          )
        : null,
      availability === 'unavailable'
        ? el(
            'p',
            { key: 'unsupported', className: 'meta' },
            t('telegram.catalog.userRequired')
          )
        : null,
      busy ? el(Busy, { key: 'busy' }, t('telegram.catalog.busy')) : null,
      availability === 'ready'
        ? el(
            'fieldset',
            { key: 'refresh', disabled: busy, className: 'chat-users-options' },
            [
              el('legend', { key: 'legend' }, t('telegram.catalog.refresh')),
              ...Object.entries({ maxSets: 10_000, maxDocuments: 50_000 }).map(
                ([name, max]) =>
                  el('label', { key: name, className: 'col' }, [
                    t(`telegram.catalog.${name}`),
                    el('input', {
                      key: 'input',
                      type: 'number',
                      min: 1,
                      max,
                      step: 1,
                      'data-catalog-field': name,
                      value: Number.isNaN(options[name]) ? '' : options[name],
                      onChange: (event) => {
                        const value =
                          event.target.value === ''
                            ? NaN
                            : Number(event.target.value);
                        setOptions((current) => ({
                          ...current,
                          [name]: value,
                        }));
                      },
                    }),
                  ])
              ),
              button(
                'refresh',
                t('telegram.catalog.refresh'),
                () => model.refresh(options),
                !valid || running
              ),
              running
                ? button(
                    'cancel',
                    t('telegram.catalog.cancel'),
                    model.cancel,
                    data.job.state === 'cancelling'
                  )
                : null,
            ]
          )
        : null,
      button('reload', t('telegram.catalog.reload'), model.load, busy),
      el(CatalogResult, { key: 'result', model, t, onSelect, selected }),
    ]
  );
};
export const TelegramGreetingCatalog = (props) =>
  el(GreetingCatalog, { ...props, key: activeAccount() });
