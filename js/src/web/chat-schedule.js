/**
 * The Send button's menu and scheduled messages, as Telegram Desktop's
 * (R-Y102; learned, never copied):
 *
 * - A right click (or a long press) on Send: "Send without sound" (the
 *   other side gets no sound) and "Schedule message" — a day and a time,
 *   from a minute to a year ahead; Telegram holds the message and sends
 *   it then.
 * - A chat with scheduled messages shows a clock by the message box with
 *   their count; it opens them, the soonest first, by day: each can be
 *   sent now, moved to another time or deleted.
 *
 * Telegram user accounts only, as files are (./chat-attach.js); a file's
 * Send button has the same menu.
 *
 * R-Y197 (learned, never copied): in a private chat with a person whose
 * last seen is visible the menu also has "Send when online" — a
 * `schedule_date` of 0x7FFFFFFE, shown in the list as "When online". In
 * Saved Messages the same feature is "Set a reminder" and the list is
 * "Reminders".
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useT, useDates } from './i18n.js';
import { Icon } from './icons.js';
import { MessageText } from './message-text.js';
import { MsgContextMenu } from './chat-message.js';

const el = React.createElement;

export const MIN_AHEAD_MS = 60_000;
export const MAX_AHEAD_MS = 365 * 86_400_000;
const LONG_PRESS_MS = 500;

/** The `schedule_date` Telegram's clients use for "Send when online". */
export const WHEN_ONLINE = 0x7f_ff_ff_fe;

/** Whether a scheduled time (seconds) is "When online". */
export const isWhenOnline = (seconds) => Number(seconds) === WHEN_ONLINE;

/** Whether a scheduled message's link goes out "When online". */
export const linkWhenOnline = (link) =>
  isWhenOnline(Math.floor(Date.parse(link?.timestamp ?? '') / 1000));

const pad = (n) => String(n).padStart(2, '0');

/** A time as the date and time inputs show it (local). */
export const inputsOf = (ms) => {
  const d = new Date(ms);
  return {
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

/** The date and time inputs as a time (ms), or null. */
export const timeOf = (day, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const at = new Date(y, m - 1, d, h, min, 0, 0).getTime();
  return Number.isFinite(at) ? at : null;
};

/** Whether `at` is a time to schedule for, seen at `now`. */
export const schedulable = (at, now = Date.now()) =>
  at !== null && at - now >= MIN_AHEAD_MS && at - now <= MAX_AHEAD_MS;

/** Desktop's first guess: an hour from now, on a five-minute mark. */
export const firstGuess = (now = Date.now()) => {
  const step = 5 * 60_000;
  return Math.ceil((now + 3_600_000) / step) * step;
};

export const canSchedule = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramScheduled === 'function';

/** Whether the open chat is the user's Saved Messages (reminders). */
export const isReminderChat = (state) =>
  state.current?.source === 'telegram' && Boolean(state.info?.self);

/**
 * Whether "Send when online" is offered: a private chat with a person
 * (not a bot, not oneself) whose last seen is visible (the server's chat
 * info says online or gives a last seen).
 */
export const canSendWhenOnline = (state, api) => {
  const info = state.info;
  return (
    canSchedule(state, api) &&
    state.current.kind === 'private' &&
    /^\d+$/.test(String(state.current.chat)) &&
    info?.kind === 'user' &&
    !info.self &&
    !info.bot &&
    (info.online === true || Boolean(info.lastSeen))
  );
};

/** The Send menu's items for the open chat. */
export const sendMenuItems = ({ state, api, effects }) => {
  const can = canSchedule(state, api);
  return [
    ...(can ? ['sendSilent'] : []),
    ...(can ? [isReminderChat(state) ? 'scheduleReminder' : 'schedule'] : []),
    ...(canSendWhenOnline(state, api) ? ['sendWhenOnline'] : []),
    ...(effects ? ['sendEffect'] : []),
  ];
};

// ---- The Send button's menu ------------------------------------------

/**
 * Props for the Send button: a right click or a long press opens the
 * menu at the pointer. `open(point)`.
 */
export const useSendMenu = (enabled) => {
  const [at, setAt] = useState(null);
  const timer = useRef(null);
  const stop = () => globalThis.clearTimeout(timer.current);
  const props = enabled
    ? {
        onContextMenu: (event) => {
          event.preventDefault();
          setAt({ x: event.clientX, y: event.clientY });
        },
        onTouchStart: (event) => {
          const touch = event.touches?.[0];
          stop();
          timer.current = globalThis.setTimeout(
            () => setAt({ x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 }),
            LONG_PRESS_MS
          );
        },
        onTouchEnd: stop,
        onTouchMove: stop,
      }
    : {};
  useEffect(() => stop, []);
  return { at, props, close: () => setAt(null) };
};

/**
 * The menu itself: `onPick('sendSilent' | 'schedule' | 'scheduleReminder'
 * | 'sendWhenOnline' | 'sendEffect')`;
 * `items` says which it offers ("Send with effect", R-Y149, is for a
 * private chat's text box).
 */
export const SendMenu = ({
  menu,
  onPick,
  items = ['sendSilent', 'schedule'],
}) =>
  menu.at
    ? el(MsgContextMenu, {
        x: menu.at.x,
        y: menu.at.y,
        message: { pending: true },
        reactions: false,
        items,
        onClose: menu.close,
        onAction: (key) => onPick(key),
      })
    : null;

// ---- Choosing the time --------------------------------------------------

const useEsc = (onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current?.();
      }
    };
    globalThis.addEventListener?.('keydown', key);
    return () => globalThis.removeEventListener?.('keydown', key);
  }, []);
};

