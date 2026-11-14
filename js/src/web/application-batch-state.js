import { useEffect, useRef, useState } from 'react';

/** Status polling observes the owned run; mounting never starts or resumes one. */
export const useApplicationBatch = ({ api, values, options, session }) => {
  const [state, setState] = useState({
    receipt: null,
    busy: false,
    error: null,
    known: false,
  });
  const slot = values.browserSlot;
  const scope = useRef(null);
  if (scope.current?.slot !== slot || scope.current?.api !== api) {
    scope.current = { slot, api, busy: false, sequence: 0 };
  }
  const context = scope.current;
  const execute = async (name, input) => {
    if (context.busy) {
      return;
    }
    const current = ++context.sequence;
    context.busy = true;
    setState((before) => ({
      ...before,
      context,
      busy: true,
      known: false,
      error: null,
    }));
    try {
      const receipt = await api[`vacancyApplicationBatch${name}`](input);
      if (scope.current === context && current === context.sequence) {
        setState({ receipt, busy: false, error: null, known: true, context });
      }
      return receipt;
    } catch (error) {
      if (scope.current === context && current === context.sequence) {
        setState((before) => ({
          ...before,
          busy: false,
          known: false,
          error: error.code ?? 'jobs-application-batch-recovery',
        }));
      }
      throw error;
    } finally {
      context.busy = false;
    }
  };
  const refresh = () => execute('Status', { browserSlot: slot });
  useEffect(() => {
    context.sequence++;
    setState({ receipt: null, busy: false, error: null, known: false });
    void refresh().catch(() => {});
    return () => {
      context.sequence++;
    };
  }, [slot, api]);
  useEffect(() => {
    if (!state.receipt?.batch?.active) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      void refresh().catch(() => {});
    }, 1500);
    return () => globalThis.clearInterval(timer);
  }, [state.receipt?.batch?.active, slot, api]);
  const visible =
    state.context === context
      ? state
      : { receipt: null, busy: false, error: null, known: false };
  const batch = visible.receipt?.batch;
  const identity = { browserSlot: slot, requestId: batch?.requestId };
  return {
    ...visible,
    refresh,
    start: (draft) =>
      execute('Start', {
        ...options,
        ...draft,
        urls: draft.urls.split(/\s+/u).filter(Boolean),
        browserSlot: slot,
        requestId: globalThis.crypto.randomUUID(),
        confirm: true,
        headless:
          values.mode === 'inherit' ? undefined : values.mode === 'headless',
      }),
    stop: () => execute('Stop', identity),
    mode: (change) =>
      execute('Mode', { ...identity, ...change, revision: batch?.revision }),
    follow: () => session.followBatch(visible.receipt.application),
  };
};
