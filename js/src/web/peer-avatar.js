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
import { mediaSrc } from './media-src.js';
import { MediaLoading } from './media-loading.js';
import { READ_RECOVERED_EVENT } from './read-retry.js';

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

// The browser has six connections to the server: a hundred photos asked
// at once took them all, and the About panel, a send or a page of
// history waited behind them. At most this many photos are asked at a
// time, those on screen; one already loaded (cached) is not held back.
export const AVATAR_SLOTS = 2;
const slots = { busy: 0, waiting: [] };

/** Run `start` once a slot is free; returns a function that gives it up. */
export const takeSlot = (start) => {
  let state = 'waiting';
  const begin = () => {
    state = 'held';
    slots.busy += 1;
    start();
  };
  if (slots.busy < AVATAR_SLOTS) {
    begin();
  } else {
    slots.waiting.push(begin);
  }
  return () => {
    if (state === 'waiting') {
      slots.waiting = slots.waiting.filter((next) => next !== begin);
    } else if (state === 'held') {
      slots.busy -= 1;
      slots.waiting.shift()?.();
    }
    state = 'done';
  };
};

// Whether `url` may be loaded: at once when cached, else once the
// avatar is on screen and a slot is free. `done()` frees the slot.
const useSlot = (box, url, cached) => {
  const [granted, setGranted] = useState(cached);
  const free = useRef(() => {});
  useEffect(() => {
    setGranted(Boolean(url) && cached);
    if (!url || cached) {
      return undefined;
    }
    let release = () => {};
    const ask = () => {
      release = takeSlot(() => setGranted(true));
    };
    const Observer = globalThis.IntersectionObserver;
    let observer = null;
    if (typeof Observer === 'function' && box.current) {
      observer = new Observer((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          ask();
        }
      });
      observer.observe(box.current);
    } else {
      ask();
    }
    free.current = () => release();
    return () => {
      observer?.disconnect();
      release();
    };
  }, [url, cached]);
  return [granted, () => free.current()];
};

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
    const recovered = () => {
      for (const [key, value] of photos) {
        if (value === false) {
          photos.delete(key);
        }
      }
      state.count += 1;
      state.listeners.forEach((listener) => listener(state.count));
    };
    returns.set(api, state);
    globalThis.addEventListener?.(READ_RECOVERED_EVENT, recovered);
    Promise.resolve(
      api.on?.((event) => {
        if (event?.type === 'mode-change' && event.online) {
          recovered();
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
  useEffect(() => setAttempt(0), [key, returned]);
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
  return [url, settle, attempt < RETRY_DELAYS_MS.length];
};

const photoPending = (url, granted, shown, failed) =>
  Boolean(url && granted && !shown && !failed);

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
  const [url, remember, retrying] = usePhoto(api, {
    source,
    peer,
    size,
    chat,
    msg,
  });
  const box = useRef(null);
  const cached =
    Boolean(url) && photos.get(photoKey(source, peer, size)) === url;
  const [granted, done] = useSlot(box, url, cached);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setShown(false);
    setFailed(false);
  }, [url]);
  return el(
    'span',
    {
      ref: box,
      className: `${className} peer-avatar ${peerColorClass(peer, { name })}`,
      'aria-hidden': 'true',
      ...(title ? { title } : {}),
    },
    [
      el('span', { key: 'i', className: 'peer-avatar-initials' }, initials),
      el(MediaLoading, {
        key: 'loading',
        active: photoPending(url, granted, shown, failed),
      }),
      url && granted
        ? el('img', {
            key: 'p',
            ...mediaSrc(url),
            alt: '',
            loading: 'lazy',
            decoding: 'async',
            draggable: false,
            'data-media-retrying': retrying ? 'true' : 'false',
            className: shown ? 'shown' : undefined,
            onLoad: () => {
              done();
              remember(true);
              setShown(true);
            },
            onError: () => {
              done();
              remember(false);
              setFailed(true);
              setShown(false);
            },
          })
        : null,
    ]
  );
};
