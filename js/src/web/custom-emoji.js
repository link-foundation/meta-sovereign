// A custom emoji in a message's text, drawn as Telegram's apps draw it
// (R-Y120): its picture inline at the text's size, the fallback emoji
// the message carries shown till the picture is there, and kept in the
// page (visually hidden) after, so a copied message still has the emoji
// as text. A still one is an <img>; an animated one (.tgs) plays with
// the Lottie player and a video one (.webm) as a muted loop, both while
// on screen. Nothing is asked of the server before it is near the view.

import React, { useEffect, useRef, useState } from 'react';
import { useNearView } from './chat-media.js';
import { LottieSticker } from './lottie-sticker.js';
import { mediaSrc } from './media-src.js';
import { LoadingImage, useMediaReady, useMediaRetry } from './media-loading.js';

const el = React.createElement;

// What the animation's address turned out to be: 'tgs', 'video' or
// 'none', kept so the same emoji is looked at once.
const kinds = new Map();

const kindOf = async (url) => {
  if (kinds.has(url)) {
    return kinds.get(url);
  }
  let kind = 'none';
  try {
    const answer = await globalThis.fetch(url, {
      credentials: 'same-origin',
      signal: globalThis.AbortSignal?.timeout?.(30_000),
    });
    if (answer.status >= 500 && answer.status !== 501) {
      return null;
    }
    const type = answer.ok ? (answer.headers.get('content-type') ?? '') : '';
    if (type.startsWith('video/')) {
      kind = 'video';
    } else if (type === 'application/x-tgsticker') {
      kind = 'tgs';
    }
  } catch {
    // Keep the picture while a temporary lookup failure is retried.
    return null;
  }
  // Only a definite answer may be cached as having no animation.
  // A restart's error response must not suppress it for the tab's lifetime.
  kinds.set(url, kind);
  return kind;
};

// The server's address for the emoji's picture (or animation), once `when`.
const useEmojiUrl = (api, id, full, when) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!when || typeof api?.telegramCustomEmojiUrl !== 'function') {
      return undefined;
    }
    let active = true;
    api
      .telegramCustomEmojiUrl({ id, full })
      .then((next) => active && setUrl(next ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, id, full, when]);
  return url;
};

const useKind = (url) => {
  const [kind, setKind] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useMediaRetry(kind === null, failed, () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  });
  useEffect(() => {
    let active = true;
    if (url) {
      setKind(null);
      kindOf(url).then((next) => {
        if (active) {
          setKind(next);
          setFailed(next === null);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [url, attempt]);
  return kind ?? 'none';
};

const Animation = ({ kind, url, visible, onDrawn }) => {
  const state = useMediaReady(url);
  useMediaRetry(!state.ready, state.failed, state.retry);
  if (kind === 'tgs') {
    return el(LottieSticker, {
      src: url,
      play: visible,
      onReady: onDrawn,
      className: 'msg-custom-emoji-anim',
    });
  }
  return kind === 'video' && visible
    ? el('video', {
        ...mediaSrc(url),
        ...state.handlers,
        className: 'msg-custom-emoji-anim',
        muted: true,
        loop: true,
        autoPlay: true,
        playsInline: true,
        onLoadedData: () => {
          state.handlers.onLoadedData();
          onDrawn(true);
        },
      })
    : null;
};

/** The emoji `text` (its fallback) as custom emoji `id`; `big` when alone. */
export const CustomEmoji = ({ id, text, api, big = false }) => {
  const ref = useRef(null);
  const { near, visible } = useNearView(ref);
  const still = useEmojiUrl(api, id, false, near);
  const full = useEmojiUrl(api, id, true, near);
  const kind = useKind(full);
  const [drawn, setDrawn] = useState(false);
  return el(
    'span',
    {
      ref,
      className: `msg-custom-emoji${big ? ' big' : ''}${drawn ? ' drawn' : ''}`,
      'data-custom-emoji': id,
    },
    [
      el('span', { key: 't', className: 'msg-custom-emoji-text' }, text),
      still
        ? el(LoadingImage, {
            key: 'i',
            ...mediaSrc(still),
            alt: '',
            draggable: false,
            className: 'msg-custom-emoji-img',
            compact: true,
            showProgress: false,
            onLoad: () => setDrawn(true),
          })
        : null,
      full && kind !== 'none'
        ? el(Animation, {
            key: 'a',
            kind,
            url: full,
            visible,
            onDrawn: (ok) => ok && setDrawn(true),
          })
        : null,
    ]
  );
};
