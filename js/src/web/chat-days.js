// Days in the open chat, as Telegram's apps show them (R-Y106; learned,
// never copied): a date between the messages of two days ("Today",
// "Yesterday", "21 October", "3 March 2025"); the date of what is at the
// top floats there while the chat scrolls; a click on either opens a
// calendar of the month, and a day picked there opens the chat at its
// first message — far back, without reading everything in between
// (./chat-jump.js); a day with none goes on to the next that has one.

import React, { useEffect, useRef, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

const pad = (n) => String(n).padStart(2, '0');

/** A time's local day as `YYYY-MM-DD` (null when it is not a time). */
export const dayKeyOf = (ts) => {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** The local midnight a day key starts at, in ms. */
export const dayStart = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** The ids of the messages that start a day (each shows its date). */
export const dayBreaks = (messages = []) => {
  const breaks = new Map();
  let last = null;
  for (const message of messages) {
    const key = dayKeyOf(message.timestamp);
    if (key && key !== last) {
      breaks.set(message.id, key);
    }
    last = key ?? last;
  }
  return breaks;
};

/** A day as its pill says it. */
export const dayLabel = (key, { locale, t, now = Date.now() }) => {
  const today = dayKeyOf(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === today) {
    return t('chat.group.today');
  }
  if (key === dayKeyOf(yesterday)) {
    return t('chat.group.yesterday');
  }
  const date = new Date(dayStart(key));
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: 'numeric' }),
  });
};

const useDayLabel = () => {
  const { locale } = useLocaleContext();
  const t = useT();
  return (key) => dayLabel(key, { locale, t });
};

/** The date between two days' messages; a click opens the calendar. */
export const DayPill = ({ day, onOpen }) => {
  const t = useT();
  const label = useDayLabel();
  return el(
    'div',
    { className: 'chat-day', 'data-day': day },
    el(
      'button',
      {
        type: 'button',
        className: 'chat-day-pill',
        title: t('chat.days.jump'),
        onClick: () => onOpen(day),
      },
      label(day)
    )
  );
};

const FLOAT_MS = 1200;

// The day of what is at the top of the chat, while it scrolls: the last
// date pill that went above it.
const topDay = (box) => {
  const top = box.getBoundingClientRect().top;
  let day = null;
  for (const node of box.querySelectorAll('.chat-day[data-day]')) {
    if (node.getBoundingClientRect().top > top + 2) {
      break;
    }
    day = node.dataset.day;
  }
  return day;
};

/** The date floating at the top while the chat scrolls. */
export const FloatingDay = ({ box, onOpen }) => {
  const label = useDayLabel();
  const t = useT();
  const [day, setDay] = useState(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (!node?.addEventListener) {
      return undefined;
    }
    let timer = null;
    const onScroll = () => {
      setDay(topDay(node));
      setShown(true);
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => setShown(false), FLOAT_MS);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', onScroll);
      globalThis.clearTimeout(timer);
    };
  }, [box.current]);
  if (!day) {
    return null;
  }
  return el(
    'div',
    { className: shown ? 'chat-day-float is-shown' : 'chat-day-float' },
    el(
      'button',
      {
        type: 'button',
        className: 'chat-day-pill',
        title: t('chat.days.jump'),
        tabIndex: shown ? 0 : -1,
        onClick: () => onOpen(day),
      },
      label(day)
    )
  );
};

// The week's first day in the interface language (Monday when unknown).
const firstWeekday = (locale) => {
  try {
    const info = new Intl.Locale(locale);
    const week = info.getWeekInfo?.() ?? info.weekInfo;
    return (week?.firstDay ?? 1) % 7;
  } catch {
    return 1;
  }
};

/** The cells of a month: null before its first day, then 1..n. */
export const monthCells = (year, month, first = 1) => {
  const lead = (new Date(year, month, 1).getDay() - first + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
};

/**
 * Whether a day (`YYYY-MM-DD`) cannot be picked: after today, or before
 * the chat's first message (`first`, a time; unknown: nothing before).
 */
export const dayClosed = (key, { now = Date.now(), first = null } = {}) => {
  const firstKey = first === null ? null : dayKeyOf(first);
  return key > dayKeyOf(now) || (firstKey !== null && key < firstKey);
};

/** The month arrows that stop: `{ atFirst, atLast }` for a month. */
export const monthEnds = (year, month, { now = Date.now(), first = null }) => {
  const at = `${year}-${pad(month + 1)}`;
  const firstKey = first === null ? null : dayKeyOf(first);
  return {
    atFirst: firstKey !== null && at <= firstKey.slice(0, 7),
    atLast: at >= dayKeyOf(now).slice(0, 7),
  };
};

const MonthHead = ({ year, month, setMonth, locale, now, first }) => {
  const t = useT();
  const { atFirst, atLast: last } = monthEnds(year, month, { now, first });
  const move = (by) => setMonth(new Date(year, month + by, 1));
  return el('div', { className: 'calendar-head' }, [
    el(
      'button',
      {
        key: 'p',
        type: 'button',
        className: 'calendar-move',
        'aria-label': t('chat.days.previous'),
        'data-move': 'previous',
        disabled: atFirst,
        onClick: () => move(-1),
      },
      el(Icon, { name: 'chevron-left', size: 18 })
    ),
    el(
      'h3',
      { key: 't', className: 'calendar-title' },
      new Date(year, month, 1).toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      })
    ),
    el(
      'button',
      {
        key: 'n',
        type: 'button',
        className: 'calendar-move',
        'aria-label': t('chat.days.next'),
        'data-move': 'next',
        disabled: last,
        onClick: () => move(1),
      },
      el(Icon, { name: 'chevron-right', size: 18 })
    ),
  ]);
};

