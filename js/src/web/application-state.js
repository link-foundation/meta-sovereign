import { useEffect, useMemo, useState } from 'react';
import { ApplicationSession } from './application-session.js';

export const useApplication = ({ api, values, selected, run }) => {
  const session = useMemo(() => new ApplicationSession(api), [api]);
  const [state, setState] = useState(session.state);
  const [options, setOptions] = useState({
    coverLetter: '',
    autoSelectResumeLanguage: true,
    autoExact: false,
    testMode: false,
    supervised: false,
    reviewDelayMs: 3000,
  });
  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    setState(session.state);
    if (session.state.intent) {
      void session.recover().catch(() => {});
    }
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session]);
  useEffect(() => {
    const input = selected?.url
      ? { url: selected.url, browserSlot: values.browserSlot }
      : null;
    void session.select(input).catch(() => {});
  }, [session, selected?.url, values.browserSlot]);
  useEffect(() => {
    void session
      .refreshQueue({ browserSlot: values.browserSlot })
      .catch(() => {});
  }, [session, values.browserSlot]);
  const waiting = ['waiting', 'refreshing', 'restoring'].includes(
    state.receipt?.limitWait?.phase
  );
  useEffect(() => {
    if (!waiting) {
      return;
    }
    let pending = false;
    const timer = globalThis.setInterval(async () => {
      if (!pending && !session.state.busy) {
        pending = true;
        try {
          await session.recover();
          await session.refreshQueue({ browserSlot: values.browserSlot });
        } catch {
          // Status recovery stays read only; a lost response cannot restart work.
        } finally {
          pending = false;
        }
      }
    }, 1500);
    return () => globalThis.clearInterval(timer);
  }, [session, waiting, values.browserSlot]);
  const operate = (kind, action) =>
    run(`application-${kind}`, async () => {
      try {
        await action();
        return { ok: true };
      } finally {
        await session
          .refreshQueue({ browserSlot: values.browserSlot })
          .catch(() => {});
      }
    });
  return {
    ...state,
    options,
    setOptions,
    occupied: Boolean(state.intent && (!state.known || state.receipt?.active)),
    start: () =>
      operate('open', () =>
        session.start({
          ...options,
          headless:
            values.mode === 'inherit' ? undefined : values.mode === 'headless',
        })
      ),
    recover: () => operate('status', () => session.recover()),
    reopen: () => operate('reopen', () => session.reopen()),
    release: () => operate('release', () => session.release()),
    action: (name, input) =>
      operate(name.toLowerCase(), () => session.action(name, input)),
    refreshQueue: () =>
      session.refreshQueue({ browserSlot: values.browserSlot }),
    retry: (entry) => operate('retry', () => session.retry(entry)),
    stop: () => operate('stop', () => session.stop()),
  };
};
