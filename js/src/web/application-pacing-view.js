import React from 'react';

const el = React.createElement;
export const ApplicationPacingSettings = ({ options, setOptions, t }) =>
  el('div', { className: 'col' }, [
    el('label', { key: 'enabled', className: 'row' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        'data-application-option': 'pacing',
        checked: options.applicationIntervalSeconds !== undefined,
        onChange: (event) =>
          setOptions({
            ...options,
            applicationIntervalSeconds: event.target.checked ? 0 : undefined,
          }),
      }),
      el('span', { key: 'label' }, t('application.pacingEnabled')),
    ]),
    options.applicationIntervalSeconds === undefined
      ? null
      : el('label', { key: 'interval', className: 'col' }, [
          t('application.pacingInterval'),
          el('input', {
            key: 'input',
            type: 'number',
            min: 0,
            max: 86400,
            step: 1,
            value: options.applicationIntervalSeconds,
            'data-application-pacing-interval': true,
            onChange: (event) =>
              setOptions({
                ...options,
                applicationIntervalSeconds: Number(event.target.value),
              }),
          }),
        ]),
    el('p', { key: 'hint', className: 'meta' }, t('application.pacingHint')),
  ]);
export const ApplicationPacingView = ({ pacing, t }) =>
  pacing
    ? el(
        'div',
        {
          className: 'col',
          'data-application-pacing': pacing.waiting ? 'waiting' : 'ready',
        },
        [
          el(
            'p',
            { key: 'deadline', role: 'status' },
            t(
              pacing.waiting
                ? 'application.pacingWaiting'
                : 'application.pacingReady',
              { at: pacing.nextAt }
            )
          ),
          el(
            'p',
            { key: 'stats', className: 'meta' },
            t('application.pacingStats', {
              mode: t(`application.pacingMode.${pacing.mode}`),
              seconds: pacing.intervalMs / 1000,
              deliveries: pacing.deliveries,
              challenges: pacing.challenges,
            })
          ),
          pacing.holdUntil
            ? el(
                'p',
                { key: 'hold', className: 'meta' },
                t('application.pacingHold', { at: pacing.holdUntil })
              )
            : null,
          !pacing.saved
            ? el(
                'p',
                { key: 'unsaved', role: 'alert' },
                t('application.pacingUnsaved')
              )
            : null,
        ]
      )
    : null;
