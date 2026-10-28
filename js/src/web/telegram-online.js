// One header badge reports Online, Reconnecting (yellow), or Offline.
// Local transport and Telegram reconnects share it across every section;
// conversations retain only their actual history/media loading indicators.

import React, { useEffect, useRef, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
import { useBrowserOnline, useServerReconnecting } from './server-transport.js';

const el = React.createElement;

const EVERY_MS = 10_000;

/** Reachability and sign-in state of the connected Telegram account. */
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
            reconnecting:
              connected &&
              Boolean(status.connection) &&
              status.connection !== 'connected',
          };
          setReach((before) =>
            before.offline === next.offline &&
            before.reconnecting === next.reconnecting &&
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
export const badgeOf = (online, reach, connection = {}) => {
  if (connection.browserOnline === false) {
    return { online: false, reason: null };
  }
  if (!online) {
    return connection.hadServer
      ? { online: false, reconnecting: true, reason: 'chat.banner.server' }
      : { online: false, reason: null };
  }
  if (reach.needsLogin) {
    return { online: false, reason: 'header.telegramSignIn' };
  }
  if (connection.reconnecting) {
    return {
      online: false,
      reconnecting: true,
      reason: 'chat.banner.server',
    };
  }
  if (reach.offline) {
    return { online: false, reason: 'header.telegramOffline' };
  }
  if (reach.reconnecting) {
    return {
      online: false,
      reconnecting: true,
      reason: 'chat.banner.telegram',
    };
  }
  return { online: true, reason: null };
};

const openTelegramConnection = () =>
  globalThis.dispatchEvent(
    new globalThis.CustomEvent('meta-sovereign:navigate', {
      detail: { view: 'connections', anchor: '#conn-telegram' },
    })
  );

/** Global status; a Telegram sign-in failure links to its connection. */
export const ModeBadge = ({ online, api = defaultApi }) => {
  const t = useT();
  const hadServer = useRef(false);
  if (online) {
    hadServer.current = true;
  }
  const connection = {
    hadServer: hadServer.current,
    reconnecting: useServerReconnecting(),
    browserOnline: useBrowserOnline(),
  };
  const badge = badgeOf(
    online,
    useTelegramReach(api, { enabled: Boolean(online) }),
    connection
  );
  if (!badge.reason || badge.reconnecting) {
    return el(
      'span',
      {
        className: `mode-badge ${badge.reconnecting ? 'reconnecting' : badge.online ? 'online' : 'offline'}`,
        role: 'status',
        'aria-live': 'polite',
        title: badge.reason ? t(badge.reason) : undefined,
      },
      badge.reconnecting
        ? t('header.reconnecting')
        : badge.online
          ? t('header.online')
          : t('header.offline')
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