const Weekdays = ({ locale, first }) =>
  el(
    'div',
    { className: 'calendar-weekdays', 'aria-hidden': 'true' },
    Array.from({ length: 7 }, (_, i) => {
      // 2023-01-01 was a Sunday.
      const day = new Date(2023, 0, 1 + ((first + i) % 7));
      return el(
        'span',
        { key: i },
        day.toLocaleDateString(locale, { weekday: 'short' })
      );
    })
  );

const DayCell = ({ year, month, day, chosen, now, first, onPick }) => {
  const key = `${year}-${pad(month + 1)}-${pad(day)}`;
  const today = dayKeyOf(now);
  const classes = ['calendar-day'];
  if (key === today) {
    classes.push('is-today');
  }
  if (key === chosen) {
    classes.push('is-chosen');
  }
  return el(
    'button',
    {
      type: 'button',
      className: classes.join(' '),
      'data-date': key,
      disabled: dayClosed(key, { now, first }),
      onClick: () => onPick(dayStart(key)),
    },
    String(day)
  );
};

/**
 * The calendar: the month of `day`, the months before it a click away,
 * none after today's nor before `first` (the chat's first message's
 * time, when known). `onPick(ms)` gets the picked day's local midnight.
 */
export const Calendar = ({
  day,
  first = null,
  onPick,
  onClose,
  now = Date.now(),
}) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const [shown, setMonth] = useState(() => new Date(dayStart(day)));
  const panel = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    globalThis.addEventListener?.('keydown', onKey);
    panel.current?.querySelector('.is-chosen, .is-today')?.focus?.();
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const weekStart = firstWeekday(locale);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay calendar-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.days.calendar'),
      onMouseDown: (e) => e.target === e.currentTarget && onClose(),
    },
    el('div', { ref: panel, className: 'delete-dialog calendar' }, [
      el(MonthHead, {
        key: 'h',
        year,
        month,
        setMonth,
        locale,
        now,
        first,
      }),
      el(Weekdays, { key: 'w', locale, first: weekStart }),
      el(
        'div',
        { key: 'd', className: 'calendar-days' },
        monthCells(year, month, weekStart).map((n, i) =>
          n === null
            ? el('span', { key: `e${i}` })
            : el(DayCell, {
                key: n,
                year,
                month,
                day: n,
                chosen: day,
                now,
                first,
                onPick,
              })
        )
      ),
      el(
        'div',
        { key: 'a', className: 'delete-dialog-btns' },
        el(
          'button',
          { type: 'button', className: 'btn', onClick: onClose },
          t('chat.days.close')
        )
      ),
    ])
  );
};

// The open chat's row of message `id` (or its album's).
const rowOf = (box, id) => {
  const safe = globalThis.CSS?.escape(id) ?? String(id);
  return box?.querySelector(
    `[data-message="${safe}"], [data-items~="${safe}"]`
  );
};

const WAIT_ROW_MS = 3000;

/**
 * The calendar for the open chat: `{ open(day), calendar }` — `calendar`
 * is the element to show (null while closed). A picked day opens the
 * chat at its first message, its date at the top; a day after the last
 * message goes to the end (`toEnd`).
 */
export const useDayJump = ({ history, box, toEnd, notify, first = null }) => {
  const [day, setDay] = useState(null);
  const pick = async (ms) => {
    setDay(null);
    const where = await history?.jump?.(ms);
    if (!where) {
      notify?.();
      return;
    }
    if (where.newest) {
      history.toNewest?.();
      toEnd();
      return;
    }
    const until = Date.now() + WAIT_ROW_MS;
    const place = () => {
      const row = rowOf(box.current, where.id);
      if (!row) {
        if (Date.now() < until) {
          globalThis.setTimeout(place, 50);
        }
        return;
      }
      const pill = row.previousElementSibling?.classList?.contains('chat-day')
        ? row.previousElementSibling
        : row;
      pill.scrollIntoView?.({ block: 'start' });
    };
    globalThis.setTimeout(place, 0);
  };
  return {
    open: setDay,
    calendar: day
      ? el(Calendar, {
          key: 'calendar',
          day,
          first,
          onPick: pick,
          onClose: () => setDay(null),
        })
      : null,
  };
};

/**
 * Pages after a window opened far back are read while its bottom is
 * closer than two screens (as older ones are near its top).
 */
export const useNewer = (box, history) => {
  const check = () => {
    const node = box.current;
    if (!node || !history?.detached || history.loading || history.failed) {
      return;
    }
    const below = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (below < 2 * node.clientHeight) {
      history.loadNewer?.();
    }
  };
  useEffect(check, [history?.detached, history?.loading, history?.ceilingId]);
  return check;
};
