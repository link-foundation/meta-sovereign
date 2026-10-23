// What the Telegram Business dialogs share (R-Y180): a read asked when a
// dialog opens, the words for Telegram's refusals (Telegram Business needs
// Premium), and a Save that closes the dialog only when it worked.

import { useEffect, useState } from 'react';

/** The words for a code; unknown ones are the general failure. */
export const errorText = (t, code) => {
  const key = `chat.business.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.business.err.failed') : text;
};

/**
 * `call()` asked once when the dialog opens: `{ phase: 'loading' | 'ready'
 * | 'error', data, code }`. `call` is not a hook dependency.
 */
export const useBusinessRead = (call, wanted = true) => {
  const [state, setState] = useState({ phase: 'loading', data: null });
  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    let live = true;
    Promise.resolve()
      .then(call)
      .then(
        (answer) =>
          live &&
          setState(
            answer?.ok
              ? { phase: 'ready', data: answer }
              : { phase: 'error', code: answer?.code ?? 'failed' }
          ),
        () => live && setState({ phase: 'error', code: 'failed' })
      );
    return () => {
      live = false;
    };
  }, [wanted]);
  return state;
};

/**
 * `save(run)`: runs `run()` (an api write), shows the refusal in words and
 * calls `done` when it worked. `{ busy, error, save, fail }`.
 */
export const useSaving = (t, done) => {
  const [state, setState] = useState({ busy: false, error: null });
  return {
    ...state,
    fail: (code) => setState({ busy: false, error: errorText(t, code) }),
    save: async (run) => {
      setState({ busy: true, error: null });
      const answer = await Promise.resolve()
        .then(run)
        .catch(() => null);
      if (answer?.ok) {
        setState({ busy: false, error: null });
        done?.(answer);
      } else {
        setState({
          busy: false,
          error: errorText(t, answer?.code ?? 'failed'),
        });
      }
      return answer;
    },
  };
};
