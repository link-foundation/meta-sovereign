import React from 'react';
import { CvTechnologyPlanView } from './cv-technology-view.js';

const el = React.createElement;
export const CvTechnologyReview = ({ state, t }) => {
  const review = state.cvTechnology;
  const idle = !state.busy;
  const exports = state.resumeExports?.exports ?? [];
  return el(
    'section',
    {
      className: 'col',
      'data-cv-technology-review': true,
      'aria-label': t('cvTechnology.title'),
    },
    [
      el('h3', { key: 'title' }, t('cvTechnology.title')),
      el('p', { key: 'hint', className: 'meta' }, t('cvTechnology.hint')),
      ...['ru', 'en'].map((language) =>
        el('label', { key: language, className: 'chat-form-field' }, [
          el('span', { key: 'title' }, t(`cvTechnology.${language}`)),
          el(
            'select',
            {
              key: 'select',
              value: review.choices[language],
              disabled: !idle,
              onChange: (event) => review.choose(language, event.target.value),
              'data-cv-technology-export': language,
            },
            [
              el('option', { key: 'none', value: '' }, t('technology.choose')),
              ...exports
                .filter(
                  (item) =>
                    item.language === language &&
                    item.browserSlot === state.values.browserSlot
                )
                .map((item) =>
                  el(
                    'option',
                    {
                      key: `${item.exportId}:${item.hash}`,
                      value: `${item.exportId}:${item.hash}`,
                    },
                    `${item.title} · ${item.hash} · ${item.exportId}`
                  )
                ),
            ]
          ),
        ])
      ),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'generate',
            type: 'button',
            disabled:
              !idle ||
              !state.technology.catalog ||
              state.technology.dirty ||
              !review.choices.ru ||
              !review.choices.en,
            onClick: () => review.generate(exports),
            'data-cv-technology-action': 'generate',
          },
          t('cvTechnology.generate')
        ),
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            disabled: !idle,
            onClick: review.reload,
            'data-cv-technology-action': 'reload',
          },
          t('cvTechnology.reload')
        ),
      ]),
      review.loadError
        ? el('p', { key: 'error', role: 'status' }, t('cvTechnology.loadError'))
        : null,
      review.review
        ? el(CvTechnologyPlanView, {
            key: review.review.fingerprint,
            state: review,
            catalog: state.technology.catalog,
            idle: idle && !state.technology.dirty,
            t,
          })
        : null,
    ]
  );
};
