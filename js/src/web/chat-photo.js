/**
 * A photo in a message: the blurred preview at once, the photo itself
 * once it comes near the screen, and the full one in a viewer on a
 * click. It has its own size, from the photo's proportions, as in
 * Telegram (at most PHOTO_MAX_PX wide, a tall one at least
 * PHOTO_MIN_PX); in an album it fills its tile (./chat-album.js).
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { strippedJpegDataUrl } from './message-parts.js';
import { mediaSrc } from './media-src.js';
import { useAutoLoad } from './auto-download.js';
import { Icon } from './icons.js';
import { useNearView } from './chat-media.js';
import {
  MediaLoading,
  useMediaReady,
  useMediaSource,
} from './media-loading.js';
import { AttachedStickers } from './chat-attached-stickers.js';
import { viewerStickers } from './chat-attached-button.js';

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

/** A photo's biggest size in bytes (0 when not known). */
export const photoBytes = (media) =>
  Math.max(0, ...(media?.sizes ?? []).map((s) => Number(s.size) || 0));

const bytesText = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const PhotoImage = ({ src, preview, ready }) => {
  const shown = src || preview;
  return shown
    ? el('img', {
        ...mediaSrc(shown),
        onLoad: src ? ready.handlers.onLoad : undefined,
        onError: src ? ready.handlers.onError : undefined,
        'data-media-ready': src && !ready.ready ? 'false' : undefined,
        className:
          !ready.ready && preview
            ? 'bubble-photo-img blurred'
            : 'bubble-photo-img',
        alt: '',
        draggable: false,
      })
    : el('span', { className: 'bubble-photo-placeholder' });
};

const photoBusy = (near, load, ready, failed) =>
  near && load.allowed && !ready.ready && !failed;
const requestPhotoFull = async (api, chat, msgId, setFull) => {
  const url = await api?.telegramMediaUrl?.({ chat, id: msgId, size: 'x' });
  if (url) {
    setFull(url);
  }
};

// A lazy-loading photo that shows the stripped thumbnail immediately
// and fetches the real one when scrolled near view.
export const MediaPhoto = ({ media, api, chat, msgId, fill = false }) => {
  const t = useT();
  const ref = useRef(null);
  const [full, setFull] = useState(null);
  const { near } = useNearView(ref);
  const [open, setOpen] = useState(false);
  // R-Y181: a photo the settings do not allow waits for a click.
  const load = useAutoLoad('photo');
  const bytes = photoBytes(media);
  const strippedUrl = media?.strippedB64
    ? strippedJpegDataUrl(media.strippedB64)
    : null;

  const source = useMediaSource(
    api,
    'telegramMediaUrl',
    { chat, id: msgId, size: 'm' },
    near && load.allowed
  );
  const src = full || source.url;
  const ready = useMediaReady(src);
  const imgSrc = src || strippedUrl;
  const fail = source.failed || ready.failed;

  const openPhoto = () => {
    if (!load.allowed) {
      load.ask();
    } else if (imgSrc) {
      setOpen(true);
    }
  };

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
      'data-download': load.allowed ? undefined : 'manual',
      'aria-busy': photoBusy(near, load, ready, fail),
      onClick: openPhoto,
      onKeyDown: (e) => e.key === 'Enter' && openPhoto(),
    },
    [
      load.allowed
        ? null
        : el('span', { key: 'get', className: 'media-play media-download' }, [
            el(Icon, { key: 'i', name: 'download', size: 22 }),
            bytes
              ? el(
                  'span',
                  { key: 's', className: 'media-size' },
                  bytesText(bytes)
                )
              : null,
          ]),
      el(PhotoImage, { key: 'image', src, preview: strippedUrl, ready }),
      el(MediaLoading, {
        key: 'loading',
        active: photoBusy(near, load, ready, fail),
        failed: fail,
        retry: source.retry,
      }),
      open
        ? el(PhotoViewer, {
            key: 'viewer',
            src: src || strippedUrl,
            // "Stickers in this photo" in the viewer's menu (R-Y206).
            stickers: viewerStickers(api, media, chat, msgId),
            onClose: () => setOpen(false),
            onRequestFull: () => requestPhotoFull(api, chat, msgId, setFull),
          })
        : null,
    ]
  );
};

// The viewer's menu button; its one item opens the photo's sticker sets.
const ViewerMenu = ({ t, onStickers }) => {
  const [open, setOpen] = useState(false);
  return el(
    'div',
    { className: 'photo-viewer-menu', onClick: (e) => e.stopPropagation() },
    [
      el(
        'button',
        {
          key: 'm',
          type: 'button',
          className: 'photo-viewer-more',
          'data-action': 'viewer-menu',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          'aria-label': t('chat.extras.viewerMenu'),
          onClick: () => setOpen(!open),
        },
        '\u22ef'
      ),
      open
        ? el(
            'div',
            { key: 'l', className: 'photo-viewer-items', role: 'menu' },
            el(
              'button',
              {
                type: 'button',
                role: 'menuitem',
                'data-action': 'attached-stickers',
                onClick: () => {
                  setOpen(false);
                  onStickers();
                },
              },
              t('chat.extras.attached')
            )
          )
        : null,
    ]
  );
};

// Fullscreen viewer: ESC or click overlay closes. `stickers`, when the
// photo has stickers on it: `{ api, chat, msgId }` (R-Y206).
export const PhotoViewer = ({
  src,
  onClose,
  onRequestFull,
  stickers = null,
}) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const ready = useMediaReady(src);
  const [fullLoading, setFullLoading] = useState(Boolean(onRequestFull));
  // Escape closes the sticker sets' dialog first, not the viewer too.
  const asked = useRef(false);
  asked.current = asking;
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => onRequestFull?.())
      .catch(() => {})
      .finally(() => active && setFullLoading(false));
    const onKey = (e) => e.key === 'Escape' && !asked.current && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    return () => {
      active = false;
      globalThis.removeEventListener?.('keydown', onKey);
    };
  }, []);
  const view = el(
    'div',
    {
      className: 'photo-viewer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.openMedia'),
      // React bubbles a click to the photo under the viewer, which would
      // open it again.
      onClick: (e) => {
        e.stopPropagation();
        onClose();
      },
    },
    [
      el('img', {
        key: 'img',
        ...mediaSrc(src),
        className: 'photo-viewer-img',
        ...ready.handlers,
        'data-media-ready': ready.ready ? 'true' : 'false',
        alt: '',
        onClick: (e) => e.stopPropagation(),
      }),
      el(MediaLoading, {
        key: 'loading',
        active: fullLoading || !ready.ready,
        failed: ready.failed,
      }),
      stickers
        ? el(ViewerMenu, { key: 'menu', t, onStickers: () => setAsking(true) })
        : null,
      asking
        ? el(AttachedStickers, {
            key: 'attached',
            ...stickers,
            onClose: () => setAsking(false),
          })
        : null,
    ]
  );
  // On the page's body: the chat's own layer is under the header.
  const root = globalThis.document?.body;
  return root ? createPortal(view, root) : view;
};
