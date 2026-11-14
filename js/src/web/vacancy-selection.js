import React from 'react';
import { useDates } from './i18n.js';

const el = React.createElement;
export const VacancySelectionSettings = ({ state, t, update }) =>
  el('div', { className: 'col', 'data-vacancy-selection-settings': true }, [
    el('label', { key: 'responded', className: 'check' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: state.values.skipResponded ?? true,
        'data-vacancy-field': 'skipResponded',
        onChange: (event) => update('skipResponded', event.target.checked),
      }),
      t('vacancySelection.skipResponded'),
    ]),
    el('label', { key: 'exclude', className: 'chat-form-field' }, [
      el(
        'span',
        { key: 'label', className: 'meta' },
        t('vacancySelection.excludeText')
      ),
      el('textarea', {
        key: 'input',
        rows: 3,
        maxLength: 4000,
        value: state.values.excludeText ?? '',
        'data-vacancy-field': 'excludeText',
        onChange: (event) => update('excludeText', event.target.value),
      }),
    ]),
    el('p', { key: 'hint', className: 'meta' }, t('vacancySelection.hint')),
  ]);

export const selectionIsCurrent = (state) => {
  const result = state.result;
  return Boolean(
    result?.selection &&
    state.choices?.ready &&
    result.selection.browserSlot === state.values.browserSlot &&
    result.selection.choiceRevision === state.choices.snapshot?.revision &&
    JSON.stringify(result.input) === JSON.stringify(state.values)
  );
};

export const VacancySelectionSummary = ({ state, t }) => {
  const { dateTime } = useDates();
  const selection = state.result?.selection;
  const current = selectionIsCurrent(state);
  const count = (reasons) =>
    selection?.decisions.filter((row) => reasons.includes(row.reason)).length;
  const message = !selection
    ? t('vacancySelection.unavailable')
    : !current
      ? t('vacancySelection.stale')
      : t('vacancySelection.summary', {
          excluded: count([
            'owner-skipped',
            'responded',
            'configured-text',
            'retry-wait',
          ]),
          deferred: count(['owner-deferred']),
          unread: count(['needs-description']),
          review: count(['review']),
        });
  return el('div', { className: 'col' }, [
    el(
      'p',
      {
        key: 'status',
        className: 'meta',
        role: 'status',
        'data-vacancy-selection-summary': current ? 'current' : 'stale',
      },
      message
    ),
    state.result?.capturedAt
      ? el(
          'p',
          { key: 'capture', className: 'meta' },
          t('vacancySelection.searchAt', {
            date: dateTime(state.result.capturedAt),
          })
        )
      : null,
  ]);
};

export const VacancySelectionStatus = ({ state, card, t }) => {
  const { dateTime } = useDates();
  if (!selectionIsCurrent(state)) {
    return null;
  }
  const row = state.result.selection.decisions.find(
    (entry) => entry.url === card.url
  );
  if (!row) {
    return null;
  }
  return el('div', { className: 'col', 'data-vacancy-selection': row.reason }, [
    el(
      'p',
      { key: 'reason', className: 'meta' },
      t(`vacancySelection.${row.reason}`)
    ),
    row.term
      ? el(
          'p',
          { key: 'match', className: 'meta' },
          t('vacancySelection.match', {
            term: row.term,
            field: t(`vacancySelection.${row.field}`),
          })
        )
      : null,
    row.descriptionCapturedAt
      ? el(
          'p',
          { key: 'source', className: 'meta' },
          t('vacancySelection.cachedAt', {
            date: dateTime(row.descriptionCapturedAt),
          })
        )
      : null,
  ]);
};
