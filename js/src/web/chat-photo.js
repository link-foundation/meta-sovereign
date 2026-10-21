/**
 * A photo in a message: the blurred preview at once, the photo itself
 * once it comes near the screen, and the full one in a viewer on a
 * click. It has its own size, from the photo's proportions, as in
 * Telegram (at most PHOTO_MAX_PX wide, a tall one at least
 * PHOTO_MIN_PX); in an album it fills its tile (./chat-album.js).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { strippedJpegDataUrl } from './message-parts.js';
import { mediaSrc } from './media-src.js';

const el = React.createElement;

export const PHOTO_MAX_PX = 320;
const PHOTO_MIN_PX = 160;
const FILL = { width: '100%', height: '100%' };

/** A photo's box: its width and proportions (4:3 when not known). */
export const photoBox = (media, max = PHOTO_MAX_PX) => {
  const ratio = media?.aspectRatio > 0 ? media.aspectRatio : 4 / 3;
  const width =
    ratio >= 1 ? max : Math.max(PHOTO_MIN_PX, Math.round(max * ratio));
  return { width: `${width}px`, maxWidth: '100%', aspectRatio: String(ratio) };
};

// A lazy-loading photo that shows the stripped thumbnail immediately
// and fetches the real one when scrolled near view.
export const MediaPhoto = ({ media, api, chat, msgId, fill = false }) => {
  const t = useT();
  const ref = useRef(null);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const strippedUrl =
    !failed && media?.strippedB64
      ? strippedJpegDataUrl(media.strippedB64)
      : null;

  useEffect(() => {
    const el2 = ref.current;
    if (!el2 || !api?.telegramMediaUrl || !chat || !msgId) {
      return undefined;
    }
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      return undefined;
    }
    let active = true;
    const obs = new Observer(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) {
          return;
        }
        obs.disconnect();
        api.telegramMediaUrl({ chat, id: msgId, size: 'm' }).then((url) => {
          if (active && url) {
            setSrc(url);
          }
        });
      },
      { rootMargin: '200px' }
    );
    obs.observe(el2);
    return () => {
      active = false;
      obs.disconnect();
    };
  }, [api, chat, msgId]);

  const imgSrc = src || strippedUrl;
  const blurred = !src && Boolean(strippedUrl);

  return el(
    'div',
    {
      ref,
      className: 'bubble-photo',
      // Its own size, as Telegram's: a bubble with no text has no width
      // of its own to take a share of. In an album it fills its tile.
      style: fill ? FILL : photoBox(media),
      role: 'button',
      tabIndex: 0,
      'aria-label': t('chat.openMedia'),
      onClick: () => imgSrc && setOpen(true),
      onKeyDown: (e) => e.key === 'Enter' && imgSrc && setOpen(true),
    },
    [
      imgSrc
        ? el('img', {
            key: 'img',
            ...mediaSrc(imgSrc),
            // Not loaded (refused, gone): the blurred preview, or nothing,
            // never the browser's broken picture.
            onError: () => (src ? setSrc(null) : setFailed(true)),
            className: blurred
              ? 'bubble-photo-img blurred'
              : 'bubble-photo-img',
            alt: '',
            draggable: false,
          })
        : el('span', { key: 'ph', className: 'bubble-photo-placeholder' }),
      open
        ? el(PhotoViewer, {
            key: 'viewer',
            src: src || strippedUrl,
            onClose: () => setOpen(false),
            onRequestFull: async () => {
              if (!api?.telegramMediaUrl) {
                return;
              }
              const url = await api.telegramMediaUrl({
                chat,
                id: msgId,
                size: 'x',
              });
              if (url) {
                setSrc(url);
              }
            },
          })
        : null,
    ]
  );
};

// Fullscreen viewer: ESC or click overlay closes.
const PhotoViewer = ({ src, onClose, onRequestFull }) => {
  const t = useT();
  useEffect(() => {
    onRequestFull?.();
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
  return el(
    'div',
    {
      className: 'photo-viewer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.openMedia'),
      onClick: onClose,
    },
    el('img', {
      ...mediaSrc(src),
      className: 'photo-viewer-img',
      alt: '',
      onClick: (e) => e.stopPropagation(),
    })
  );
};
