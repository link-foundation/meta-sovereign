import { useCallback, useEffect, useRef, useState } from 'react';
import { createRetryingRead } from './read-retry.js';
import { activeAccount } from './telegram-account-scope.js';

export const useFeedbackRead = (load, key, enabled = true) => {
  const latest = useRef(load);
  latest.current = load;
  const account = activeAccount();
  const [state, setState] = useState({ key: null, data: null, loading: true });
  const reader = useRef(null);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let live = true;
    const read = createRetryingRead(
      async () => {
        const answer = await latest.current();
        if (!answer || answer.error || answer.ok === false) {
          throw new Error(
            answer?.error ?? answer?.code ?? 'feedback unavailable'
          );
        }
        return answer;
      },
      {
        accept: (data) =>
          live &&
          activeAccount() === account &&
          setState({ key, account, data, loading: false }),
        failed: () => {},
      }
    );
    reader.current = read;
    read.refresh();
    const focus = () => read.refresh();
    globalThis.addEventListener?.('focus', focus);
    const timer = globalThis.setInterval(() => {
      if (globalThis.document?.visibilityState !== 'hidden') {
        read.refresh();
      }
    }, 15000);
    return () => {
      live = false;
      read.stop();
      globalThis.removeEventListener?.('focus', focus);
      globalThis.clearInterval(timer);
    };
  }, [key, enabled, account]);
  const refresh = useCallback(() => reader.current?.refresh(), []);
  return {
    data: state.key === key && state.account === account ? state.data : null,
    loading: state.key !== key || state.account !== account || state.loading,
    refresh,
  };
};
