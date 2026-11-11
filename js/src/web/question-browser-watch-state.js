import React from 'react';
import { useT } from './i18n.js';

const useWatchPolling = ({
  api,
  id,
  enabled,
  pending,
  receive,
  setError,
  epoch,
}) => {
  const t = useT();
  React.useEffect(() => {
    if (!id || !enabled || pending || !api.browserAnswerWatchStatus) {
      return;
    }
    let alive = true;
    let timer;
    const poll = async () => {
      const revision = epoch.current;
      try {
        const value = await api.browserAnswerWatchStatus({ id });
        if (alive && revision === epoch.current) {
          receive(value);
          if (value.owned && value.state === 'active') {
            timer = globalThis.setTimeout(poll, 1500);
          }
        }
      } catch (err) {
        if (alive && revision === epoch.current) {
          setError(
            t('browserAnswer.error', { code: err.code ?? 'unconfirmed' })
          );
        }
      }
    };
    poll();
    return () => {
      alive = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, id, enabled, pending]);
};

/** Only saved status is polled. Lost mutation responses keep their request ID. */
export const useBrowserAnswerWatch = ({
  api,
  remember,
  storageKey,
  changed,
  enabled,
}) => {
  const [watch, setWatch] = React.useState(null);
  const [id, setId] = React.useState(() => remember(storageKey));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  const epoch = React.useRef(0);
  const receive = (value) => {
    setWatch(value);
    setPending(false);
    setId(value.id);
    remember(storageKey, value.id);
    changed(value.owned && value.state === 'active');
    setError('');
  };
  useWatchPolling({ api, id, enabled, pending, receive, setError, epoch });
  const start = async (review, durationMs) => {
    epoch.current++;
    const requestId = `question-watch:${globalThis.crypto.randomUUID()}`;
    remember(storageKey, requestId);
    setWatch(null);
    setId(requestId);
    setPending(true);
    changed(true);
    try {
      receive(
        await api.startBrowserAnswerWatch({
          id: requestId,
          review: review.id,
          confirm: true,
          durationMs,
        })
      );
    } catch (err) {
      if (
        [
          'question-watch-unavailable',
          'question-watch-busy',
          'question-watch-confirm-required',
        ].includes(err.code)
      ) {
        setPending(false);
        changed(false);
        setId('');
        remember(storageKey, null);
      }
      throw err;
    }
  };
  const read = async (method) => {
    epoch.current++;
    setPending(true);
    receive(await api[method]({ id }));
  };
  return {
    watch,
    id,
    pending,
    error,
    start,
    active: pending || (watch?.owned && watch.state === 'active'),
    recover: () => read('browserAnswerWatchStatus'),
    stop: () => read('stopBrowserAnswerWatch'),
  };
};
