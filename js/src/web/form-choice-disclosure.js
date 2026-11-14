import React, { useState } from 'react';
import { useT } from './i18n.js';

export const useFormChoiceDisclosure = ({ api, plan, busy, setBusy }) => {
  const [result, setResult] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const open = async (fieldId) => {
    if (busy || attempted) {
      return;
    }
    setAttempted(true);
    setBusy(true);
    try {
      const value = await api.formsDiscloseReview({
        id: plan.reviewPlan.sessionId,
        planId: plan.reviewPlan.id,
        fieldId,
      });
      setResult(
        value?.mode === 'choices-result'
          ? value
          : {
              state: 'uncertain',
              code: value?.code ?? 'form-choices-unknown',
            }
      );
    } catch (error) {
      setResult({
        state: 'uncertain',
        code: error.code ?? 'form-choices-unknown',
      });
    } finally {
      setBusy(false);
    }
  };
  return { result, attempted, open };
};

export const FormChoiceResult = ({ result }) => {
  const t = useT();
  return result
    ? React.createElement(
        'p',
        {
          role: 'status',
          'data-form-choices': result.state,
        },
        t(`forms.choices.${result.state}`, { code: result.code ?? '' })
      )
    : null;
};

export const FormChoiceInspection = ({ field, onDisclose, busy }) => {
  const t = useT();
  return onDisclose && field.answer?.inspectOptionsSupported
    ? React.createElement(
        'button',
        {
          type: 'button',
          disabled: busy,
          'data-form-disclose': field.id,
          onClick: () => onDisclose(field.id),
        },
        t('forms.choices.inspect')
      )
    : null;
};
