import React from 'react';
import { useT } from './i18n.js';
import { AnswerEvidence } from './question-evidence.js';
import { useBrowserAnswerWatch } from './question-browser-watch-state.js';
import { BrowserPendingTurn } from './question-browser-pending.js';

const el = React.createElement;

const WatchStatus = ({ watch }) => {
  const t = useT();
  if (!watch) {
    return null;
  }
  return el(
    'div',
    {
      className: 'col',
      'data-browser-watch-state': watch.state,
      'data-browser-watch-phase': watch.phase,
    },
    [
      el(
        'p',
        { key: 'state', role: 'status' },
        t(`browserWatch.${watch.state}`)
      ),
      el(
        'p',
        { key: 'phase', role: 'status' },
        t(`browserWatch.phase.${watch.phase}`)
      ),
      el(
        'small',
        { key: 'target', className: 'meta' },
        `${watch.target.source} · ${watch.target.chat}`
      ),
      watch.last
        ? el(BrowserPendingTurn, {
            key: 'question',
            snapshot: watch.last.snapshot,
            plan: watch.last.plan,
          })
        : null,
      watch.last?.plan
        ? el(AnswerEvidence, { key: 'evidence', answer: watch.last.plan })
        : null,
      watch.reason
        ? el(
            'small',
            { key: 'reason', className: 'meta' },
            t('browserWatch.reason', { code: watch.reason })
          )
        : null,
      watch.outbox?.receipt
        ? el('div', { key: 'receipt', className: 'col' }, [
            el(
              'small',
              { key: 'id', className: 'meta' },
              t('browserAnswer.receipt', { id: watch.outbox.receipt.messageId })
            ),
            el(
              'small',
              { key: 'option', className: 'meta' },
              t('browserWatch.selected', {
                option: watch.outbox.receipt.option,
              })
            ),
          ])
        : null,
    ]
  );
};

const WatchStart = ({ busy, active, available, review, start }) => {
  const t = useT();
  const [minutes, setMinutes] = React.useState('120');
  const duration = Number(minutes);
  const valid =
    Number.isSafeInteger(duration) && duration >= 1 && duration <= 120;
  return el(
    'fieldset',
    { className: 'col', disabled: busy || active || !available },
    [
      el('label', { key: 'duration', className: 'field' }, [
        el(
          'span',
          { key: 'label', className: 'field-label' },
          t('browserWatch.minutes')
        ),
        el('input', {
          key: 'input',
          type: 'number',
          min: 1,
          max: 120,
          value: minutes,
          onChange: (event) => setMinutes(event.target.value),
        }),
      ]),
      el(
        'button',
        {
          key: 'start',
          type: 'button',
          'data-browser-watch-start': true,
          disabled: !review || review.expired || !valid,
          onClick: () => start(review, duration * 60000),
        },
        t('browserWatch.start')
      ),
    ]
  );
};

/** Shared Chat/Operator/settings controls; initial render starts no automation. */
export const BrowserAnswerWatchControls = (props) => {
  const { api, review, available, enabled, busy, run } = props;
  const t = useT();
  const state = useBrowserAnswerWatch(props);
  if (!api.startBrowserAnswerWatch || !enabled || (!available && !state.id)) {
    return null;
  }
  return el('div', { className: 'col', 'data-browser-answer-watch': true }, [
    el('p', { key: 'hint', className: 'meta' }, t('browserWatch.hint')),
    el(WatchStart, {
      key: 'start',
      busy,
      active: state.active,
      available,
      review,
      start: (...args) => run(() => state.start(...args)),
    }),
    state.pending
      ? el(
          'p',
          { key: 'pending', role: 'status' },
          t('browserWatch.unconfirmed')
        )
      : null,
    state.error ? el('p', { key: 'error', role: 'alert' }, state.error) : null,
    el(WatchStatus, { key: 'status', watch: state.watch }),
    state.id
      ? el('div', { key: 'actions', className: 'row wrap' }, [
          el(
            'button',
            {
              key: 'recover',
              type: 'button',
              disabled: busy,
              onClick: () => run(state.recover),
            },
            t('browserWatch.recover')
          ),
          el(
            'button',
            {
              key: 'stop',
              type: 'button',
              disabled:
                busy || (!state.active && state.watch?.state === 'stopped'),
              'data-browser-watch-stop': true,
              onClick: () => run(state.stop),
            },
            t('browserWatch.stop')
          ),
        ])
      : null,
  ]);
};
