import React from 'react';

const el = React.createElement;
export const ApplicationDraftView = ({ receipt, t }) => {
  const draft = receipt.draft;
  if (!draft) {
    return null;
  }
  return el('details', { 'data-application-draft': true }, [
    el('summary', { key: 'title' }, t('application.draft')),
    el(
      'p',
      { key: 'time', className: 'meta' },
      t('application.draftSaved', { time: draft.capturedAt })
    ),
    el('p', { key: 'hint', role: 'note' }, t('application.draftHint')),
    draft.limit
      ? el(
          'p',
          { key: 'limit', role: 'note', 'data-application-limit-draft': true },
          t('application.limitDraftSaved')
        )
      : null,
    el(
      'dl',
      { key: 'answers' },
      draft.fields.flatMap((field, index) => [
        el('dt', { key: `q-${index}` }, field.label),
        el(
          'dd',
          {
            key: `a-${index}`,
            style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
          },
          field.checked === null
            ? field.value
            : t(`application.draft.${field.checked ? 'checked' : 'unchecked'}`)
        ),
      ])
    ),
    receipt.restoration
      ? el(
          'p',
          {
            key: 'restoration',
            role: 'status',
            'data-application-restoration': receipt.restoration.state,
          },
          t(`application.restore.${receipt.restoration.state}`)
        )
      : null,
  ]);
};
