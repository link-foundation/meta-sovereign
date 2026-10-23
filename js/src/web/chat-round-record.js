// Recording a round video, as Telegram Desktop does (R-Y150; learned,
// never copied): beside the microphone, a switch changes it to a camera.
// The camera records a square crop of its picture (getUserMedia video
// and audio, MediaRecorder, a minute at most). Held, it records and a
// let-go over the message box sends; a short press (or the keyboard)
// records on, locked. While recording a round live preview shows over
// the chat with the time, a ring filling toward the minute, Cancel and
// Send. Cancelling (or Esc) drops it. A camera denied or missing says
// so and falls back to the voice mode.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { canAttach } from './chat-attach.js';
import { composerReplyId } from './forum-topics.js';
import { sendAsField } from './chat-send-as.js';
import { releasedInside } from './chat-voice.js';
import { ringDash } from './chat-round.js';

const el = React.createElement;

// Telegram's video notes: a minute at most; shorter than a second is a
// click, not a clip.
export const MAX_ROUND_MS = 60 * 1000;
export const MIN_ROUND_MS = 1000;
// The side of the recorded square, in pixels, and the frames a second.
export const ROUND_SIDE = 384;
const FPS = 30;
const TICK_MS = 100;
const HINT_MS = 3000;
const MODE_KEY = 'ms.recordMode';

// Best first: MP4 where the browser records it (Safari), else WebM.
const TYPES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** The first of `TYPES` that `supported(type)` accepts, else null. */
export const roundTypeOf = (supported) =>
  typeof supported === 'function'
    ? (TYPES.find((type) => supported(type)) ?? null)
    : TYPES[1];

const recorderType = () => {
  const Recorder = globalThis.MediaRecorder;
  return typeof Recorder === 'function'
    ? roundTypeOf(Recorder.isTypeSupported?.bind(Recorder))
    : null;
};

/** The file name a recording is uploaded under: by its container. */
export const roundFileName = (type) =>
  String(type ?? '').startsWith('video/mp4') ? 'round.mp4' : 'round.webm';

/** Whole seconds of a recording for Telegram: 1..60. */
export const roundSeconds = (ms) =>
  Math.min(60, Math.max(1, Math.round((Number(ms) || 0) / 1000)));

/** The time while recording: `0:07`. */
export const roundTimer = (ms) => {
  const s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The centred square of a `w` x `h` picture: `{ sx, sy, side }`. */
export const squareCrop = (w, h) => {
  const side = Math.max(0, Math.min(Number(w) || 0, Number(h) || 0));
  return {
    sx: Math.floor(((Number(w) || 0) - side) / 2),
    sy: Math.floor(((Number(h) || 0) - side) / 2),
    side,
  };
};

/** Can this chat take a round video, and can this browser record one. */
export const canRecordRound = (state, api) =>
  canAttach(state, api) &&
  typeof api?.telegramSendRound === 'function' &&
  typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function' &&
  typeof globalThis.HTMLCanvasElement?.prototype?.captureStream ===
    'function' &&
  recorderType() !== null;

// The remembered mode, 'voice' or 'round'; storage may be unavailable.
const savedMode = () => {
  try {
    return globalThis.localStorage?.getItem(MODE_KEY) === 'round'
      ? 'round'
      : 'voice';
  } catch {
    return 'voice';
  }
};
const saveMode = (mode) => {
  try {
    globalThis.localStorage?.setItem(MODE_KEY, mode);
  } catch {
    // Not remembered; fine.
  }
};

// The camera and microphone, its picture cropped to a square on a canvas
// that is both the preview and what is recorded: { canvas, recorder,
// type, stop }.
const openCamera = async () => {
  const stream = await globalThis.navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 640 },
      facingMode: 'user',
    },
    audio: true,
  });
  const source = globalThis.document.createElement('video');
  source.muted = true;
  source.playsInline = true;
  source.srcObject = stream;
  await source.play().catch(() => {});
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = ROUND_SIDE;
  canvas.height = ROUND_SIDE;
  const context = canvas.getContext('2d');
  const draw = () => {
    const { sx, sy, side } = squareCrop(source.videoWidth, source.videoHeight);
    if (side > 0) {
      context.drawImage(
        source,
        sx,
        sy,
        side,
        side,
        0,
        0,
        ROUND_SIDE,
        ROUND_SIDE
      );
    }
  };
  draw();
  const timer = globalThis.setInterval(draw, 1000 / FPS);
  const out = canvas.captureStream(FPS);
  for (const track of stream.getAudioTracks()) {
    out.addTrack(track);
  }
  const type = recorderType();
  const recorder = new globalThis.MediaRecorder(out, { mimeType: type });
  const stop = () => {
    globalThis.clearInterval(timer);
    for (const track of [...stream.getTracks(), ...out.getTracks()]) {
      track.stop();
    }
    source.srcObject = null;
  };
  return { canvas, recorder, type, stop };
};

