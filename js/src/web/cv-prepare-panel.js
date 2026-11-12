import React from 'react';
import { cvTechnologyFieldLabel } from './cv-technology-view.js';

const el = React.createElement;
const cancelledPreparation = (state) =>
  state.cancellation ??
  (state.preparation?.state === 'cancelled' ? state.preparation : null);
const WorkplacePreparation = ({ change, review, state, idle, t }) => {
  const [recordId, setRecordId] = React.useState('');
  return el(
    'div',
    { className: 'col', 'data-cv-prepare-workplace': change.id },
    [
      el(
        'p',
        { key: 'job', className: 'meta' },
        `${change.language.toUpperCase()} · ${cvTechnologyFieldLabel(review, change, t)}`
      ),
      el('label', { key: 'record', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('cvPrepare.recordId')),
        el('input', {
          key: 'input',
          value: recordId,
          inputMode: 'numeric',
          maxLength: 100,
          disabled: !idle,
          'data-cv-prepare-record': change.id,
          onChange: (event) => setRecordId(event.target.value),
        }),
      ]),
      el(
        'button',
        {
          key: 'prepare',
          type: 'button',
          disabled: !idle || !state.ready || !/^\d{1,100}$/u.test(recordId),
          onClick: () => state.prepare(review, change, { recordId }),
          'data-cv-prepare-change': change.id,
        },
        t('cvPrepare.description')
      ),
    ]
  );
};
export const PreparationReceipt = ({ result, t }) =>
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
            [
              result.language?.toUpperCase(),
              result.hash,
              result.requestId,
              result.updatedAt,
            ]
              .filter(Boolean)
              .join(' · ')
          ),
          result.recordId
            ? el(
                'p',
                { key: 'record', className: 'meta' },
                `${t('cvPrepare.recordId')}: ${result.recordId}`
              )
            : null,
          result.code
            ? el('p', { key: 'code', className: 'meta' }, result.code)
            : null,
        ]
      )
    : null;

export const CvPreparation = ({ state, review, idle, t }) => {
  const [limit, setLimit] = React.useState(10);
  const saved = review?.status === 'reviewed';
  const changes = saved
    ? review.report.changes.filter((change) =>
        review.selected.includes(change.id)
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
      !changes.length || changes.some((change) => change.field === 'about')
        ? el('p', { key: 'hint', className: 'meta' }, t('cvPrepare.hint'))
        : null,
      changes.some((change) => change.field !== 'about')
        ? el(
            'p',
            { key: 'workplace-hint', className: 'meta' },
            t('cvPrepare.workplaceHint')
          )
        : null,
      !changes.length ? el('p', { key: 'none' }, t('cvPrepare.choose')) : null,
      el('div', { key: 'actions', className: 'row' }, [
        ...changes
          .filter((change) => change.field === 'about')
          .map((change) =>
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
      ...changes
        .filter((change) => change.field !== 'about')
        .slice(0, limit)
        .map((change) =>
          el(WorkplacePreparation, {
            key: `${review.fingerprint}:${change.id}`,
            change,
            review,
            state,
            idle,
            t,
          })
        ),
      changes.filter((change) => change.field !== 'about').length > limit
        ? el(
            'button',
            {
              key: 'more',
              type: 'button',
              onClick: () => setLimit(limit + 10),
            },
            t('cvTechnology.moreChanges')
          )
        : null,
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
      el(PreparationReceipt, { key: 'receipt', result, t }),
    ]
  );
};
