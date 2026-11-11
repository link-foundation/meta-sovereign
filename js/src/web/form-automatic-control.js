import React, { useMemo, useState } from 'react';
import { useT } from './i18n.js';
import { createFormPrefillRequest } from './form-prefill-request.js';

const el = React.createElement;

export const FormAutomaticControl = ({
  api,
  id,
  settings,
  busy,
  disabled,
  setBusy,
  onPlan,
}) => {
  const t = useT();
  const request = useMemo(() => createFormPrefillRequest(api), [api]);
  const [error, setError] = useState(null);
  const recovering = request.pending();
  const run = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    onPlan(null);
    try {
      onPlan(await request.run({ id, ...settings }));
    } catch (failure) {
      setError(failure.code ?? 'form-prefill-unknown');
    } finally {
      setBusy(false);
    }
  };
  return el('div', { className: 'col', 'data-form-automatic-controls': '' }, [
    el('p', { key: 'hint', className: 'meta' }, t('forms.automatic.hint')),
    el(
      'button',
      {
        key: 'run',
        type: 'button',
        disabled: busy || (!recovering && disabled),
        'data-action': 'prefill-form',
        'aria-busy': busy && recovering,
        onClick: run,
      },
      t(recovering ? 'forms.automatic.recover' : 'forms.automatic.action')
    ),
    error
      ? el(
          'p',
          { key: 'error', role: 'alert', 'data-form-prefill-error': error },
          t('forms.automatic.error', { code: error })
        )
      : null,
  ]);
};
