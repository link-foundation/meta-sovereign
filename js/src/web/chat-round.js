// A received round video, "video note", as Telegram Desktop draws it
// (R-Y150; learned, never copied): a circle that plays muted and looped
// in place while it is on screen; a click plays it from the start with
// sound, a ring around it filling as it goes and the circle a little
// larger; a second click pauses, a third goes on. Its length shows in
// the corner while it is not playing.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { mediaSrc } from './media-src.js';
import { Poster, clockOf, sizeOf, useNearView, useUrl } from './chat-media.js';
import { Icon } from './icons.js';
import { useAutoLoad } from './auto-download.js';
import { Transcribable, useTranscribe } from './chat-transcribe.js';
import { PipButton, inPip, usePip } from './chat-pip.js';

const el = React.createElement;

// The ring's radius in a 100-wide box, and so its circumference.
const RING_R = 48;
export const RING_LENGTH = 2 * Math.PI * RING_R;

/** How far along a video is, 0..1 (0 while its length is unknown). */
export const roundProgress = (current, length) => {
  const total = Number(length);
  const at = Number(current);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(at)) {
    return 0;
  }
  return Math.min(1, Math.max(0, at / total));
};

/** The ring's dash for `progress` (0..1): `{ strokeDasharray }`. */
export const ringDash = (progress) => {
  const done = RING_LENGTH * Math.min(1, Math.max(0, Number(progress) || 0));
  return `${done.toFixed(2)} ${RING_LENGTH.toFixed(2)}`;
};

// What the circle does: idle (muted loop), playing (sound), paused.
export const nextMode = (mode) => (mode === 'playing' ? 'paused' : 'playing');

// The <video> follows the mode: muted and looped until a click, then
// from the start with sound; a pause keeps its place.
const useRoundVideo = ({ mode, visible, ready, onProgress, length }) => {
  const ref = useRef(null);
  const before = useRef('idle');
  useEffect(() => {
    const video = ref.current;
    if (!video) {
      return;
    }
    const was = before.current;
    before.current = mode;
    video.muted = mode !== 'playing';
    video.loop = mode === 'idle';
    if (mode === 'paused') {
      video.pause?.();
      return;
    }
    if (mode === 'playing' && was !== 'paused') {
      video.currentTime = 0;
    }
    if (mode === 'playing' || visible) {
      video.play?.()?.catch?.(() => {});
    } else if (!inPip(video)) {
      // A video in the small window goes on playing (R-Y182).
      video.pause?.();
    }
  }, [mode, visible, ready]);
  const onTime = () => {
    const video = ref.current;
    const known = Number.isFinite(video?.duration) ? video.duration : length;
    onProgress(roundProgress(video?.currentTime, known));
  };
  return { ref, onTime };
};

/** A round video message: a circle that plays with sound on a click. */
export const MediaRound = ({ media, api, chat, msgId }) => {
  const t = useT();
  const box = useRef(null);
  const { near, visible } = useNearView(box);
  const [mode, setMode] = useState('idle');
  const [progress, setProgress] = useState(0);
  const thumb = useUrl(
    api,
    'telegramMediaUrl',
    { chat, id: msgId, size: 'm' },
    near && media.hasThumb
  );
  // R-Y181: the video comes by itself when the settings allow it, else on
  // the first click, the circle showing a download button with its size.
  const load = useAutoLoad('voice', media.size);
  const file = useUrl(
    api,
    'telegramFileUrl',
    { chat, id: msgId },
    near && load.allowed
  );
  const { ref, onTime } = useRoundVideo({
    mode,
    visible,
    ready: Boolean(file),
    onProgress: setProgress,
    length: media.duration,
  });
  const pip = usePip(ref, Boolean(file));
  const toggle = () => {
    load.ask();
    setMode(nextMode);
  };
  const onEnd = () => {
    setMode('idle');
    setProgress(0);
  };
  // "→A" beside the circle, the text under it (R-Y175).
  const words = useTranscribe({ api, chat, msgId });
  const circle = el(
    'div',
    {
      key: 'circle',
      ref: box,
      className: `bubble-round${mode === 'playing' ? ' playing' : ''}`,
      'data-round': mode,
      'data-download': load.allowed ? undefined : 'manual',
      role: 'button',
      tabIndex: 0,
      'aria-label': t(
        mode === 'playing' ? 'chat.media.pause' : 'chat.media.play'
      ),
      onClick: toggle,
      onKeyDown: (e) => e.key === 'Enter' && toggle(),
    },
    [
      el(Poster, { key: 'poster', media, thumb }),
      file
        ? el('video', {
            key: 'v',
            ref,
            className: 'media-video',
            ...mediaSrc(file),
            muted: true,
            loop: true,
            playsInline: true,
            preload: 'auto',
            onTimeUpdate: onTime,
            onEnded: onEnd,
          })
        : null,
      load.allowed
        ? null
        : el('span', { key: 'get', className: 'media-play media-download' }, [
            el(Icon, { key: 'i', name: 'download', size: 22 }),
            media.size
              ? el(
                  'span',
                  { key: 's', className: 'media-size' },
                  sizeOf(media.size)
                )
              : null,
          ]),
      mode === 'idle'
        ? null
        : el(
            'svg',
            {
              key: 'ring',
              className: 'round-ring',
              viewBox: '0 0 100 100',
              'aria-hidden': 'true',
            },
            el('circle', {
              cx: 50,
              cy: 50,
              r: RING_R,
              transform: 'rotate(-90 50 50)',
              style: { strokeDasharray: ringDash(progress) },
            })
          ),
      mode === 'playing'
        ? null
        : el(
            'span',
            { key: 'badge', className: 'media-badge' },
            clockOf(media.duration)
          ),
      file ? el(PipButton, { key: 'pip', pip }) : null,
    ]
  );
  return el(Transcribable, { state: words, round: true }, circle);
};
