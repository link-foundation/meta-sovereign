import React, { useState } from 'react';
import { useT } from './i18n.js';
import {
  useFormChoiceDisclosure,
  FormChoiceResult,
} from './form-choice-disclosure.js';

import {
  useFormResumeUpload,
  FormResumeUploadResult,
} from './form-resume-upload.js';

const el = React.createElement;
const latestReport = (plan, results) =>
  results.find((result) => result?.report)?.report ?? plan;
const FormApplicationError = ({ error }) => {
  const t = useT();
  return error
    ? el(
        'p',
        { role: 'alert', 'data-form-fill-error': error },
        t(
          error === 'form-existing-value'
            ? 'forms.fill.existing'
            : 'forms.fill.error',
          {
            code: error,
          }
        )
      )
    : null;
};
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
            [
              t('forms.fill.receipt', {
                field: receipt.label || receipt.fieldId,
                status: t(`forms.fill.receipt.${receipt.status}`),
              }),
              receipt.effects?.length
                ? el(
                    'ul',
                    { key: 'effects' },
                    receipt.effects.map((effect) =>
                      el(
                        'li',
                        {
                          key: effect.fieldId,
                          'data-form-effect-receipt': effect.status,
                        },
                        t('forms.fill.radioReceipt', {
                          field: effect.label || effect.fieldId,
                          status: t(`forms.fill.receipt.${effect.status}`),
                        })
                      )
                    )
                  )
                : null,
            ]
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
  const disclosure = useFormChoiceDisclosure({ api, plan, busy, setBusy });
  const upload = useFormResumeUpload({ api, plan, busy, setBusy });
  const consumed = Boolean(result) || disclosure.attempted || upload.attempted;
  const select = (id, checked) => {
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((value) => value !== id)
    );
    setError(null);
  };
  const apply = async () => {
    if (busy || consumed) {
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
            disabled: busy || consumed,
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
            disabled: busy || invalid || consumed,
            'data-action': 'apply-form-plan',
            onClick: apply,
          },
          t('forms.fill.apply')
        ),
        el(FormApplicationError, { key: 'error', error }),
        result ? el(FormApplicationResult, { key: 'result', result }) : null,
        el(FormChoiceResult, { key: 'choices', result: disclosure.result }),
        el(FormResumeUploadResult, { key: 'upload', result: upload.result }),
      ]
    ),
    el(Report, {
      key: 'report',
      report: latestReport(plan, [upload.result, disclosure.result, result]),
      selected,
      onSelect: consumed ? null : select,
      onDisclose: consumed ? null : disclosure.open,
      onAttach: consumed ? null : upload.attach,
      busy,
    }),
  ]);
};