// The recorder's data once it stops.
const finished = (recorder, chunks, type) =>
  new Promise((resolve) => {
    const done = () => resolve(new globalThis.Blob(chunks, { type }));
    recorder.addEventListener('stop', done, { once: true });
    if (recorder.state === 'inactive') {
      done();
    } else {
      recorder.stop();
    }
  });

// Up, then sent as a round video; the answer of whichever step failed.
const sendClip = async ({ api, chat, replyTo, blob, type, ms }) => {
  const file = new globalThis.File([blob], roundFileName(type), { type });
  const up = await api.telegramUpload(file);
  if (!up?.token) {
    return up ?? { error: 'upload failed' };
  }
  return api.telegramSendRound({
    chat,
    token: up.token,
    duration: roundSeconds(ms),
    size: ROUND_SIDE,
    ...(replyTo ? { replyTo } : {}),
    ...sendAsField(chat),
  });
};

// The clip to Telegram; a failure in the chat's notice.
const deliver = async ({ api, state, now, blob, ms }) => {
  const { composer } = state;
  const answer = await sendClip({
    api,
    chat: String(now.chat),
    replyTo: composerReplyId(composer),
    blob,
    type: now.cam.type,
    ms,
  }).catch((error) => ({ error: error.message }));
  if (answer?.ok) {
    composer?.clearReplyTo?.();
    return;
  }
  state.notify?.({
    kind: 'failed',
    code: answer?.code,
    error: answer?.error ?? 'not sent',
    retryAfter: answer?.retryAfter,
  });
};

// Time since `began` while recording, ticking.
const useElapsed = (recording, began) => {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => globalThis.clearInterval(timer);
  }, [recording]);
  return recording ? Math.max(0, now - began.current) : 0;
};

// The recording itself: `start(locked)`, `finish(send)`, its phase, time
// and the camera whose canvas is the preview.
const useClip = ({ state, api, say }) => {
  const [phase, setPhase] = useState('idle'); // held | locked | sending
  const [cam, setCam] = useState(null);
  const session = useRef(null);
  const began = useRef(0);
  const elapsed = useElapsed(phase === 'held' || phase === 'locked', began);

  const finish = async (send) => {
    const now = session.current;
    session.current = null;
    if (!now) {
      return;
    }
    now.done = true;
    const ms = Date.now() - now.began;
    const blob = now.cam
      ? await finished(now.cam.recorder, now.chunks, now.cam.type)
      : null;
    now.cam?.stop();
    setCam(null);
    if (!send || !blob || ms < MIN_ROUND_MS) {
      setPhase('idle');
      return;
    }
    setPhase('sending');
    await deliver({ api, state, now, blob, ms });
    setPhase('idle');
  };

  const start = async (locked) => {
    if (session.current || phase === 'sending') {
      return;
    }
    const now = { chat: state.current?.chat, chunks: [] };
    session.current = now;
    began.current = Date.now();
    now.began = began.current;
    setPhase(locked ? 'locked' : 'held');
    try {
      now.cam = await openCamera();
    } catch {
      session.current = null;
      setPhase('idle');
      say('denied');
      return;
    }
    if (now.done) {
      now.cam.stop();
      return;
    }
    now.cam.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size > 0) {
        now.chunks.push(event.data);
      }
    });
    now.cam.recorder.start(250);
    began.current = Date.now();
    now.began = began.current;
    setCam(now.cam);
  };

  return { phase, setPhase, elapsed, cam, start, finish };
};

// The press on the camera button: down records; up sends when it was
// held (over the box), else the recording stays on, locked; a click from
// the keyboard starts it locked; a click on a locked one sends.
const usePress = (clip) => {
  const press = useRef(null);
  const onPointerDown = (event) => {
    if (event.button !== 0 || clip.phase !== 'idle') {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    press.current = { at: Date.now() };
    clip.start(false);
  };
  const onPointerUp = (event) => {
    const now = press.current;
    if (!now) {
      return;
    }
    // The click this release makes is not a Send.
    const released = { released: true };
    press.current = released;
    globalThis.setTimeout(() => {
      if (press.current === released) {
        press.current = null;
      }
    }, 100);
    if (Date.now() - now.at < MIN_ROUND_MS) {
      clip.setPhase((p) => (p === 'held' ? 'locked' : p));
    } else {
      clip.finish(releasedInside(event.clientX, event.clientY));
    }
  };
  const onClick = (event) => {
    if (press.current?.released) {
      press.current = null;
    } else if (clip.phase === 'locked') {
      clip.finish(true);
    } else if (clip.phase === 'idle' && event.detail === 0) {
      clip.start(true);
    }
  };
  return { handlers: { onPointerDown, onPointerUp }, onClick };
};

// The mode, its remembered value and the message shown on a refusal.
const useMode = () => {
  const [mode, setModeState] = useState(savedMode);
  const [hint, setHint] = useState(null);
  const setMode = (next) => {
    setModeState(next);
    saveMode(next);
  };
  const say = (key) => {
    setHint(key);
    globalThis.setTimeout(() => setHint(null), HINT_MS);
  };
  return { mode, setMode, hint, say };
};

/**
 * The round video's state: `{ enabled, active, recording, switcher,
 * button, overlay }` — `active`: the camera is the mode (its `button`
 * takes the microphone's place); `switcher` is the mode's switch and
 * message; `overlay` the live preview.
 */
export const useRoundVideo = ({ state, api }) => {
  const enabled = canRecordRound(state, api);
  const { mode, setMode, hint, say } = useMode();
  const clip = useClip({
    state,
    api,
    say: (why) => {
      setMode('voice');
      say(`chat.round.${why}`);
    },
  });
  const press = usePress(clip);
  const recording = clip.phase === 'held' || clip.phase === 'locked';

  useEffect(() => {
    if (clip.elapsed >= MAX_ROUND_MS) {
      clip.finish(true);
    }
  }, [clip.elapsed >= MAX_ROUND_MS]);
  useEffect(() => () => clip.finish(false), [state.current?.key]);
  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clip.finish(false);
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [recording]);

  const active = enabled && mode === 'round';
  return {
    enabled,
    active,
    recording,
    phase: clip.phase,
    switcher: enabled
      ? el(Switcher, {
          key: 'round-switch',
          mode: active ? 'round' : 'voice',
          hint,
          onToggle: () => setMode(active ? 'voice' : 'round'),
        })
      : null,
    button: el(CameraButton, {
      key: 'round',
      phase: clip.phase,
      handlers: press.handlers,
      onClick: press.onClick,
    }),
    overlay: recording
      ? el(Preview, {
          key: 'round-preview',
          clip,
          onCancel: () => clip.finish(false),
          onSend: () => clip.finish(true),
        })
      : null,
  };
};

