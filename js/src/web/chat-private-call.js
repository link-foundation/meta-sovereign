// Private one-to-one voice calls in the page, as Telegram Desktop's call
// window has them (R-Y196; learned, never copied): "Call" in a private
// chat's header; an incoming call as a notification with Accept / Decline;
// a call window that says Calling… / Ringing… / Connecting…, then the
// running time, the emoji of the key and Mute / End; and a rating after a
// call. Everything follows the live link `phonecall:telegram`; every write
// is one click. The microphone is asked on Accept or Call only. The call
// has no sound in a browser yet, and the window says so.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { SOUND_KEY, playNotifySound } from './notify-sound.js';
import { readPref } from './chat-notify.js';
import {
  canCall,
  elapsedSeconds,
  endedText,
  failureKey,
  isLive,
  ringsOut,
  shownCall,
  statusKey,
  timerText,
} from './private-call-model.js';
import { formatCallDuration } from './call-model.js';

const el = React.createElement;

const RING_EVERY_MS = 3000;

const askMicrophone = async () => {
  try {
    return await globalThis.navigator.mediaDevices.getUserMedia({
      audio: true,
    });
  } catch {
    return null;
  }
};

const stop = (stream) =>
  stream?.getTracks?.().forEach((track) => track.stop?.());

/**
 * The state behind the call window: the call to show (from the page's
 * live link), what went wrong when it was placed, Mute, and the actions
 * (each answers one click).
 */
export const usePrivateCall = (api, link, nameOf = () => null) => {
  const [dismissed, setDismissed] = useState(() => new Set());
  const [failed, setFailed] = useState(null);
  const [muted, setMuted] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const mic = useRef(null);
  const call = shownCall(link, { dismissed });
  const latest = useRef(call);
  latest.current = call;

  const release = () => {
    stop(mic.current);
    mic.current = null;
    setMuted(false);
  };
  const listen = async () => {
    stop(mic.current);
    mic.current = await askMicrophone();
    setMicBlocked(!mic.current);
  };
  const answered = (done) => {
    if (!done?.ok) {
      release();
      setFailed(done?.code ?? 'failed');
    }
  };
  const discard = (reason) => {
    const now = latest.current;
    release();
    return now?.callId
      ? api
          .telegramPrivateCallDiscard({ id: now.callId, reason })
          .catch(() => {})
      : Promise.resolve();
  };

  useEffect(() => {
    if (!isLive(call)) {
      release();
    }
  }, [call?.ref, call?.phase]);
  useEffect(() => release, []);
  // An unanswered call ends by itself after Telegram's ring timeout.
  const rings = ringsOut(call);
  useEffect(() => {
    if (!rings) {
      return undefined;
    }
    const timer = globalThis.setTimeout(
      () => discard('missed'),
      latest.current.ringMs
    );
    return () => globalThis.clearTimeout(timer);
  }, [rings, call?.ref]);

  return {
    call: call && { ...call, name: call.name || nameOf(call.user) || '' },
    failed,
    muted,
    micBlocked,
    clearFailure: () => setFailed(null),
    // Call: the microphone is asked now, then the call is placed.
    start: async (user, name) => {
      setFailed(null);
      await listen();
      answered(
        await api.telegramPrivateCallStart({ user, name }).catch(() => null)
      );
    },
    accept: async () => {
      await listen();
      answered(
        await api
          .telegramPrivateCallAccept({ id: latest.current.callId })
          .catch(() => null)
      );
    },
    decline: () => discard('hangup'),
    end: () => discard('hangup'),
    toggleMute: () => {
      const next = !muted;
      mic.current
        ?.getAudioTracks?.()
        .forEach((track) => Object.assign(track, { enabled: !next }));
      setMuted(next);
    },
    rate: (rating, comment) =>
      api
        .telegramPrivateCallRate({
          id: latest.current.callId,
          rating,
          ...(comment ? { comment } : {}),
        })
        .catch(() => {}),
    close: () => {
      const ref = latest.current?.ref;
      setDismissed((before) => new Set([...before, ref]));
    },
  };
};

