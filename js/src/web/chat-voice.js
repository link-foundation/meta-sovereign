// Voice messages, as Telegram Desktop records them (R-Y108; learned,
// never copied): with nothing typed, a microphone takes the Send
// button's place. Held down, it records: the message box gives way to a
// red dot, the time so far and "Release outside this field to cancel";
// let go over the box, the voice is sent; let go outside it, it is
// dropped. Dragged up while held, recording locks: the hand can go, a
// Send button sends, a Cancel drops it (and so does Esc). Too short a
// press records nothing and says to hold it. The microphone through
// MediaRecorder (Opus, in WebM or Ogg); WebM is remuxed to Ogg Opus as
// Telegram keeps voices (./voice-ogg.js); the loudness while recording
// gives the waveform the chat shows, 100 values 0..31.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { canAttach } from './chat-attach.js';
import { voiceDuration, webmToOgg } from './voice-ogg.js';

const el = React.createElement;

// Shorter than this, nothing is sent ("hold to record").
export const MIN_VOICE_MS = 1000;
// Telegram's voice notes: an hour at most.
export const MAX_VOICE_MS = 3600 * 1000;
// How far up the held microphone goes to lock — straight up, toward the
// lock above it; moved far aside, it is on its way out of the box.
export const LOCK_DISTANCE = 60;
const LOCK_ASIDE = 80;
export const WAVEFORM_SIZE = 100;
const SAMPLE_MS = 50;
const HINT_MS = 2500;

// What the browser records Opus in: Ogg as is (Firefox), else WebM.
const TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'];

const recorderType = () => {
  const Recorder = globalThis.MediaRecorder;
  if (typeof Recorder !== 'function') {
    return null;
  }
  if (typeof Recorder.isTypeSupported !== 'function') {
    return TYPES[1];
  }
  return TYPES.find((type) => Recorder.isTypeSupported(type)) ?? null;
};

/** Can this chat take a voice, and can this browser record one. */
export const canRecord = (state, api) =>
  canAttach(state, api) &&
  typeof api?.telegramSendVoice === 'function' &&
  typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function' &&
  recorderType() !== null;

/** The loudness of a stretch of samples (bytes about 128): 0..1. */
export const levelOf = (samples) => {
  let peak = 0;
  for (const sample of samples ?? []) {
    peak = Math.max(peak, Math.abs(sample - 128));
  }
  return Math.min(1, peak / 128);
};

/**
 * The waveform Telegram shows: the loudness heard, in `size` stretches
 * (each its loudest), the loudest of all 31.
 */
export const waveformOf = (levels, size = WAVEFORM_SIZE) => {
  const list = Array.isArray(levels) ? levels : [];
  if (list.length === 0) {
    return [];
  }
  const buckets = Array.from({ length: size }, (_, i) => {
    const from = Math.floor((i * list.length) / size);
    const to = Math.max(from + 1, Math.floor(((i + 1) * list.length) / size));
    return Math.max(...list.slice(from, Math.min(to, list.length)));
  });
  const top = Math.max(...buckets);
  return buckets.map((v) => (top > 0 ? Math.round((v / top) * 31) : 0));
};

/** The time recorded as Desktop shows it: 0:03,45. */
export const recordedText = (ms) => {
  const total = Math.max(0, Math.floor(ms / 10));
  const hundredths = total % 100;
  const seconds = Math.floor(total / 100);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')},${String(hundredths).padStart(2, '0')}`;
};

/** Whether a press let go at (x, y) was over the message box. */
export const releasedInside = (x, y) =>
  Boolean(
    globalThis.document?.elementFromPoint?.(x, y)?.closest?.('.chat-composer')
  );

// The recording as Telegram takes it: Ogg Opus bytes.
const oggOf = async (blob, type) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return type.startsWith('audio/ogg') ? bytes : webmToOgg(bytes);
};

// The microphone, its loudness sampled: { recorder, stop() }.
const openMicrophone = async (onLevel) => {
  const stream = await globalThis.navigator.mediaDevices.getUserMedia({
    audio: true,
  });
  const type = recorderType();
  const recorder = new globalThis.MediaRecorder(stream, { mimeType: type });
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  let context = null;
  let timer = null;
  if (typeof Context === 'function') {
    context = new Context();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    timer = globalThis.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      onLevel(levelOf(samples));
    }, SAMPLE_MS);
  }
  const stop = () => {
    globalThis.clearInterval(timer);
    context?.close?.().catch?.(() => {});
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };
  return { recorder, type, stop };
};

