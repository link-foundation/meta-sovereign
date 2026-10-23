// A chat's own notification settings, as Telegram Desktop has them
// (R-Y157; learned, never copied): "Notifications" in the chat's header
// and info — Mute (for the times the chat list's menu has, or unmute),
// Show preview (default, on or off) and "Reset to default", which sends
// empty settings so the chat follows the general setting again. The
// dialog says whether the chat follows the default or is an exception.
// Its sound (R-Y181) is ./chat-notify-sound.js. Layer 225 has no per-chat flag for pinned messages or mentions, so
// those are not offered. Every question is asked of Telegram through the
// server; the shared rules (./notify-rules.js) follow the answer.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { useEsc } from './chat-invite.js';
import { Icon } from './icons.js';
import { MUTE_FOR } from './chat-list-menu.js';
import { SoundPicker } from './chat-notify-sound.js';
import {
  getNotifyRules,
  scopeOf,
  setNotifyRules,
  withChat,
} from './notify-rules.js';

const el = React.createElement;

const PREVIEWS = ['default', 'on', 'off'];
const MUTES = Object.entries(MUTE_FOR).map(([key, seconds]) => [
  key,
  key === 'muteForever' ? 'forever' : seconds,
]);

/** A chat that has settings of its own to change: on Telegram only. */
export const hasNotifySettings = (chat, api) =>
  chat?.source === 'telegram' &&
  /^-?\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramNotifyChat === 'function';

// What the dialog says of the mute: the key and the time to fill in.
export const muteLine = (row) => {
  if (row.forever) {
    return { key: 'muted' };
  }
  return row.muteUntil > 0
    ? { key: 'mutedUntil', until: row.muteUntil * 1000 }
    : { key: row.exception ? 'unmuted' : 'on' };
};

const Choice = ({ name, value, current, label, onPick }) =>
  el('label', { className: 'check' }, [
    el('input', {
      key: 'i',
      type: 'radio',
      name,
      value,
      checked: current === value,
      'data-choice': `${name}-${value}`,
      onChange: () => onPick(value),
    }),
    ` ${label}`,
  ]);

const useRow = (api, chat) => {
  const [row, setRow] = useState(null);
  const [state, setState] = useState({ busy: false, error: false });
  const id = String(chat.chat);
  const keep = (answer) => {
    if (answer?.ok) {
      setRow(answer);
      setNotifyRules(
        withChat(getNotifyRules(), answer, {
          name: chat.name ?? id,
          scope: scopeOf(chat),
        })
      );
    }
    setState({ busy: false, error: !answer?.ok });
  };
  useEffect(() => {
    let live = true;
    api
      .telegramNotifyChat({ chat: id })
      .then(
        (answer) =>
          live &&
          (answer?.ok ? setRow(answer) : setState({ busy: false, error: true }))
      )
      .catch(() => live && setState({ busy: false, error: true }));
    return () => {
      live = false;
    };
  }, [id]);
  const change = (body) => {
    setState({ busy: true, error: false });
    return api
      .telegramNotifyChatSet({ chat: id, ...body })
      .then(keep)
      .catch(() => keep(null));
  };
  return { row, ...state, change };
};

const MuteLine = ({ row, t, dateTime }) => {
  const line = muteLine(row);
  return el(
    'p',
    { className: 'meta', 'data-mute-state': line.key },
    line.key === 'mutedUntil'
      ? t('chat.notifySet.mutedUntil', { time: dateTime(line.until) })
      : t(`chat.notifySet.${line.key}`)
  );
};

/** The dialog for one chat: `chat` is `{ chat, name, kind }`. */
export const ChatNotifyDialog = ({ api, chat, onClose }) => {
  const t = useT();
  const { dateTime } = useDates();
  useEsc(onClose);
  const { row, busy, error, change } = useRow(api, chat);
  const title = t('chat.notifySet.title');
  const previews = row?.previews;
  const preview = previews === null ? 'default' : previews ? 'on' : 'off';
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      'data-dialog': 'chat-notify',
      onClick: (event) => event.target === event.currentTarget && onClose(),
    },
    el('div', { className: 'delete-dialog notify-dialog' }, [
      el('h3', { key: 'h' }, `${title} · ${chat.name ?? chat.chat}`),
      row
        ? el('div', { key: 'b', className: 'notify-dialog-body' }, [
            el(
              'p',
              { key: 'k', className: 'meta', 'data-follows': !row.exception },
              t(
                row.exception
                  ? 'chat.notifySet.exception'
                  : 'chat.notifySet.default'
              )
            ),
            el(MuteLine, { key: 'm', row, t, dateTime }),
            el('div', { key: 'mb', className: 'notify-mutes' }, [
              el(
                'button',
                {
                  key: 'off',
                  type: 'button',
                  'data-action': 'notify-unmute',
                  disabled: busy,
                  onClick: () => change({ mute: 'off' }),
                },
                t('chat.list.unmute')
              ),
              ...MUTES.map(([key, value]) =>
                el(
                  'button',
                  {
                    key,
                    type: 'button',
                    'data-action': `notify-${key}`,
                    disabled: busy,
                    onClick: () => change({ mute: value }),
                  },
                  `${t('chat.list.mute')}: ${t(`chat.list.${key}`)}`
                )
              ),
            ]),
            el('fieldset', { key: 'p', className: 'appearance-choices' }, [
              el('legend', { key: 'l' }, t('chat.notifySet.preview')),
              ...PREVIEWS.map((value) =>
                el(Choice, {
                  key: value,
                  name: 'notify-preview',
                  value,
                  current: preview,
                  label: t(`chat.notifySet.preview.${value}`),
                  onPick: (next) => change({ previews: next }),
                })
              ),
            ]),
            el(SoundPicker, { key: 'snd', api, row, busy, change, t }),
          ])
        : el('p', { key: 'w', className: 'meta' }, error ? '' : '…'),
      error
        ? el('p', { key: 'e', role: 'alert' }, t('chat.notifySet.err'))
        : null,
      el('div', { key: 'f', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'r',
            type: 'button',
            'data-action': 'notify-reset',
            disabled: busy || !row?.exception,
            onClick: () => change({ reset: true }),
          },
          t('chat.notifySet.reset')
        ),
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            className: 'primary',
            'data-action': 'notify-close',
            onClick: onClose,
          },
          t('chat.notifySet.done')
        ),
      ]),
    ])
  );
};

/** The header's bell and the dialog it opens (nothing off Telegram). */
export const NotifyButton = ({ api, chat, className = 'icon-btn' }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!hasNotifySettings(chat, api)) {
    return null;
  }
  return el(React.Fragment, null, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: `chat-notify ${className}`,
        'data-action': 'chat-notify',
        'aria-label': t('chat.notifySet.title'),
        title: t('chat.notifySet.title'),
        onClick: () => setOpen(true),
      },
      el(Icon, { name: 'bell' })
    ),
    open
      ? el(ChatNotifyDialog, {
          key: 'd',
          api,
          chat,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};

/** The info column's "Notifications" row, which opens the same dialog. */
export const NotifyRow = ({ api, chat }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!hasNotifySettings(chat, api)) {
    return null;
  }
  return el('section', { className: 'person-section peer-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'peer-action',
        'data-action': 'notify-open',
        onClick: () => setOpen(true),
      },
      t('chat.notifySet.title')
    ),
    open
      ? el(ChatNotifyDialog, {
          key: 'd',
          api,
          chat,
          onClose: () => setOpen(false),
        })
      : null,
  ]);
};
