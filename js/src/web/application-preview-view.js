import React from 'react';

const el = React.createElement;
export const ApplicationPreviewSettings = ({ options, setOptions, t }) =>
  el('div', { className: 'col' }, [
    el('label', { key: 'seconds', className: 'col' }, [
      t('application.vacancyPreviewSeconds'),
      el('input', {
        key: 'input',
        type: 'number',
        min: 0,
        max: 30,
        step: 0.1,
        value: options.vacancyPreviewSeconds ?? 3,
        'data-application-option': 'vacancyPreviewSeconds',
        onChange: (event) =>
          setOptions({
            ...options,
            vacancyPreviewSeconds: Number(event.target.value),
          }),
      }),
    ]),
    el(
      'p',
      { key: 'hint', className: 'meta' },
      t('application.vacancyPreviewHint')
    ),
  ]);

export const ApplicationPreviewReceipt = ({ receipt, t }) =>
  el(
    'p',
    {
      className: 'meta',
      'data-application-preview-seconds': receipt.vacancyPreviewSeconds ?? 3,
    },
    t('application.vacancyPreviewPolicy', {
      seconds: receipt.vacancyPreviewSeconds ?? 3,
    })
  );