// The recorder's data once it stops.
const finished = (recorder, chunks, type) =>
  new Promise((resolve) => {
    recorder.addEventListener(
      'stop',
      () => resolve(new globalThis.Blob(chunks, { type })),
      { once: true }
    );
    if (recorder.state === 'inactive') {
      resolve(new globalThis.Blob(chunks, { type }));
    } else {
      recorder.stop();
    }
  });

// Up, then sent as a voice; the answer of whichever step failed.
const sendRecording = async ({ api, chat, replyTo, blob, type, levels }) => {
  const ogg = await oggOf(blob, type);
  const file = new globalThis.File([ogg], 'voice.ogg', { type: 'audio/ogg' });
  const up = await api.telegramUpload(file);
  if (!up?.token) {
    return up ?? { error: 'upload failed' };
  }
  return api.telegramSendVoice({
    chat,
    token: up.token,
    duration: Math.max(1, Math.round(voiceDuration(ogg))),
    waveform: waveformOf(levels),
    ...(replyTo ? { replyTo } : {}),
  });
};

// The ticking time and loudness while recording.
const useTicker = (phase, began) => {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (phase !== 'held' && phase !== 'locked') {
      return undefined;
    }
    const timer = globalThis.setInterval(() => setNow(Date.now()), SAMPLE_MS);
    return () => globalThis.clearInterval(timer);
  }, [phase]);
  return phase === 'held' || phase === 'locked'
    ? Math.max(0, now - began.current)
    : 0;
};

// The voice to Telegram; a failure in the chat's notice.
const deliver = async ({ api, state, now, blob }) => {
  const { composer } = state;
  const answer = await sendRecording({
    api,
    chat: String(now.chat),
    replyTo: composer?.replyTo?.msgId ?? null,
    blob,
    type: now.mic.type,
    levels: now.levels,
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

// The recording itself: `start(locked)`, `finish(send)`, its phase,
// loudness, time and the hint shown under the microphone.
const useRecording = ({ state, api }) => {
  const [phase, setPhase] = useState('idle'); // held | locked | sending
  const [hint, setHint] = useState(null);
  const [level, setLevel] = useState(0);
  const session = useRef(null);
  const began = useRef(0);
  const elapsed = useTicker(phase, began);

  const say = (key) => {
    setHint(key);
    globalThis.setTimeout(() => setHint(null), HINT_MS);
  };

  // Stops the microphone; sends what it heard when `send` (and when it
  // is long enough to be a voice).
  const finish = async (send) => {
    const now = session.current;
    session.current = null;
    if (!now) {
      return;
    }
    now.done = true;
    const blob = now.mic
      ? await finished(now.mic.recorder, now.chunks, now.mic.type)
      : null;
    now.mic?.stop();
    const long = blob && Date.now() - now.began >= MIN_VOICE_MS;
    if (!send || !long) {
      setPhase('idle');
      if (send) {
        say('chat.voice.hold');
      }
      return;
    }
    setPhase('sending');
    await deliver({ api, state, now, blob });
    setPhase('idle');
  };

  const listen = (now) => {
    now.mic.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size > 0) {
        now.chunks.push(event.data);
      }
    });
    now.mic.recorder.start(250);
    began.current = Date.now();
    now.began = began.current;
  };

  const start = async (locked) => {
    if (session.current || phase === 'sending') {
      return;
    }
    const now = { chat: state.current?.chat, chunks: [], levels: [] };
    session.current = now;
    began.current = Date.now();
    now.began = began.current;
    setPhase(locked ? 'locked' : 'held');
    try {
      now.mic = await openMicrophone((v) => {
        now.levels.push(v);
        setLevel(v);
      });
    } catch {
      session.current = null;
      setPhase('idle');
      say('chat.voice.denied');
      return;
    }
    if (now.done) {
      // Let go before the microphone opened.
      now.mic.stop();
      return;
    }
    listen(now);
  };

  return { phase, setPhase, hint, level, elapsed, start, finish };
};