/** "Call" in a private chat's header. */
export const CallButton = ({ state, call }) => {
  const t = useT();
  const chat = state.current;
  if (!canCall(chat, state.info, call.call)) {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-call icon-btn',
      'data-action': 'call-start',
      'aria-label': t('chat.call.start'),
      title: t('chat.call.start'),
      onClick: () => call.start(String(chat.chat), chat.name),
    },
    el(Icon, { name: 'phone' })
  );
};

// The running time, ticking only while the call is on.
const Clock = ({ call }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, []);
  return el(
    'span',
    { className: 'private-call-clock', 'data-call-clock': 'true' },
    timerText(elapsedSeconds(call, now))
  );
};

const Emoji = ({ call, t }) =>
  el('div', { className: 'private-call-key' }, [
    el(
      'div',
      { key: 'e', className: 'private-call-emoji', 'data-call-emoji': 'true' },
      call.emoji.map((emoji, i) => el('span', { key: i }, emoji))
    ),
    el('small', { key: 'h' }, t('chat.call.emojiHint')),
  ]);

const Button = ({ action, label, icon, onClick, kind = '', pressed }) =>
  el(
    'button',
    {
      type: 'button',
      className: `private-call-btn ${kind}`.trim(),
      'data-action': action,
      'aria-label': label,
      ...(pressed === undefined ? {} : { 'aria-pressed': pressed }),
      onClick,
    },
    [
      el(Icon, { key: 'i', name: icon, size: 20 }),
      el('span', { key: 't' }, label),
    ]
  );

const Stars = ({ t, value, pick }) =>
  el(
    'div',
    { className: 'private-call-stars', role: 'radiogroup' },
    [1, 2, 3, 4, 5].map((n) =>
      el(
        'button',
        {
          key: n,
          type: 'button',
          role: 'radio',
          'aria-checked': value === n,
          className: n <= value ? 'private-call-star on' : 'private-call-star',
          'data-rating': n,
          'aria-label': t('chat.call.rate.star', { count: n }),
          onClick: () => pick(n),
        },
        '★'
      )
    )
  );

// After a call Telegram may ask for a rating: stars, a comment for a poor
// one, Send or Skip. All optional.
const Rating = ({ state, t }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  return el(
    'div',
    { className: 'private-call-rate', 'data-call-rate': 'true' },
    [
      el('strong', { key: 't' }, t('chat.call.rate.title')),
      el(Stars, { key: 's', t, value: rating, pick: setRating }),
      rating > 0 && rating <= 3
        ? el('textarea', {
            key: 'c',
            'data-field': 'call-rate-comment',
            maxLength: 400,
            placeholder: t('chat.call.rate.comment'),
            value: comment,
            onChange: (e) => setComment(e.target.value),
          })
        : null,
      el('div', { key: 'b', className: 'private-call-row' }, [
        el(
          'button',
          {
            key: 's',
            type: 'button',
            className: 'private-call-btn',
            'data-action': 'call-rate-send',
            disabled: rating === 0,
            onClick: async () => {
              await state.rate(rating, comment.trim());
              state.close();
            },
          },
          t('chat.call.rate.send')
        ),
        el(
          'button',
          {
            key: 'k',
            type: 'button',
            className: 'private-call-btn',
            'data-action': 'call-rate-skip',
            onClick: state.close,
          },
          t('chat.call.rate.skip')
        ),
      ]),
    ]
  );
};

const Status = ({ call, t }) => {
  if (call.phase === 'active') {
    return el(Clock, { call });
  }
  if (call.phase !== 'ended') {
    return el('span', { className: 'private-call-status' }, t(statusKey(call)));
  }
  const spent = formatCallDuration(call.duration);
  return el('span', { className: 'private-call-status' }, [
    t(endedText(call)),
    spent ? ` · ${t('chat.call.duration', { time: spent })}` : '',
  ]);
};