/** A day and a time; `onPick(ms)`. */
export const ScheduleDialog = ({
  initial,
  onClose,
  onPick,
  reminder = false,
}) => {
  const t = useT();
  const dates = useDates();
  const [first] = useState(() => inputsOf(initial ?? firstGuess()));
  const [day, setDay] = useState(first.day);
  const [time, setTime] = useState(first.time);
  useEsc(onClose);
  const at = timeOf(day, time);
  const ok = schedulable(at);
  const pick = () => {
    if (ok) {
      onClose();
      onPick(at);
    }
  };
  const now = Date.now();
  const title = t(
    reminder ? 'chat.schedule.reminderTitle' : 'chat.schedule.title'
  );
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    el('div', { className: 'delete-dialog schedule-dialog' }, [
      el('h3', { key: 'h' }, title),
      el('div', { key: 'when', className: 'schedule-when' }, [
        el('input', {
          key: 'day',
          type: 'date',
          value: day,
          min: inputsOf(now).day,
          max: inputsOf(now + MAX_AHEAD_MS).day,
          'aria-label': t('chat.schedule.day'),
          'data-field': 'day',
          onChange: (e) => setDay(e.target.value),
        }),
        el('input', {
          key: 'time',
          type: 'time',
          value: time,
          'aria-label': t('chat.schedule.time'),
          'data-field': 'time',
          onChange: (e) => setTime(e.target.value),
          onKeyDown: (e) => e.key === 'Enter' && pick(),
        }),
      ]),
      el(
        'p',
        { key: 'hint', className: 'schedule-hint', role: 'status' },
        ok
          ? t('chat.schedule.willSend', { when: dates.dateTime(at) })
          : t('chat.schedule.tooSoon')
      ),
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'primary',
            disabled: !ok,
            'data-action': 'schedule-confirm',
            onClick: pick,
          },
          t(
            reminder ? 'chat.schedule.reminderConfirm' : 'chat.schedule.confirm'
          )
        ),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: onClose },
          t('common.cancel')
        ),
      ]),
    ])
  );
};

// ---- The chat's scheduled messages ------------------------------------

/**
 * The current chat's scheduled messages: asked when the chat opens and
 * when one of ours has just been scheduled.
 */
export const useScheduled = ({ state, api }) => {
  const enabled = canSchedule(state, api);
  const chat = enabled ? String(state.current.chat) : null;
  const [list, setList] = useState({ chat: null, links: [] });
  const load = useCallback(async () => {
    if (!chat) {
      return;
    }
    const answer = await api.telegramScheduled({ chat }).catch(() => null);
    if (answer?.ok) {
      setList({ chat, links: answer.links ?? [] });
    }
  }, [api, chat]);
  useEffect(() => {
    load();
  }, [load]);
  // Ours on their way to be scheduled: when one arrives, ask again.
  const key = state.current?.key;
  const going = (state.composer?.pending ?? []).filter(
    (p) => p.key === key && p.scheduleDate && p.status !== 'failed'
  ).length;
  const before = useRef(going);
  useEffect(() => {
    if (going < before.current) {
      load();
    }
    before.current = going;
  }, [going, load]);

  const act = (call) => async (body) => {
    const answer = await call?.({ chat, ...body }).catch((error) => ({
      error: error.message,
    }));
    if (!answer?.ok) {
      state.notify?.({
        kind: 'action-failed',
        error: answer?.error ?? 'not done',
      });
    }
    await load();
  };
  return {
    enabled,
    reminder: enabled && isReminderChat(state),
    links: list.chat === chat ? list.links : [],
    refresh: load,
    sendNow: act(api?.telegramScheduledSend),
    remove: act(api?.telegramScheduledDelete),
    reschedule: act(api?.telegramScheduledReschedule),
  };
};

