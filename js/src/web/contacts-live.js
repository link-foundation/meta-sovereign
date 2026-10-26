// Keep the directory current while Telegram syncs and while other views
// import/edit people. Batch bursts and retain a polling/focus fallback.
import { useEffect, useState } from 'react';

export const CONTACTS_REFRESH_MS = 5000;

export const watchContacts = (
  api,
  refresh,
  {
    target = globalThis,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
    setEvery = globalThis.setInterval,
    clearEvery = globalThis.clearInterval,
  } = {}
) => {
  let timer = null;
  let stopped = false;
  const subscriptions = [];
  const schedule = () => {
    if (timer === null && !stopped) {
      timer = setTimer(() => {
        timer = null;
        !stopped && refresh();
      }, 500);
    }
  };
  const changed = (event) => {
    const id = event?.link?.id ?? event?.id ?? '';
    if (/^(person|msg):/.test(id) || event?.type === 'mode-change') {
      schedule();
    }
  };
  const attach = (promise) =>
    Promise.resolve(promise)
      .then((close) => {
        if (stopped) {
          close?.();
        } else {
          subscriptions.push(close);
        }
      })
      .catch(() => {});
  attach(api.events?.(changed, (state) => state === 'open' && schedule()));
  attach(api.on?.(changed));
  const interval = setEvery(schedule, CONTACTS_REFRESH_MS);
  target.addEventListener?.('focus', schedule);
  return () => {
    stopped = true;
    clearTimer(timer);
    clearEvery(interval);
    target.removeEventListener?.('focus', schedule);
    subscriptions.forEach((close) => close?.());
  };
};

export const useContactsRevision = (api) => {
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((n) => n + 1);
  useEffect(() => watchContacts(api, refresh), [api]);
  return [revision, refresh];
};
