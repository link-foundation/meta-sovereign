import React from 'react';
import { sameSearch } from '../jobs/options.js';

const el = React.createElement;
export const ApplicationRouteSettings = ({ options, setOptions, t }) =>
  el('div', { className: 'col' }, [
    el('label', { key: 'route', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        'data-application-option': 'applyFromVacancyPage',
        checked: options.applyFromVacancyPage !== false,
        onChange: (event) =>
          setOptions({
            ...options,
            applyFromVacancyPage: event.target.checked,
          }),
      }),
      el(
        'span',
        { key: 'label', style: { flex: 1, minWidth: 0 } },
        t('application.applyFromVacancyPage')
      ),
    ]),
    el('p', { key: 'hint', className: 'meta' }, t('application.routeHint')),
    el('label', { key: 'search', className: 'col' }, [
      t('application.applicationSearchUrl'),
      el('input', {
        key: 'input',
        type: 'url',
        maxLength: 6000,
        'data-application-option': 'applicationSearchUrl',
        value: options.applicationSearchUrl ?? '',
        placeholder: 'https://hh.ru/search/vacancy',
        onChange: (event) => {
          const next = { ...options };
          if (event.target.value) {
            next.applicationSearchUrl = event.target.value;
          } else {
            delete next.applicationSearchUrl;
          }
          setOptions(next);
        },
      }),
    ]),
  ]);

export const ApplicationRouteReceipt = ({ receipt, t }) => {
  const throughSearch = receipt.applyFromVacancyPage === false;
  const searchOpen =
    receipt.active &&
    receipt.state === 'delivered' &&
    receipt.page?.bound &&
    sameSearch(receipt.page.url, receipt.applicationSearchUrl);
  return el(
    React.Fragment,
    null,
    el(
      'p',
      { 'data-application-route': throughSearch ? 'search' : 'vacancy' },
      t(throughSearch ? 'application.routeSearch' : 'application.routeVacancy')
    ),
    searchOpen
      ? el(
          'p',
          { 'data-application-search-open': '', role: 'status' },
          t('application.originalSearchOpen')
        )
      : null
  );
};
