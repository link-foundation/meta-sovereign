// A person's or chat's avatar as Telegram's apps draw it: their photo
// when they have one, else their initials on their peer colour's
// gradient (peer-color.js). The photo comes from the server, which keeps
// it on disk (`/api/telegram/avatar`); one that does not load is asked
// again a few times (it may still be downloading), one that is missing
// is not asked for again while the page is open, and a photo fades in
// over the initials once loaded, so nothing jumps.

import React, { useEffect, useRef, useState } from 'react';
import { avatarFor } from './chat-model.js';
import { peerColorClass } from './peer-color.js';

const el = React.createElement;

// key → url (loaded), false (none) — for the page's lifetime.
const photos = new Map();
// A photo that did not load (still downloading on the server, which
// answers at once rather than hold one of the browser's few
// connections) is asked again after these waits, then given up. A
// first sync queues a hundred photos and more, so the waits run to
// minutes (R-Y68).
const RETRY_DELAYS_MS = [3000, 10_000, 30_000, 60_000, 120_000, 300_000];

const photoKey = (source, peer, size) => `${source}:${peer}:${size}`;

const canAsk = (api, source, peer) =>
  source === 'telegram' &&
  peer &&
  peer !== 'me' &&
  typeof api?.telegramAvatarUrl === 'function';

// How many times the page came back online, one subscription per api:
// a photo not asked for while offline is asked for then.
const returns = new WeakMap();
const backOnline = (api) => {
  if (!returns.has(api)) {
    const state = { count: 0, listeners: new Set() };
    returns.set(api, state);
    Promise.resolve(
      api.on?.((event) => {
        if (event?.type === 'mode-change' && event.online) {
          state.count += 1;
          for (const listener of state.listeners) {
            listener(state.count);
          }
        }
      })
    ).catch(() => {});
  }
  return returns.get(api);
};

const useBackOnline = (api) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!api || typeof api.on !== 'function') {
      return undefined;
    }
    const state = backOnline(api);
    state.listeners.add(setCount);
    return () => state.listeners.delete(setCount);
  }, [api]);
  return count;
};

const withTry = (url, attempt) =>
  url && attempt > 0
    ? `${url}${url.includes('?') ? '&' : '?'}try=${attempt}`
    : url;

const usePhoto = (api, { source, peer, size, chat, msg }) => {
  const key = photoKey(source, peer, size);
  const [url, setUrl] = useState(() => photos.get(key) || null);
  const [attempt, setAttempt] = useState(0);
  const returned = useBackOnline(api);
  const retry = useRef(null);
  useEffect(() => () => globalThis.clearTimeout(retry.current), []);
  useEffect(() => {
    const known = photos.get(key);
    if (known !== undefined) {
      setUrl(known || null);
      return undefined;
    }
    if (!canAsk(api, source, peer)) {
      setUrl(null);
      return undefined;
    }
    let active = true;
    api
      .telegramAvatarUrl({ peer, size, chat, msg })
      .then((next) => active && setUrl(withTry(next ?? null, attempt)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, key, attempt, returned]);
  const settle = (ok) => {
    if (ok) {
      photos.set(key, url);
      return;
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      globalThis.clearTimeout(retry.current);
      retry.current = globalThis.setTimeout(
        () => setAttempt((n) => n + 1),
        RETRY_DELAYS_MS[attempt]
      );
      return;
    }
    photos.set(key, false);
  };
  return [url, settle];
};

/**
 * `<span class="{className} peer-avatar peer-color-N">` with initials,
 * and the photo over them once it loads. `peer` is the person's or
 * chat's id; `chat` and `msg` say where a group member wrote, for the
 * server to find their photo by.
 */
export const PeerAvatar = ({
  api,
  source,
  peer,
  name,
  className = 'avatar',
  size = 's',
  chat,
  msg,
  title,
}) => {
  const { initials } = avatarFor(name ?? peer);
  const [url, remember] = usePhoto(api, { source, peer, size, chat, msg });
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [url]);
  return el(
    'span',
    {
      className: `${className} peer-avatar ${peerColorClass(peer, { name })}`,
      'aria-hidden': 'true',
      ...(title ? { title } : {}),
    },
    [
      el('span', { key: 'i', className: 'peer-avatar-initials' }, initials),
      url
        ? el('img', {
            key: 'p',
            src: url,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            draggable: false,
            className: shown ? 'shown' : undefined,
            onLoad: () => {
              remember(true);
              setShown(true);
            },
            onError: () => {
              remember(false);
              setShown(false);
            },
          })
        : null,
    ]
  );
};
