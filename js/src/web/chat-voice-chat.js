// The bar under a group's or channel's top bar while a voice chat, video
// chat or live stream is going on, as Telegram Desktop shows it (R-Y188;
// learned, never copied): "Voice chat" / "Live stream", its title, how
// many are in it, a few faces and Join (which opens the panel — joining
// itself is a click there); a scheduled one shows its start and "Notify
// me". It follows updateGroupCall live.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { Notify, VoiceChatPanel } from './chat-voice-panel.js';
import {
  useCall,
  useParticipants,
  useVoiceSession,
} from './chat-voice-hooks.js';
import { isScheduled, kindKey } from './voice-chat-model.js';

const el = React.createElement;

const Faces = ({ api, people }) =>
  el(
    'span',
    { className: 'voice-faces' },
    (people ?? []).slice(0, 3).map((p) =>
      el(PeerAvatar, {
        key: p.id,
        api,
        source: 'telegram',
        peer: p.id,
        name: p.name,
        className: 'avatar voice-face',
      })
    )
  );

const BarText = ({ call, scheduled, t, dates }) =>
  el('span', { className: 'voice-bar-text' }, [
    el('strong', { key: 'k' }, t(kindKey(call))),
    el(
      'span',
      { key: 's', className: 'voice-bar-sub' },
      scheduled
        ? t('chat.voice.startsAt', {
            when: dates.dateTime(call.scheduleDate * 1000),
          })
        : call.title || t('chat.voice.participants', { count: call.count })
    ),
  ]);

export const VoiceChatBar = ({ api, chat, live = null }) => {
  const t = useT();
  const dates = useDates();
  const found = useCall(api, chat, live);
  const [notified, setNotified] = useState(null);
  const [open, setOpen] = useState(false);
  const call = found
    ? { ...found, subscribed: notified ?? found.subscribed }
    : null;
  const voice = useVoiceSession(api, call);
  const joined = voice.state.phase === 'joined';
  const [people, more] = useParticipants(api, call, live?.rev, open || joined);
  useEffect(() => setNotified(null), [found?.id]);
  useEffect(() => {
    if (!found) {
      setOpen(false);
    }
  }, [found]);
  useEffect(() => {
    if (joined) {
      voice.sync(people.items);
    }
  }, [people.items, joined]);
  if (!call) {
    return null;
  }
  const scheduled = isScheduled(call, Date.now());
  return el('div', { className: 'voice-bar-wrap' }, [
    el(
      'div',
      {
        key: 'bar',
        className: 'voice-bar',
        'data-voice-bar': String(chat.chat),
        'data-voice-state': joined
          ? 'joined'
          : scheduled
            ? 'scheduled'
            : 'live',
      },
      [
        el(
          'button',
          {
            key: 'main',
            type: 'button',
            className: 'voice-bar-main',
            'aria-label': t(kindKey(call)),
            onClick: () => setOpen(true),
          },
          [
            el(Icon, { key: 'i', name: 'broadcast', size: 18 }),
            el(BarText, { key: 't', call, scheduled, t, dates }),
            el(Faces, { key: 'f', api, people: call.recent }),
          ]
        ),
        scheduled
          ? el(Notify, { key: 'n', api, call, onChange: setNotified })
          : el(
              'button',
              {
                key: 'j',
                type: 'button',
                className: 'voice-pill voice-join',
                'data-action': joined ? 'voice-bar-leave' : 'voice-bar-join',
                onClick: joined ? voice.leave : () => setOpen(true),
              },
              t(joined ? 'chat.voice.leave' : 'chat.voice.join')
            ),
      ]
    ),
    open
      ? el(VoiceChatPanel, {
          key: 'panel',
          api,
          chat,
          call,
          voice,
          people,
          onMore: more,
          onNotified: setNotified,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
