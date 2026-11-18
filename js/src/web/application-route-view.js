import React from 'react';

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

export const ApplicationRouteReceipt = ({ receipt, t }) =>
  el(
    'p',
    {
      'data-application-route':
        receipt.applyFromVacancyPage === false ? 'search' : 'vacancy',
    },
    t(
      receipt.applyFromVacancyPage === false
        ? 'application.routeSearch'
        : 'application.routeVacancy'
    )
  );
