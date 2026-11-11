import React from 'react';
import { useT } from './i18n.js';
import { AnswerEvidence } from './question-evidence.js';
import { useBrowserAnswerWatch } from './question-browser-watch-state.js';
import { BrowserPendingTurn } from './question-browser-pending.js';

const el = React.createElement;

const WatchEvidence = ({ watch }) => {
  const t = useT();
  return el(React.Fragment, null, [
    watch.last
      ? el(BrowserPendingTurn, {
          key: 'question',
          snapshot: watch.last.snapshot,
          plan: watch.noticeReplies ? { pending: true } : watch.last.plan,
          historyVerified:
            watch.noticeReplies && watch.last.plan.historyVerified === true,
        })
      : null,
    watch.noticeReplies && watch.last?.plan?.kind
      ? el(
          'p',
          {
            key: 'notice-kind',
            className: 'meta',
            'data-notice-watch-kind': watch.last.plan.kind,
          },
          t(`noticePolicy.${watch.last.plan.kind}`)
        )
      : null,
    watch.last?.plan && (!watch.noticeReplies || watch.last.plan.evidence)
      ? el(AnswerEvidence, {
          key: 'evidence',
          answer: watch.noticeReplies
            ? watch.last.plan.evidence
            : watch.last.plan,
          noticeAdmitted:
            watch.noticeReplies && watch.last.plan.status === 'ready',
        })
      : null,
  ]);
};

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
        t(
          watch.noticeReplies &&
            ['sent', 'selecting', 'unknown', 'failed', 'marked-sent'].includes(
              watch.phase
            )
            ? `noticePolicy.${watch.phase}`
            : `browserWatch.phase.${watch.phase}`
        )
      ),
      el(
        'small',
        { key: 'target', className: 'meta' },
        `${watch.target.source} · ${watch.target.chat}`
      ),
      el(WatchEvidence, { key: 'evidence', watch }),
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
              t(
                watch.selection?.type === 'text'
                  ? 'noticePolicy.receipt'
                  : 'browserWatch.selected',
                {
                  option:
                    watch.outbox.receipt.text ?? watch.outbox.receipt.option,
                }
              )
            ),
          ])
        : null,
    ]
  );
};

const WatchStart = ({
  busy,
  active,
  available,
  noticeAvailable,
  review,
  start,
}) => {
  const t = useT();
  const [minutes, setMinutes] = React.useState('120');
  const [noticeReplies, setNoticeReplies] = React.useState(false);
  const duration = Number(minutes);
  const valid =
    Number.isSafeInteger(duration) && duration >= 1 && duration <= 120;
  return el(
    'fieldset',
    { className: 'col', disabled: busy || active || !available },
    [
      !noticeAvailable || !noticeReplies
        ? el('p', { key: 'hint', className: 'meta' }, t('browserWatch.hint'))
        : null,
      noticeAvailable
        ? el('label', { key: 'notices', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              'data-notice-watch-mode': true,
              checked: noticeReplies,
              onChange: (event) => setNoticeReplies(event.target.checked),
            }),
            t('noticePolicy.watch'),
          ])
        : null,
      noticeAvailable && noticeReplies
        ? el(
            'p',
            { key: 'notice-hint', className: 'meta' },
            t('noticePolicy.hint')
          )
        : null,
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
          onClick: () =>
            start(review, duration * 60000, noticeAvailable && noticeReplies),
        },
        t(
          noticeAvailable && noticeReplies
            ? 'noticePolicy.start'
            : 'browserWatch.start'
        )
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
    el(WatchStart, {
      key: 'start',
      busy,
      active: state.active,
      available,
      noticeAvailable: props.noticeAvailable,
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
