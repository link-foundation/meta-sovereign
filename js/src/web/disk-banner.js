// The "disk almost full" notice (R-Z14): shown above the views while the
// server reports a nearly full disk (under 1 GiB free) or writes that
// cannot reach the disk. It does not block anything, can be hidden for the
// session, and stays away when the free space is unknown.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;

const DISMISS_KEY = 'ms.disk-banner.dismissed';
const POLL_MS = 60_000;

/** Whether `/api/health`'s answer calls for the notice. */
export const diskNotice = (health) =>
  health?.disk?.low === true || health?.store?.degraded === true;

const readDismissed = () => {
  try {
    return globalThis.sessionStorage?.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

const saveDismissed = () => {
  try {
    globalThis.sessionStorage?.setItem(DISMISS_KEY, '1');
  } catch {
    // Storage can be disabled; the notice then hides for this render only.
  }
};

// The health answer, now and every minute while the page is open.
const useHealth = (api) => {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const look = () =>
      Promise.resolve(api.health?.())
        .then((next) => {
          if (!cancelled) {
            setHealth(next ?? null);
          }
        })
        .catch(() => {});
    look();
    const timer = globalThis.setInterval(look, POLL_MS);
    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [api]);
  return health;
};

/** @param {{ api: { health?: () => Promise<object|null> }, health?: object }} props `health` overrides the polled answer (tests). */
export const DiskBanner = ({ api, health: given }) => {
  const t = useT();
  const polled = useHealth(api ?? {});
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed || !diskNotice(given ?? polled)) {
    return null;
  }
  return el(
    'aside',
    { className: 'disk-banner', role: 'status', 'data-banner': 'disk-low' },
    [
      el('span', { key: 'text' }, t('disk.banner')),
      el(
        'button',
        {
          key: 'dismiss',
          type: 'button',
          'data-action': 'disk-banner-dismiss',
          onClick: () => {
            saveDismissed();
            setDismissed(true);
          },
        },
        t('disk.dismiss')
      ),
    ]
  );
};
