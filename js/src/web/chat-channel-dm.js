// A channel's direct messages, as Telegram Desktop and the official apps
// have them (R-Y191; learned, never copied). The info column of a channel
// with a linked monoforum has a "Direct messages" button. A subscriber
// lands in their own thread with the channel's admins, with the price per
// message noted when there is one; an admin sees the list of the
// subscribers' threads — name, last message and date, laid out like the
// forum's topics — and opens one to read and answer it. Opening only
// reads; Telegram is written to on a click on Send, Approve or Decline.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { DmThread } from './chat-channel-dm-thread.js';
import { errorText, hasDirectMessages } from './channel-dm-model.js';

const el = React.createElement;

const useThreads = (api, chat, active) => {
  const [state, setState] = useState({ phase: 'loading', threads: [] });
  useEffect(() => {
    if (!active) {
      return;
    }
    let live = true;
    api
      .telegramChannelDmThreads({ chat })
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { phase: 'ready', threads: answer.threads ?? [] }
              : { phase: 'error', code: answer?.code, threads: [] }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api, chat, active]);
  return state;
};

const ThreadRow = ({ thread, t, when, onOpen }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'chat-topic dm-thread-row',
      'data-dm-peer': thread.peer,
      onClick: () => onOpen(thread),
    },
    [
      el(
        'span',
        { key: 'i', className: 'chat-topic-icon', 'aria-hidden': 'true' },
        Array.from(thread.name.trim())[0]?.toUpperCase() || '#'
      ),
      el('span', { key: 't', className: 'dm-thread-text' }, [
        el('span', { key: 'n', className: 'chat-topic-title' }, thread.name),
        el(
          'span',
          { key: 'l', className: 'dm-thread-last meta' },
          thread.last?.text || t('chat.dm.noText')
        ),
      ]),
      thread.at
        ? el(
            'span',
            { key: 'd', className: 'dm-thread-date meta' },
            when(thread.at)
          )
        : null,
      thread.unread > 0
        ? el(
            'span',
            { key: 'u', className: 'chat-topic-unread' },
            String(thread.unread)
          )
        : null,
    ]
  );

const ThreadList = ({ api, chat, onOpen }) => {
  const t = useT();
  const { chatTime } = useDates();
  const list = useThreads(api, chat, true);
  if (list.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.dm.loading'));
  }
  if (list.phase === 'error') {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      errorText(t, list.code)
    );
  }
  if (list.threads.length === 0) {
    return el('p', { className: 'meta' }, t('chat.dm.noThreads'));
  }
  return el(
    'div',
    { className: 'dm-threads', 'data-dm-threads': true },
    list.threads.map((thread) =>
      el(ThreadRow, { key: thread.peer, thread, t, when: chatTime, onOpen })
    )
  );
};

const Back = ({ t, onBack }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'button dm-back',
      'data-action': 'dm-back',
      onClick: onBack,
    },
    t('chat.dm.back')
  );

const Panel = ({ api, monoforum, onClose }) => {
  const t = useT();
  const [open, setOpen] = useState(null);
  const admin = monoforum.admin;
  const title = open ? open.name : t('chat.dm.title');
  return el(Frame, { title, close: onClose, name: 'channel-dm' }, [
    admin && open
      ? el(Back, { key: 'b', t, onBack: () => setOpen(null) })
      : null,
    admin && !open
      ? el(ThreadList, {
          key: 'l',
          api,
          chat: monoforum.id,
          onOpen: setOpen,
        })
      : el(DmThread, {
          key: `t${open?.peer ?? ''}`,
          api,
          chat: monoforum.id,
          peer: open?.peer ?? null,
          admin,
          stars: monoforum.price,
        }),
  ]);
};

/** The info column's row; nothing for a channel without direct messages. */
export const ChannelDmRow = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!hasDirectMessages(chat, info, api)) {
    return null;
  }
  return el('section', { className: 'person-section peer-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'peer-action',
        'data-action': 'channel-dm-open',
        onClick: () => setOpen(true),
      },
      info.monoforum.admin ? t('chat.dm.rowAdmin') : t('chat.dm.row')
    ),
    open
      ? el(Panel, {
          key: 'd',
          api,
          monoforum: info.monoforum,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};
