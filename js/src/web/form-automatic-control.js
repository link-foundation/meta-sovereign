import React, { useEffect, useMemo, useState } from 'react';
import { pendingPrefill } from '../forms/challenge-wait.js';
import { useT } from './i18n.js';
import { createFormPrefillRequest } from './form-prefill-request.js';

const el = React.createElement;

const usePrefillStatus = ({
  request,
  watching,
  setWatching,
  onPlan,
  setError,
}) => {
  useEffect(() => {
    if (!watching) {
      return;
    }
    let current = true;
    let timer;
    let state = 'waiting-owner';
    const poll = async () => {
      try {
        const value = await request.status();
        if (!current) {
          return;
        }
        if (value.state !== state || !pendingPrefill(value)) {
          onPlan(value);
        }
        state = value.state;
        if (pendingPrefill(value)) {
          timer = globalThis.setTimeout(poll, 1000);
        } else {
          setWatching(false);
        }
      } catch (failure) {
        if (current) {
          setWatching(false);
          onPlan(null);
          setError(failure.code ?? 'form-prefill-unknown');
        }
      }
    };
    timer = globalThis.setTimeout(poll, 1000);
    return () => {
      current = false;
      globalThis.clearTimeout(timer);
    };
  }, [request, watching, setWatching, onPlan, setError]);
};

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
  const [watching, setWatching] = useState(false);
  usePrefillStatus({ request, watching, setWatching, onPlan, setError });
  const recovering = request.pending();
  const run = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    onPlan(null);
    try {
      const value = await request.run({ id, ...settings });
      onPlan(value);
      setWatching(pendingPrefill(value));
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
        disabled: busy || watching || (!recovering && disabled),
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
