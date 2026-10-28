/**
 * An animated sticker (Telegram's `.tgs`: a Lottie animation, gzipped)
 * played as Telegram's apps play them (R-Y113): looping while on screen,
 * still on its first frame when off it or when the system asks for less
 * motion. Drawn as SVG by lottie-web's light player (no `eval`, no
 * workers, so the app's content policy stands). Until it is ready — or
 * when it cannot be read — what is under it (the sticker's picture)
 * shows.
 */

import React, { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web/build/player/lottie_light.js';
import { useMediaRetry } from './media-loading.js';
import { readMedia } from './media-src.js';

const el = React.createElement;

// At most this much animation is read (Telegram's are under 64 KB
// gzipped, rarely over 1 MB as text).
const MAX_TEXT = 4 * 1024 * 1024;
const KEEP = 60;

// The animations read, as text (lottie changes what it is given, so
// each player parses its own), the newest kept.
const texts = new Map();

const remember = (src, text) => {
  texts.delete(src);
  texts.set(src, text);
  while (texts.size > KEEP) {
    texts.delete(texts.keys().next().value);
  }
};

/** A `.tgs` file's (or a plain Lottie file's) text. */
export const lottieText = async (bytes) => {
  const view = new Uint8Array(bytes);
  if (view[0] !== 0x1f || view[1] !== 0x8b) {
    return new TextDecoder().decode(view);
  }
  const Stream = globalThis.DecompressionStream;
  if (typeof Stream !== 'function') {
    throw new Error('gzip not supported');
  }
  const stream = new globalThis.Blob([view])
    .stream()
    .pipeThrough(new Stream('gzip'));
  const reader = stream.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.length;
    if (size > MAX_TEXT) {
      await reader.cancel();
      throw new Error('animation too large');
    }
    parts.push(value);
  }
  return new TextDecoder().decode(
    await new globalThis.Blob(parts).arrayBuffer()
  );
};

const readText = async (src) => {
  if (texts.has(src)) {
    return texts.get(src);
  }
  const text = await lottieText(await readMedia(src, 'arrayBuffer'));
  JSON.parse(text); // An interrupted animation must not poison the text cache.
  remember(src, text);
  return text;
};

const lessMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

/** Forget the animations read (tests). */
export const forgetLottie = () => texts.clear();

/**
 * The animation at `src`, playing while `play`; `onReady(true)` once it
 * draws, `onReady(false)` when it cannot. `loop: false` plays it once and
 * holds its last frame; `end` shows that frame at once.
 */
export const LottieSticker = ({
  src,
  play,
  onReady,
  className,
  loop = true,
  end = false,
}) => {
  const box = useRef(null);
  const player = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useMediaRetry(!ready, failed, () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  });
  useEffect(() => {
    let live = true;
    setFailed(false);
    setReady(false);
    readText(src)
      .then((text) => {
        if (!live || !box.current) {
          return;
        }
        player.current = lottie.loadAnimation({
          container: box.current,
          renderer: 'svg',
          loop,
          autoplay: false,
          animationData: JSON.parse(text),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        player.current.addEventListener('DOMLoaded', () => {
          if (live) {
            setReady(true);
            onReady?.(true);
          }
        });
        if (end) {
          // Shown as it ends (a die thrown long ago lies on its value).
          player.current.goToAndStop(player.current.totalFrames - 1, true);
          return;
        }
        if (play && !lessMotion()) {
          player.current.play();
        }
      })
      .catch(() => {
        if (live) {
          setFailed(true);
          onReady?.(false);
        }
      });
    return () => {
      live = false;
      player.current?.destroy();
      player.current = null;
    };
  }, [src, attempt]);
  useEffect(() => {
    const anim = player.current;
    if (!anim) {
      return;
    }
    if (end) {
      return;
    }
    if (play && !lessMotion()) {
      anim.play();
    } else {
      anim.pause();
    }
  }, [play]);
  return failed
    ? null
    : el('span', {
        ref: box,
        className: className ?? 'lottie-sticker',
        'data-lottie': '',
        'aria-hidden': 'true',
      });
};
