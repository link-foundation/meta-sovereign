// "Send as" in a supergroup, as Telegram Desktop has it (R-Y141; learned,
// never copied): when Telegram offers more than one identity to write as
// (the user, a channel they run, the group itself when anonymous), a
// round avatar button left of the box shows the current one; a click
// lists them (a lock on those that need Premium), a pick is kept by
// Telegram. Every send from the box in that chat then carries `sendAs`.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { Frame } from './chat-readers.js';

const el = React.createElement;

// chat -> the peer id chosen, for the sends the page makes.
const chosen = new Map();

/** The identity chosen for `chat`, or undefined. */
export const sendAsOf = (chat) => chosen.get(String(chat));

/** `{ sendAs }` for a send body in `chat`, or nothing. */
export const sendAsField = (chat) => {
  const id = sendAsOf(chat);
  return id ? { sendAs: id } : {};
};

/** Whether the chat may offer a choice: a supergroup, not a channel. */
export const canChooseSendAs = (api, chat) =>
  typeof api?.telegramSendAs === 'function' &&
  chat?.source === 'telegram' &&
  /^-100\d/.test(String(chat.chat ?? '')) &&
  chat.kind !== 'channel';

/** The line under a peer's name. */
const detailOf = (t, peer) => {
  const kind = t(`chat.sendAs.${peer.kind}`);
  return peer.count
    ? `${kind}, ${t('chat.sendAs.count', { count: peer.count })}`
    : kind;
};

const errorText = (t, code) => {
  const key = `chat.sendAs.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.sendAs.err.failed') : text;
};

const Choice = ({ api, peer, current, locked, onPick, t }) =>
  el(
    'button',
    {
      type: 'button',
      className: `send-as-item${peer.id === current ? ' active' : ''}`,
      'data-send-as': peer.id,
      disabled: locked,
      'aria-pressed': peer.id === current ? 'true' : 'false',
      title: locked ? t('chat.sendAs.premium') : undefined,
      onClick: () => onPick(peer),
    },
    [
      el(PeerAvatar, {
        key: 'a',
        api,
        source: 'telegram',
        peer: peer.id,
        name: peer.name,
        className: 'avatar send-as-avatar',
      }),
      el('span', { key: 't', className: 'send-as-text' }, [
        el('b', { key: 'n' }, peer.name),
        el('small', { key: 'd' }, detailOf(t, peer)),
      ]),
      locked ? el(Icon, { key: 'l', name: 'lock', size: 16 }) : null,
    ]
  );

const SendAsList = ({ api, answer, onPick, onClose, code }) => {
  const t = useT();
  return el(
    Frame,
    { title: t('chat.sendAs.menu'), close: onClose, name: 'send-as' },
    [
      ...answer.peers.map((peer) =>
        el(Choice, {
          key: peer.id,
          api,
          peer,
          t,
          current: answer.current,
          locked: Boolean(peer.premium) && !answer.premium,
          onPick,
        })
      ),
      code ? el('p', { key: 'e', role: 'alert' }, errorText(t, code)) : null,
    ]
  );
};

/**
 * The composer's part: `{ button }` — null unless Telegram offers more
 * than one identity in the open chat. Keeps the choice where the page's
 * sends read it (`sendAsField`).
 */
export const useSendAs = (api, chat) => {
  const t = useT();
  const id = chat?.chat ? String(chat.chat) : null;
  const can = canChooseSendAs(api, chat);
  const [answers, setAnswers] = useState({});
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(null);
  const answer = id ? answers[id] : null;
  useEffect(() => {
    setOpen(false);
    setCode(null);
    if (!can || !id) {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramSendAs({ chat: id }))
      .then((got) => {
        if (!live) {
          return;
        }
        if (got?.ok && got.peers?.length > 1 && got.current) {
          chosen.set(id, got.current);
          setAnswers((all) => ({ ...all, [id]: got }));
        } else {
          chosen.delete(id);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [can, id]);
  const shown = can && answer?.peers?.length > 1 ? answer : null;
  const pick = async (peer) => {
    if (peer.id === shown.current) {
      setOpen(false);
      return;
    }
    const saved = await Promise.resolve(
      api.telegramSendAsSave({ chat: id, sendAs: peer.id })
    ).catch(() => null);
    if (!saved?.ok) {
      setCode(saved?.code ?? 'failed');
      return;
    }
    chosen.set(id, peer.id);
    setAnswers((all) => ({ ...all, [id]: { ...shown, current: peer.id } }));
    setCode(null);
    setOpen(false);
  };
  const now = shown?.peers.find((p) => p.id === shown.current);
  return {
    button: shown
      ? el(
          'button',
          {
            key: 'send-as',
            type: 'button',
            className: 'send-as-button',
            'data-action': 'send-as',
            'data-send-as-current': shown.current,
            'aria-label': t('chat.sendAs.title'),
            title: t('chat.sendAs.title'),
            onClick: () => setOpen(true),
          },
          el(PeerAvatar, {
            api,
            source: 'telegram',
            peer: shown.current,
            name: now?.name ?? shown.current,
            className: 'avatar send-as-avatar',
          })
        )
      : null,
    dialog:
      shown && open
        ? el(SendAsList, {
            key: 'send-as-list',
            api,
            answer: shown,
            code,
            onPick: pick,
            onClose: () => {
              setOpen(false);
              setCode(null);
            },
          })
        : null,
  };
};
