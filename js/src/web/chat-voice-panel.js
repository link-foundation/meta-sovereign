// The voice chat panel, as Telegram Desktop's: the call's title, who is in
// it (names, about lines, speaking / muted / raised hand / video marks),
// and — only on a click — Join (as yourself or a peer the call allows),
// the microphone, Raise hand and Leave (R-Y188; learned, never copied).

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { PeerAvatar } from './peer-avatar.js';
import {
  isScheduled,
  kindKey,
  marksOf,
  mayUnmute,
  sortedParticipants,
} from './voice-chat-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.voice.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.voice.err.failed') : text;
};

const Row = ({ api, p, nowMs, selfSpeaking, t }) => {
  const marks = marksOf(p, nowMs);
  const shown =
    p.self && selfSpeaking && !marks.includes('speaking')
      ? ['speaking', ...marks]
      : marks;
  return el(
    'li',
    {
      className: 'voice-row',
      'data-participant': p.id,
      'data-speaking': shown.includes('speaking') ? 'true' : 'false',
    },
    [
      el(PeerAvatar, {
        key: 'a',
        api,
        source: 'telegram',
        peer: p.id,
        name: p.name,
        className: 'avatar voice-avatar',
      }),
      el('span', { key: 't', className: 'voice-who' }, [
        el(
          'strong',
          { key: 'n' },
          p.self ? `${p.name} (${t('chat.voice.you')})` : p.name
        ),
        p.about
          ? el('span', { key: 'a', className: 'voice-about' }, p.about)
          : null,
      ]),
      el(
        'span',
        { key: 'm', className: 'voice-marks' },
        shown.map((mark) =>
          el(
            'span',
            {
              key: mark,
              className: `voice-mark voice-mark-${mark}`,
              'data-mark': mark,
            },
            t(`chat.voice.mark.${mark}`)
          )
        )
      ),
    ]
  );
};

export const Notify = ({ api, call, onChange }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const subscribed = Boolean(call.subscribed);
  const toggle = async () => {
    setBusy(true);
    const done = await api
      .telegramCallNotify({
        id: call.id,
        accessHash: call.accessHash,
        subscribed: !subscribed,
      })
      .catch(() => null);
    setBusy(false);
    if (done?.ok) {
      onChange(!subscribed);
    }
  };
  return el(
    'button',
    {
      type: 'button',
      className: 'voice-pill',
      'data-action': 'voice-notify',
      disabled: busy,
      onClick: toggle,
    },
    t(subscribed ? 'chat.voice.unnotify' : 'chat.voice.notify')
  );
};

// Who we join as: the account, or a peer the call allows.
const useJoinAs = (api, chat, call, on) => {
  const [peers, setPeers] = useState([]);
  const [choice, setChoice] = useState('');
  useEffect(() => {
    if (!on || typeof api?.telegramCallJoinAs !== 'function') {
      return undefined;
    }
    let current = true;
    api
      .telegramCallJoinAs({ chat: String(chat.chat) })
      .then((a) => {
        if (current && a?.ok) {
          setPeers(a.peers);
          setChoice(call.defaultJoinAs ?? a.peers[0]?.id ?? '');
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [on, chat?.chat]);
  return { peers, choice, setChoice };
};

const JoinAs = ({ as, t }) =>
  as.peers.length > 1
    ? el('label', { className: 'voice-join-as' }, [
        t('chat.voice.joinAs'),
        el(
          'select',
          {
            key: 's',
            'data-field': 'voice-join-as',
            value: as.choice,
            onChange: (e) => as.setChoice(e.target.value),
          },
          as.peers.map((p) => el('option', { key: p.id, value: p.id }, p.name))
        ),
      ])
    : null;

const Controls = ({ call, voice, me, as, t }) => {
  const { state } = voice;
  if (call.live) {
    return el('p', { className: 'voice-note' }, t('chat.voice.liveNote'));
  }
  if (state.phase === 'joined') {
    return el('div', { className: 'voice-controls' }, [
      mayUnmute(me, call)
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              className: 'voice-pill',
              'data-action': 'voice-mic',
              'aria-pressed': state.mic,
              onClick: voice.toggleMic,
            },
            t(state.mic ? 'chat.voice.mute' : 'chat.voice.unmute')
          )
        : el(
            'button',
            {
              key: 'h',
              type: 'button',
              className: 'voice-pill',
              'data-action': 'voice-hand',
              'aria-pressed': state.hand,
              onClick: voice.toggleHand,
            },
            t(state.hand ? 'chat.voice.lowerHand' : 'chat.voice.raiseHand')
          ),
      el(
        'button',
        {
          key: 'l',
          type: 'button',
          className: 'voice-pill voice-leave',
          'data-action': 'voice-leave',
          onClick: voice.leave,
        },
        t('chat.voice.leave')
      ),
    ]);
  }
  return el('div', { className: 'voice-controls' }, [
    el(JoinAs, { key: 'j', as, t }),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'voice-pill voice-join',
        'data-action': 'voice-join',
        disabled: state.phase === 'joining',
        onClick: () => voice.join(as.choice || undefined),
      },
      t(state.phase === 'joining' ? 'chat.voice.joining' : 'chat.voice.join')
    ),
  ]);
};

const useNow = (on) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) {
      return undefined;
    }
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, [on]);
  return now;
};

export const VoiceChatPanel = ({
  api,
  chat,
  call,
  voice,
  people,
  onMore,
  onNotified,
  close,
}) => {
  const t = useT();
  const dates = useDates();
  const now = useNow(true);
  const scheduled = isScheduled(call, now);
  const as = useJoinAs(api, chat, call, !scheduled && !call.live);
  const items = sortedParticipants(people.items, now);
  const me = people.items.find((p) => p.self);
  return el(Frame, { title: t(kindKey(call)), close, name: 'voice-chat' }, [
    call.title
      ? el('h3', { key: 'title', className: 'voice-title' }, call.title)
      : null,
    el(
      'p',
      { key: 'count', className: 'voice-count' },
      scheduled
        ? t('chat.voice.startsAt', {
            when: dates.dateTime(call.scheduleDate * 1000),
          })
        : t('chat.voice.participants', { count: people.count ?? call.count })
    ),
    scheduled
      ? el(Notify, { key: 'notify', api, call, onChange: onNotified })
      : null,
    voice.state.code
      ? el(
          'p',
          {
            key: 'err',
            className: 'comments-failed',
            role: 'alert',
            'data-voice-error': voice.state.code,
          },
          errorText(t, voice.state.code)
        )
      : null,
    people.phase === 'error'
      ? el(
          'p',
          { key: 'perr', className: 'comments-failed', role: 'alert' },
          errorText(t, people.code)
        )
      : null,
    !scheduled
      ? el(
          'ul',
          { key: 'list', className: 'voice-list' },
          items.map((p) =>
            el(Row, {
              key: p.id,
              api,
              p,
              nowMs: now,
              selfSpeaking: voice.speaking,
              t,
            })
          )
        )
      : null,
    people.next
      ? el(
          'button',
          {
            key: 'more',
            type: 'button',
            className: 'voice-pill',
            'data-action': 'voice-more',
            onClick: onMore,
          },
          t('chat.voice.more')
        )
      : null,
    !scheduled ? el(Controls, { key: 'ctl', call, voice, me, as, t }) : null,
  ]);
};