// The switch between microphone and camera, and why it switched back.
const Switcher = ({ mode, hint, onToggle }) => {
  const t = useT();
  const label = t(
    mode === 'round' ? 'chat.round.toVoice' : 'chat.round.toVideo'
  );
  return el('span', { className: 'voice-holder round-switch-holder' }, [
    hint
      ? el(
          'span',
          { key: 'hint', className: 'voice-hint', role: 'status' },
          t(hint)
        )
      : null,
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'round-switch',
        'data-action': 'round-switch',
        'data-mode': mode,
        'aria-label': label,
        title: label,
        onClick: onToggle,
      },
      el(Icon, { name: mode === 'round' ? 'mic' : 'camera', size: 18 })
    ),
  ]);
};

// The camera in the microphone's place; a Send while locked.
const CameraButton = ({ phase, handlers, onClick }) => {
  const t = useT();
  const locked = phase === 'locked';
  const label = t(locked ? 'chat.round.send' : 'chat.round.record');
  return el(
    'button',
    {
      type: 'button',
      className: `primary send voice-button${phase === 'held' || locked ? ' recording' : ''}`,
      'data-action': locked ? 'round-send-button' : 'round',
      'aria-label': label,
      title: label,
      'aria-busy': phase === 'sending' ? 'true' : undefined,
      disabled: phase === 'sending',
      onClick,
      ...handlers,
    },
    el(Icon, { name: locked ? 'send' : 'camera', size: 18 })
  );
};

// The live picture in a circle over the chat, the time, a ring toward
// the minute, and Cancel and Send.
const Preview = ({ clip, onCancel, onSend }) => {
  const t = useT();
  const holder = useRef(null);
  const { cam } = clip;
  useEffect(() => {
    const node = holder.current;
    if (!node || !cam?.canvas) {
      return undefined;
    }
    node.appendChild(cam.canvas);
    return () => cam.canvas.remove();
  }, [cam]);
  const dialog = el(
    'div',
    {
      className: 'round-record',
      role: 'dialog',
      'aria-label': t('chat.round.recording'),
      'data-round-record': clip.phase,
    },
    [
      el('div', { key: 'circle', className: 'round-record-circle' }, [
        el('span', { key: 'live', ref: holder, className: 'round-live' }),
        el(
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
            r: 48,
            transform: 'rotate(-90 50 50)',
            style: {
              strokeDasharray: ringDash(clip.elapsed / MAX_ROUND_MS),
            },
          })
        ),
      ]),
      el('div', { key: 'bar', className: 'round-record-bar' }, [
        el('span', {
          key: 'dot',
          className: 'voice-dot',
          'aria-hidden': 'true',
        }),
        el(
          'span',
          { key: 'time', className: 'round-time', role: 'timer' },
          roundTimer(clip.elapsed)
        ),
        el(
          'button',
          {
            key: 'cancel',
            type: 'button',
            className: 'voice-cancel',
            'data-action': 'round-cancel',
            onClick: onCancel,
          },
          t('common.cancel')
        ),
        el(
          'button',
          {
            key: 'send',
            type: 'button',
            className: 'primary round-send',
            'data-action': 'round-send',
            disabled: clip.phase !== 'locked',
            onClick: onSend,
          },
          t('common.send')
        ),
      ]),
    ]
  );
  const host = globalThis.document?.body;
  return host ? createPortal(dialog, host) : dialog;
};
