// A chat's auto-delete timer (R-Y143; learned, never copied): "Auto-delete
// messages…" in the info column opens a dialog with Off, 1 day, 1 week and
// 1 month, and "Other…" with the longer periods; the period Telegram holds
// for the chat (read with its info) is checked, and a small timer badge
// by the chat's title tells it is on. In a group or channel only those who
// may delete messages are offered the item (the server says so in the
// info: `canSetTtl`). Telegram's refusals are told in words.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Frame } from './chat-readers.js';

const el = React.createElement;

const DAY = 86_400;
/** The periods Desktop lists first (seconds; 0 is off). */
export const TTL_MAIN = Object.freeze([0, DAY, 7 * DAY, 31 * DAY]);
/** The longer ones "Other…" adds. */
export const TTL_MORE = Object.freeze([90 * DAY, 180 * DAY, 365 * DAY]);

const SHORT = new Map([
  [DAY, 'chat.ttl.short.day'],
  [7 * DAY, 'chat.ttl.short.week'],
  [31 * DAY, 'chat.ttl.short.month'],
  [90 * DAY, 'chat.ttl.short.months3'],
  [180 * DAY, 'chat.ttl.short.months6'],
  [365 * DAY, 'chat.ttl.short.year'],
]);

const LONG = new Map([
  [0, 'chat.ttl.off'],
  [DAY, 'chat.ttl.day'],
  [7 * DAY, 'chat.ttl.week'],
  [31 * DAY, 'chat.ttl.month'],
  [90 * DAY, 'chat.ttl.months3'],
  [180 * DAY, 'chat.ttl.months6'],
  [365 * DAY, 'chat.ttl.year'],
]);

/** The words for a period: "1 week", "Off"; a odd one in days. */
export const periodWords = (t, seconds) =>
  LONG.has(seconds)
    ? t(LONG.get(seconds))
    : t('chat.ttl.days', { count: Math.max(1, Math.round(seconds / DAY)) });

/** The badge's short text: "1d", "1w", "1m"; a odd one in days. */
export const periodShort = (t, seconds) =>
  SHORT.has(seconds)
    ? t(SHORT.get(seconds))
    : t('chat.ttl.short.days', {
        count: Math.max(1, Math.round(seconds / DAY)),
      });

/** Whether the info column offers the timer: the server allowed it. */
export const hasTtl = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-?\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canSetTtl);

// What was set here lately, per chat: the server keeps a chat's info for
// a minute, so a period just set is believed over it for a little longer.
const BELIEVE_MS = 90_000;
const changed = new Map(); // chat -> { period, at }
const listeners = new Set();

/** The period to show: just set here, else the chat's info, else off. */
export const periodOf = (chat, info, now = Date.now()) => {
  const mine = changed.get(String(chat));
  if (mine && now - mine.at < BELIEVE_MS) {
    return mine.period;
  }
  return Number(info?.ttlPeriod) || 0;
};

const remember = (chat, period) => {
  changed.set(String(chat), { period, at: Date.now() });
  listeners.forEach((listener) => listener());
};

/** The chat's period, following changes made in the dialog. */
export const useTtlPeriod = (chat, info) => {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  return chat?.source === 'telegram' ? periodOf(chat.chat, info) : 0;
};

/** The small timer by the title when the chat auto-deletes. */
export const TtlBadge = ({ chat, info }) => {
  const t = useT();
  const period = useTtlPeriod(chat, info);
  if (!period) {
    return null;
  }
  return el(
    'span',
    {
      className: 'chat-ttl-badge',
      'data-ttl-badge': period,
      title: t('chat.ttl.badge', { period: periodWords(t, period) }),
    },
    [
      el(Icon, { key: 'i', name: 'timer', size: 12 }),
      el('span', { key: 't' }, periodShort(t, period)),
    ]
  );
};

const errorText = (t, code) => {
  const key = `chat.ttl.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.ttl.err.failed') : text;
};

const Choice = ({ seconds, value, disabled, onPick, t }) =>
  el('label', { className: 'admin-toggle' }, [
    el('input', {
      key: 'i',
      type: 'radio',
      name: 'history-ttl',
      'data-ttl': seconds,
      checked: value === seconds,
      disabled,
      onChange: () => onPick(seconds),
    }),
    el('span', { key: 'l' }, periodWords(t, seconds)),
  ]);

/**
 * The choices of a period with Save (R-Y151 shares them with the default
 * timer): `save(period)` asks Telegram and answers `{ ok, code? }`;
 * `done(period)` runs when it was saved.
 */
export const TtlChoices = ({ current, hint, save, done }) => {
  const t = useT();
  const [value, setValue] = useState(current);
  // A period outside Desktop's first four shows its list open.
  const [more, setMore] = useState(TTL_MORE.includes(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const answer = await save(value).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done(value);
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const periods = more ? [...TTL_MAIN, ...TTL_MORE] : TTL_MAIN;
  return el('div', { className: 'admin-body' }, [
    hint ? el('p', { key: 'h', className: 'meta' }, hint) : null,
    el(
      'p',
      { key: 'c', className: 'meta', 'data-ttl-current': current },
      t('chat.ttl.current', { period: periodWords(t, current) })
    ),
    ...periods.map((seconds) =>
      el(Choice, {
        key: seconds,
        seconds,
        value,
        disabled: busy,
        onPick: setValue,
        t,
      })
    ),
    more
      ? null
      : el(
          'button',
          {
            key: 'o',
            type: 'button',
            className: 'comments-older',
            'data-action': 'ttl-other',
            onClick: () => setMore(true),
          },
          t('chat.ttl.other')
        ),
    error
      ? el(
          'p',
          {
            key: 'e',
            className: 'comments-failed',
            role: 'alert',
            'data-ttl-error': error,
          },
          errorText(t, error)
        )
      : null,
    el(
      'button',
      {
        key: 's',
        type: 'button',
        className: 'primary',
        'data-action': 'ttl-save',
        disabled: busy || value === current,
        onClick: run,
      },
      t('chat.ttl.save')
    ),
  ]);
};

const TtlDialog = ({ api, chat, current, close }) => {
  const t = useT();
  return el(
    Frame,
    { title: t('chat.ttl.title'), close, name: 'history-ttl' },
    el(TtlChoices, {
      current,
      hint: t('chat.ttl.hint'),
      save: (period) =>
        api.telegramHistoryTtl({ chat: String(chat.chat), period }),
      done: (period) => {
        remember(chat.chat, period);
        close();
      },
    })
  );
};

/** "Auto-delete messages…" in the info column, or nothing. */
export const TtlActions = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const period = useTtlPeriod(chat, info);
  if (!hasTtl(chat, info)) {
    return null;
  }
  return el('div', { className: 'admin-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'admin-open',
        'data-action': 'history-ttl',
        onClick: () => setOpen(true),
      },
      [
        t('chat.ttl.open'),
        period
          ? el(
              'span',
              { key: 'p', className: 'meta ttl-now' },
              ` ${periodWords(t, period)}`
            )
          : null,
      ]
    ),
    open
      ? el(TtlDialog, {
          key: 'd',
          api,
          chat,
          current: period,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
