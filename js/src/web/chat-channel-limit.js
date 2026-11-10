// Too many channels, as Telegram Desktop handles it (R-Y216; learned, never
// copied): when joining fails with CHANNELS_TOO_MUCH, a dialog lists the
// user's inactive channels (title, last activity) with checkboxes and
// "Leave". Nothing is left until the button is pressed, and only the
// ticked channels are.

import React, { useEffect, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { LIMIT_EVENT } from './chat-invite.js';
import { inactiveLeaveOutcome } from './chat-removal-result.js';

const el = React.createElement;

/** A Unix date as the locale writes it. */
export const dayOf = (seconds, locale) =>
  seconds > 0
    ? new Date(seconds * 1000).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

const useInactive = (api) => {
  const [state, setState] = useState({ phase: 'loading', channels: [] });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramInactiveChannels())
      .catch(() => null)
      .then(
        (answer) =>
          live &&
          setState(
            answer?.ok
              ? { phase: 'ready', channels: answer.channels }
              : { phase: 'error', channels: [] }
          )
      );
    return () => {
      live = false;
    };
  }, [api]);
  return [state, setState];
};

const Item = ({ t, locale, channel, ticked, toggle, disabled }) =>
  el('label', { className: 'limit-row', 'data-limit-chat': channel.chat }, [
    el('input', {
      key: 'c',
      type: 'checkbox',
      checked: ticked,
      disabled,
      onChange: () => toggle(channel.chat),
    }),
    el('span', { key: 't', className: 'limit-title' }, channel.title),
    el(
      'span',
      { key: 'd', className: 'meta' },
      t('chat.limit.last', { date: dayOf(channel.date, locale) })
    ),
  ]);

/** The dialog: `onClose()` on Cancel, Escape and after leaving. */
export const InactiveChannels = ({ api, onClose, onLeft }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const [state, setState] = useInactive(api);
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const active = useRef(false);
  const toggle = (chat) =>
    setChosen((now) =>
      now.includes(chat) ? now.filter((x) => x !== chat) : [...now, chat]
    );
  const leave = async () => {
    const requested = chosen.filter((id) => !blocked.includes(id));
    if (active.current || requested.length === 0) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError(null);
    const answer = await api
      .telegramLeaveChannels({ chats: requested })
      .catch(() => null);
    const result = inactiveLeaveOutcome(answer, requested);
    active.current = false;
    setBusy(false);
    if (result.left.length > 0) {
      setState((now) => ({
        ...now,
        channels: now.channels.filter((c) => !result.left.includes(c.chat)),
      }));
      onLeft?.(result.left);
    }
    setChosen((now) => now.filter((id) => !result.left.includes(id)));
    setBlocked((now) => [...new Set([...now, ...result.blocked])]);
    if (result.complete) {
      onClose();
    } else {
      setError(
        t(
          result.unknown
            ? 'chat.removal.inactiveUnknown'
            : 'chat.removal.inactivePartial'
        )
      );
    }
  };
  let body = el('p', { className: 'meta' }, t('chat.limit.loading'));
  if (state.phase === 'error') {
    body = el('p', { role: 'alert' }, t('chat.limit.err.failed'));
  } else if (state.phase === 'ready') {
    body =
      state.channels.length === 0
        ? el('p', { className: 'meta' }, t('chat.limit.empty'))
        : el(
            'div',
            { className: 'limit-list' },
            state.channels.map((channel) =>
              el(Item, {
                key: channel.chat,
                t,
                locale,
                channel,
                ticked: chosen.includes(channel.chat),
                toggle,
                disabled: busy || blocked.includes(channel.chat),
              })
            )
          );
  }
  return el(
    FormDialog,
    {
      name: 'inactive-channels',
      title: t('chat.limit.title'),
      onClose,
      onSubmit: leave,
      submit: t('chat.limit.leave'),
      busy: busy || chosen.every((id) => blocked.includes(id)),
      error,
    },
    [el('p', { key: 'p' }, t('chat.limit.body')), el('div', { key: 'b' }, body)]
  );
};

/** Mounted once: lists the inactive channels when a join met the limit. */
export const LimitHost = ({ api }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    globalThis.addEventListener?.(LIMIT_EVENT, on);
    return () => globalThis.removeEventListener?.(LIMIT_EVENT, on);
  }, []);
  return open && typeof api?.telegramInactiveChannels === 'function'
    ? el(InactiveChannels, { api, onClose: () => setOpen(false) })
    : null;
};
