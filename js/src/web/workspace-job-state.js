import { useEffect, useRef, useState } from 'react';

/** Observe a slot-owned job without replay; stale contexts cannot publish receipts. */
export const useWorkspaceJob = ({
  api,
  slot,
  prefix,
  member,
  fallback = 'server-required',
}) => {
  const [state, setState] = useState({
    receipt: null,
    busy: false,
    error: null,
    known: false,
  });
  const scope = useRef(null);
  if (scope.current?.slot !== slot || scope.current?.api !== api) {
    scope.current = { slot, api, busy: false, sequence: 0 };
  }
  const context = scope.current;
  const execute = async (name, input) => {
    if (context.busy || scope.current !== context) {
      return;
    }
    const sequence = ++context.sequence;
    context.busy = true;
    setState((before) => ({
      ...before,
      context,
      busy: true,
      known: false,
      error: null,
    }));
    try {
      const receipt = await api[`${prefix}${name}`](input);
      if (scope.current === context && sequence === context.sequence) {
        setState({ receipt, busy: false, error: null, known: true, context });
      }
      return receipt;
    } catch (error) {
      if (scope.current === context && sequence === context.sequence) {
        setState((before) => ({
          ...before,
          busy: false,
          known: false,
          error: error.code ?? fallback,
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
  }, [slot, api, prefix]);
  const job = state.context === context ? state.receipt?.[member] : null;
  const active = job?.active === true || job?.phase === 'running';
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      void refresh().catch(() => {});
    }, 1500);
    return () => globalThis.clearInterval(timer);
  }, [active, slot, api, prefix]);
  return {
    ...(state.context === context
      ? state
      : { receipt: null, busy: false, error: null, known: false }),
    execute,
    refresh,
  };
};
