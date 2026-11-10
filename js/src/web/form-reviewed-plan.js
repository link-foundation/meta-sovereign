import React, { useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const FormApplicationResult = ({ result }) => {
  const t = useT();
  return el(
    'div',
    { className: 'col', 'data-form-application': result.state, role: 'status' },
    [
      el('p', { key: 'state' }, t(`forms.fill.state.${result.state}`)),
      result.code
        ? el(
            'p',
            { key: 'code', className: 'meta' },
            t('forms.fill.refusal', { code: result.code })
          )
        : null,
      el(
        'ul',
        { key: 'receipts' },
        result.receipts.map((receipt) =>
          el(
            'li',
            {
              key: receipt.fieldId,
              'data-form-receipt': receipt.status,
            },
            t('forms.fill.receipt', {
              field: receipt.label || receipt.fieldId,
              status: t(`forms.fill.receipt.${receipt.status}`),
            })
          )
        )
      ),
    ]
  );
};

export const FormReviewedPlan = ({ api, plan, busy, setBusy, Report }) => {
  const t = useT();
  const [selected, setSelected] = useState([]);
  const [replaceExisting, setReplace] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const select = (id, checked) => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((value) => value !== id)
    );
    setError(null);
  };
  const apply = async () => {
    if (busy || result) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const value = await api.formsApplyReview({
        id: plan.reviewPlan.sessionId,
        planId: plan.reviewPlan.id,
        fields: selected,
        replaceExisting,
      });
      if (value?.mode === 'apply-result' && Array.isArray(value.receipts)) {
        setResult(value);
      } else {
        setError(value?.code ?? 'form-application-unknown');
      }
    } catch (failure) {
      setError(failure.code ?? 'form-application-unknown');
    } finally {
      setBusy(false);
    }
  };
  const invalid =
    !selected.length || selected.length > plan.reviewPlan.maxSelected;
  return el(React.Fragment, null, [
    el(
      'section',
      { key: 'controls', className: 'card col', 'data-form-fill': '' },
      [
        el('h2', { key: 'title' }, t('forms.fill.title')),
        el('p', { key: 'hint', className: 'meta' }, t('forms.fill.hint')),
        el(
          'p',
          { key: 'selected' },
          t('forms.fill.count', {
            count: selected.length,
            limit: plan.reviewPlan.maxSelected,
          })
        ),
        el('label', { key: 'replace', className: 'row' }, [
          el('input', {
            key: 'input',
            type: 'checkbox',
            checked: replaceExisting,
            disabled: busy || Boolean(result),
            'data-form-replace': '',
            onChange: (event) => setReplace(event.target.checked),
          }),
          t('forms.fill.replace'),
        ]),
        el(
          'button',
          {
            key: 'apply',
            type: 'button',
            disabled: busy || invalid || Boolean(result),
            'data-action': 'apply-form-plan',
            onClick: apply,
          },
          t('forms.fill.apply')
        ),
        error
          ? el(
              'p',
              { key: 'error', role: 'alert', 'data-form-fill-error': error },
              t(
                error === 'form-existing-value'
                  ? 'forms.fill.existing'
                  : 'forms.fill.error',
                { code: error }
              )
            )
          : null,
        result ? el(FormApplicationResult, { key: 'result', result }) : null,
      ]
    ),
    el(Report, {
      key: 'report',
      report: result?.report ?? plan,
      selected,
      onSelect: result ? null : select,
      busy,
    }),
  ]);
};
