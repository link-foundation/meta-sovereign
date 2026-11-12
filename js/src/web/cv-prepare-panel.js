import React from 'react';

const el = React.createElement;
const cancelledPreparation = (state) =>
  state.cancellation ??
  (state.preparation?.state === 'cancelled' ? state.preparation : null);
export const CvPreparation = ({ state, review, idle, t }) => {
  const saved = review?.status === 'reviewed';
  const changes = saved
    ? review.report.changes.filter(
        (change) =>
          change.field === 'about' && review.selected.includes(change.id)
      )
    : [];
  const cancellation = cancelledPreparation(state);
  const result = cancellation ? null : state.preparation;
  return el(
    'section',
    {
      className: 'col',
      'data-cv-preparation': true,
      style: { minWidth: 0, overflowWrap: 'anywhere' },
    },
    [
      el('h4', { key: 'title' }, t('cvPrepare.title')),
      el('p', { key: 'hint', className: 'meta' }, t('cvPrepare.hint')),
      !changes.length ? el('p', { key: 'none' }, t('cvPrepare.choose')) : null,
      el('div', { key: 'actions', className: 'row' }, [
        ...changes.map((change) =>
          el(
            'button',
            {
              key: change.id,
              type: 'button',
              disabled: !idle || !state.ready,
              onClick: () => state.prepare(review, change),
              'data-cv-prepare-change': change.id,
            },
            `${t('cvPrepare.prepare')} · ${change.language.toUpperCase()}`
          )
        ),
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            disabled: !idle,
            onClick: state.reload,
            'data-cv-prepare-reload': true,
          },
          t('cvPrepare.reload')
        ),
        state.canCancel
          ? el(
              'button',
              {
                key: 'cancel',
                type: 'button',
                disabled: !idle,
                onClick: state.cancel,
                'data-cv-prepare-cancel': true,
              },
              t('cvPrepare.cancel')
            )
          : null,
      ]),
      !state.ready
        ? el('p', { key: 'recovery', role: 'status' }, t('cvPrepare.recovery'))
        : null,
      state.canCancel
        ? el('p', { key: 'cancel-hint' }, t('cvPrepare.cancelHint'))
        : null,
      state.pendingId
        ? el('p', { key: 'pending', className: 'meta' }, state.pendingId)
        : null,
      cancellation
        ? el(
            'div',
            {
              key: 'cancelled',
              role: 'status',
              'data-cv-prepare-cancelled': cancellation.requestId,
              'data-cv-preparation-state': 'cancelled',
              'data-cv-preparation-request': cancellation.requestId,
            },
            [
              el('p', { key: 'text' }, t('cvPrepare.cancelled')),
              el(
                'p',
                { key: 'identity', className: 'meta' },
                `${cancellation.requestId} · ${cancellation.updatedAt}`
              ),
            ]
          )
        : null,
      result
        ? el(
            'div',
            {
              key: 'result',
              role: 'status',
              'data-cv-preparation-state': result.state,
              'data-cv-preparation-request': result.requestId,
            },
            [
              el('p', { key: 'state' }, t(`cvPrepare.${result.state}`)),
              el(
                'p',
                { key: 'identity', className: 'meta' },
                `${result.language.toUpperCase()} · ${result.hash ?? ''} · ${result.requestId} · ${result.updatedAt}`
              ),
              result.code
                ? el('p', { key: 'code', className: 'meta' }, result.code)
                : null,
            ]
          )
        : null,
    ]
  );
};