const Actions = ({ call, state, t }) => {
  if (call.phase === 'incoming') {
    return [
      el(Button, {
        key: 'a',
        action: 'call-accept',
        label: t('chat.call.accept'),
        icon: 'phone',
        kind: 'accept',
        onClick: state.accept,
      }),
      el(Button, {
        key: 'd',
        action: 'call-decline',
        label: t('chat.call.decline'),
        icon: 'phone',
        kind: 'end',
        onClick: state.decline,
      }),
    ];
  }
  if (call.phase === 'ended') {
    return call.needRating
      ? el(Rating, { key: 'r', state, t })
      : el(Button, {
          key: 'x',
          action: 'call-close',
          label: t('chat.call.close'),
          icon: 'close',
          onClick: state.close,
        });
  }
  return [
    el(Button, {
      key: 'm',
      action: 'call-mute',
      label: t(state.muted ? 'chat.call.unmute' : 'chat.call.mute'),
      icon: state.muted ? 'mute' : 'mic',
      pressed: state.muted,
      onClick: state.toggleMute,
    }),
    el(Button, {
      key: 'e',
      action: 'call-end',
      label: t('chat.call.end'),
      icon: 'phone',
      kind: 'end',
      onClick: state.end,
    }),
  ];
};

const Window = ({ api, state, t }) => {
  const { call } = state;
  return el(
    'div',
    {
      className: `private-call-window phase-${call.phase}`,
      role: 'dialog',
      'aria-label': t('chat.call.start'),
      'data-private-call': call.phase,
      'data-call-direction': call.out ? 'out' : 'in',
    },
    [
      el(PeerAvatar, {
        key: 'a',
        api,
        source: 'telegram',
        peer: call.user,
        name: call.name,
        className: 'avatar private-call-avatar',
      }),
      el(
        'strong',
        { key: 'n', className: 'private-call-name' },
        call.name || call.user
      ),
      el(Status, { key: 's', call, t }),
      call.phase === 'active' && call.emoji.length > 0
        ? el(Emoji, { key: 'e', call, t })
        : null,
      call.phase === 'active' && !call.media
        ? el(
            'small',
            {
              key: 'm',
              className: 'private-call-media',
              'data-call-media-note': 'true',
            },
            t('chat.call.media')
          )
        : null,
      state.micBlocked && isLive(call)
        ? el(
            'small',
            { key: 'b', 'data-call-mic-blocked': 'true' },
            t('chat.call.micBlocked')
          )
        : null,
      el(
        'div',
        { key: 'x', className: 'private-call-row' },
        el(Actions, { call, state, t })
      ),
    ]
  );
};

const Failure = ({ state, t }) =>
  el(
    'div',
    {
      className: 'private-call-window phase-error',
      role: 'alert',
      'data-call-error': state.failed,
    },
    [
      el('span', { key: 't' }, t(failureKey(state.failed))),
      el(Button, {
        key: 'x',
        action: 'call-error-close',
        label: t('chat.call.close'),
        icon: 'close',
        onClick: state.clearFailure,
      }),
    ]
  );

// The incoming call rings with the notification chime (R-Y181) while it
// waits; a browser that wants a click first just stays silent.
const useRinging = (api, on) => {
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const ring = () => {
      if (readPref(SOUND_KEY, true)) {
        playNotifySound(api, 'default').catch(() => {});
      }
    };
    ring();
    const timer = globalThis.setInterval(ring, RING_EVERY_MS);
    return () => globalThis.clearInterval(timer);
  }, [api, on]);
};

/** The call window, over everything (a portal to the body). */
export const PrivateCallHost = ({ api, state }) => {
  const t = useT();
  useRinging(api, state.call?.phase === 'incoming');
  const body = globalThis.document?.body;
  if (!body || (!state.call && !state.failed)) {
    return null;
  }
  const shown = state.call
    ? el(Window, { api, state, t })
    : el(Failure, { state, t });
  return createPortal(shown, body);
};