// The press: down records, up sends (over the box) or drops; dragged up
// the screen, it locks.
const usePress = (rec) => {
  const press = useRef(null);
  const onPointerDown = (event) => {
    if (event.button !== 0 || rec.phase !== 'idle') {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY };
    rec.start(false);
  };
  const onPointerMove = (event) => {
    const now = press.current;
    const up =
      now &&
      now.y - event.clientY > LOCK_DISTANCE &&
      Math.abs(event.clientX - now.x) < LOCK_ASIDE;
    if (up && !now.locked) {
      now.locked = true;
      rec.setPhase((p) => (p === 'held' ? 'locked' : p));
    }
  };
  const onPointerUp = (event) => {
    const now = press.current;
    if (!now) {
      return;
    }
    // Locked: the hand goes, the recording goes on; the click this
    // release makes is not a Send.
    if (now.locked) {
      now.release = true;
      return;
    }
    press.current = null;
    rec.finish(releasedInside(event.clientX, event.clientY));
  };
  // From the keyboard: recording starts locked; then Send sends it.
  const onClick = (event) => {
    if (press.current?.release) {
      press.current = null;
    } else if (rec.phase === 'locked') {
      rec.finish(true);
    } else if (rec.phase === 'idle' && event.detail === 0) {
      rec.start(true);
    }
  };
  const drop = () => {
    press.current = null;
    rec.finish(false);
  };
  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp },
    onClick,
    drop,
  };
};

/**
 * The microphone's state: `{ enabled, recording, phase, button, bar,
 * hint }` — `button` takes Send's place, `bar` the message box's.
 */
export const useVoice = ({ state, api }) => {
  const enabled = canRecord(state, api);
  const rec = useRecording({ state, api });
  const { phase, hint, level, elapsed } = rec;
  const press = usePress(rec);

  // A long recording stops at Telegram's hour; another chat drops it.
  useEffect(() => {
    if (elapsed >= MAX_VOICE_MS) {
      rec.finish(true);
    }
  }, [elapsed >= MAX_VOICE_MS]);
  useEffect(() => () => press.drop(), [state.current?.key]);

  // Esc drops a recording.
  const recording = phase === 'held' || phase === 'locked';
  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        press.drop();
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [recording]);

  return {
    enabled,
    recording,
    phase,
    hint,
    button: el(VoiceButton, {
      key: 'voice',
      phase,
      level,
      hint,
      handlers: press.handlers,
      onClick: press.onClick,
    }),
    bar: recording
      ? el(VoiceBar, {
          key: 'voice-bar',
          phase,
          elapsed,
          onCancel: press.drop,
        })
      : null,
  };
};

// The microphone, or while locked a Send; the lock above it while held.
const VoiceButton = ({ phase, level, hint, handlers, onClick }) => {
  const t = useT();
  const locked = phase === 'locked';
  const held = phase === 'held';
  return el('span', { className: 'voice-holder' }, [
    held
      ? el(
          'span',
          { key: 'lock', className: 'voice-lock', 'aria-hidden': 'true' },
          [
            el(Icon, { key: 'l', name: 'lock', size: 14 }),
            el(Icon, { key: 'c', name: 'chevron-up', size: 14 }),
          ]
        )
      : null,
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
        className: `primary send voice-button${held || locked ? ' recording' : ''}`,
        'data-action': locked ? 'voice-send' : 'voice',
        'aria-label': t(locked ? 'chat.voice.send' : 'chat.voice.record'),
        title: t(locked ? 'chat.voice.send' : 'chat.voice.record'),
        'aria-busy': phase === 'sending' ? 'true' : undefined,
        disabled: phase === 'sending',
        style: held ? { '--voice-level': String(level) } : undefined,
        onClick,
        ...handlers,
      },
      el(Icon, { name: locked ? 'send' : 'mic', size: 18 })
    ),
  ]);
};

// In the message box's place: the dot, the time, how to cancel.
const VoiceBar = ({ phase, elapsed, onCancel }) => {
  const t = useT();
  return el('div', { className: 'voice-bar', 'data-voice': phase }, [
    el('span', { key: 'dot', className: 'voice-dot', 'aria-hidden': 'true' }),
    el(
      'span',
      { key: 'time', className: 'voice-time', role: 'timer' },
      recordedText(elapsed)
    ),
    phase === 'locked'
      ? el(
          'button',
          {
            key: 'cancel',
            type: 'button',
            className: 'voice-cancel',
            'data-action': 'voice-cancel',
            onClick: onCancel,
          },
          t('common.cancel')
        )
      : el(
          'span',
          { key: 'how', className: 'voice-how' },
          t('chat.voice.release')
        ),
  ]);
};
