import React from 'react';

const el = React.createElement;
export const CvPreparation = ({ state, review, idle, t }) => {
  const saved = review?.status === 'reviewed';
  const changes = saved
    ? review.report.changes.filter(
        (change) =>
          change.field === 'about' && review.selected.includes(change.id)
      )
    : [];
  const result = state.preparation;
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
      ]),
      !state.ready
        ? el('p', { key: 'recovery', role: 'status' }, t('cvPrepare.recovery'))
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