/** The clock by the message box, with the count. */
export const ScheduledButton = ({ scheduled, onOpen }) => {
  const t = useT();
  const count = scheduled.links.length;
  if (count === 0) {
    return null;
  }
  const label = t(
    scheduled.reminder ? 'chat.schedule.reminderList' : 'chat.schedule.list',
    { count }
  );
  return el(
    'button',
    {
      type: 'button',
      className: 'composer-scheduled',
      'data-action': 'scheduled',
      title: label,
      'aria-label': label,
      onClick: onOpen,
    },
    [
      el(Icon, { key: 'i', name: 'clock', size: 20 }),
      el('span', { key: 'n', className: 'composer-scheduled-count' }, count),
    ]
  );
};

const idOf = (link) => Number(String(link.id).split(':').pop());

const dayOf = (ts) => new Date(ts).toDateString();

const ScheduledItem = ({ link, dates, t, onSend, onMove, onDelete }) =>
  el(
    'li',
    {
      className: 'scheduled-item',
      'data-scheduled': idOf(link),
    },
    [
      el('span', { key: 'at', className: 'scheduled-time' }, [
        linkWhenOnline(link)
          ? t('chat.schedule.whenOnline')
          : dates.time(link.timestamp),
      ]),
      el(
        'span',
        { key: 'text', className: 'scheduled-text' },
        link.body
          ? el(MessageText, {
              text: link.body,
              entities: link.raw?.entities ?? [],
            })
          : t('chat.schedule.media')
      ),
      ...[
        ['send', 'send', 'chat.schedule.sendNow', onSend],
        ['move', 'clock', 'chat.schedule.move', onMove],
        ['delete', 'trash', 'chat.schedule.delete', onDelete],
      ].map(([key, icon, label, onClick]) =>
        el(
          'button',
          {
            key,
            type: 'button',
            className: 'scheduled-act',
            'data-action': `scheduled-${key}`,
            title: t(label),
            'aria-label': t(label),
            onClick: () => onClick(link),
          },
          el(Icon, { name: icon, size: 16 })
        )
      ),
    ]
  );

/** The scheduled messages, by day, the soonest first. */
export const ScheduledList = ({ scheduled, onClose }) => {
  const t = useT();
  const dates = useDates();
  const listTitle = t(
    scheduled.reminder ? 'chat.schedule.reminders' : 'chat.schedule.listTitle'
  );
  const [moving, setMoving] = useState(null);
  useEsc(() => (moving ? null : onClose()));
  const { links } = scheduled;
  useEffect(() => {
    if (links.length === 0) {
      onClose();
    }
  }, [links.length, onClose]);
  const rows = [];
  links.forEach((link, index) => {
    if (
      !linkWhenOnline(link) &&
      (index === 0 ||
        dayOf(links[index - 1].timestamp) !== dayOf(link.timestamp))
    ) {
      rows.push(
        el(
          'li',
          { key: `d${index}`, className: 'scheduled-day' },
          t(
            scheduled.reminder
              ? 'chat.schedule.reminderDayHead'
              : 'chat.schedule.dayHead',
            {
              day: new Date(link.timestamp).toLocaleDateString(undefined, {
                dateStyle: 'long',
              }),
            }
          )
        )
      );
    }
    rows.push(
      el(ScheduledItem, {
        key: link.id,
        link,
        dates,
        t,
        onSend: (l) => scheduled.sendNow({ ids: [idOf(l)] }),
        onMove: (l) => setMoving(l),
        onDelete: (l) => scheduled.remove({ ids: [idOf(l)] }),
      })
    );
  });
  return el(React.Fragment, null, [
    el(
      'div',
      {
        key: 'list',
        className: 'delete-dialog-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': listTitle,
      },
      el('div', { className: 'delete-dialog scheduled-dialog' }, [
        el('h3', { key: 'h' }, listTitle),
        el('ul', { key: 'l', className: 'scheduled-list' }, rows),
        el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
          el(
            'button',
            { key: 'close', type: 'button', onClick: onClose },
            t('chat.schedule.close')
          ),
        ]),
      ])
    ),
    moving
      ? el(ScheduleDialog, {
          key: 'move',
          reminder: scheduled.reminder,
          initial: linkWhenOnline(moving)
            ? undefined
            : Date.parse(moving.timestamp),
          onClose: () => setMoving(null),
          onPick: (at) =>
            scheduled.reschedule({
              id: idOf(moving),
              date: Math.floor(at / 1000),
            }),
        })
      : null,
  ]);
};
