// A person's or chat's avatar as Telegram's apps draw it: their photo
// when they have one, else their initials on their peer colour's
// gradient (peer-color.js). The photo comes from the server, which keeps
// it on disk (`/api/telegram/avatar`); one that is missing is not asked
// for again while the page is open, and a photo fades in over the
// initials once loaded, so nothing jumps.

import React, { useEffect, useState } from 'react';
import { avatarFor } from './chat-model.js';
import { peerColorClass } from './peer-color.js';

const el = React.createElement;

// key → url (loaded), false (none) — for the page's lifetime.
const photos = new Map();

const photoKey = (source, peer, size) => `${source}:${peer}:${size}`;

const canAsk = (api, source, peer) =>
  source === 'telegram' &&
  peer &&
  peer !== 'me' &&
  typeof api?.telegramAvatarUrl === 'function';

const usePhoto = (api, { source, peer, size, chat, msg }) => {
  const key = photoKey(source, peer, size);
  const [url, setUrl] = useState(() => photos.get(key) || null);
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
      .then((next) => active && setUrl(next ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, key]);
  return [url, (ok) => photos.set(key, ok ? url : false)];
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
