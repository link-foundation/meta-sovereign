// Telegram's reachability in the header's Online/Offline badge (R-Y96).
// There is no sync line under the chat list: the server keeps retrying by
// itself, as Telegram's apps do, and only a connection lost for long
// (OFFLINE_AFTER_MS on the server) or a session Telegram ended turns the
// badge to Offline; then it says why and leads to the Telegram connection.

import React, { useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';

const el = React.createElement;

const EVERY_MS = 10_000;

/** `{ offline, needsLogin }` of the connected Telegram account. */
export const useTelegramReach = (
  api,
  { enabled = true, everyMs = EVERY_MS } = {}
) => {
  const [reach, setReach] = useState({ offline: false, needsLogin: false });
  useEffect(() => {
    if (!enabled || typeof api?.telegramStatus !== 'function') {
      return undefined;
    }
    let cancelled = false;
    const load = () =>
      Promise.resolve(api.telegramStatus())
        .then((status) => {
          if (cancelled) {
            return;
          }
          const connected = Boolean(status?.connected);
          const next = {
            offline: connected && Boolean(status.offline),
            needsLogin: connected && Boolean(status.needsLogin),
          };
          setReach((before) =>
            before.offline === next.offline &&
            before.needsLogin === next.needsLogin
              ? before
              : next
          );
        })
        .catch(() => {});
    load();
    const timer = globalThis.setInterval(load, everyMs);
    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [api, enabled, everyMs]);
  return reach;
};

/** What the header badge shows: online, and the reason when it is not. */
export const badgeOf = (online, reach) => {
  if (!online) {
    return { online: false, reason: null };
  }
  if (reach.needsLogin) {
    return { online: false, reason: 'header.telegramSignIn' };
  }
  if (reach.offline) {
    return { online: false, reason: 'header.telegramOffline' };
  }
  return { online: true, reason: null };
};

const openTelegramConnection = () =>
  globalThis.dispatchEvent(
    new globalThis.CustomEvent('meta-sovereign:navigate', {
      detail: { view: 'connections', anchor: '#conn-telegram' },
    })
  );

/** The header's Online/Offline; Offline for Telegram says why, and opens it. */
export const ModeBadge = ({ online, api = defaultApi }) => {
  const t = useT();
  const badge = badgeOf(
    online,
    useTelegramReach(api, { enabled: Boolean(online) })
  );
  if (!badge.reason) {
    return el(
      'span',
      { className: `mode-badge ${badge.online ? 'online' : 'offline'}` },
      badge.online ? t('header.online') : t('header.offline')
    );
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'mode-badge offline',
      'data-action': 'telegram-offline',
      title: t(badge.reason),
      'aria-label': `${t('header.offline')}: ${t(badge.reason)}`,
      onClick: openTelegramConnection,
    },
    t('header.offline')
  );
};
