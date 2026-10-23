// Which days of the open chat hold messages, and how many, for the
// jump-to-date calendar (R-Y207; learned, never copied): Telegram counts
// them (messages.getSearchResultsCalendar) a page of days at a time, newest
// first, so a month further back is read with an earlier offset date; a
// day with none is disabled there, as in Telegram Desktop. Without the
// count (offline, a network that cannot) the calendar works as before.

import { useRef, useState } from 'react';

const DAY_S = 86_400;
const MAX_PAGES = 8;
const pad = (n) => String(n).padStart(2, '0');

const keyOf = (ms) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** A month as `YYYY-MM` (month 0..11). */
export const monthKey = (year, month) => `${year}-${pad(month + 1)}`;

/**
 * Where the page that holds a month starts: the first second after it,
 * in unix time; 0 (the newest) for the current month and later.
 */
export const pageBefore = (year, month, now = Date.now()) => {
  const end = new Date(year, month + 1, 1).getTime();
  return end > now ? 0 : Math.floor(end / 1000);
};

/** The days of an answer as local `YYYY-MM-DD` → count. */
export const countsOf = (days = []) => {
  const counts = new Map();
  for (const day of days) {
    const key = keyOf(day.date * 1000);
    counts.set(key, (counts.get(key) ?? 0) + Number(day.count || 0));
  }
  return counts;
};

/**
 * Whether the month is not covered yet by the pages read: the oldest day
 * is still inside it or after it, and the chat has older messages.
 * Returns the next page's offset date (unix seconds), or null.
 */
export const nextOffset = (answer, year, month) => {
  const dates = (answer?.days ?? []).map((d) => d.date);
  if (dates.length === 0) {
    return null;
  }
  const oldest = Math.min(...dates);
  const monthStart = new Date(year, month, 1).getTime() / 1000;
  const first = answer.first ?? null;
  const done =
    oldest <= monthStart || (first !== null && oldest <= first + DAY_S);
  return done ? null : oldest;
};

// The pages that cover a month: `{ ok, counts, first }`.
const readMonth = async (api, chat, filter, year, month) => {
  const counts = new Map();
  let first = null;
  let before = pageBefore(year, month);
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await api
      .telegramCalendar({ chat: String(chat), filter, before })
      .catch(() => null);
    if (!answer?.ok) {
      return { ok: false, counts, first };
    }
    for (const [key, n] of countsOf(answer.days)) {
      counts.set(key, n);
    }
    first = answer.first ? answer.first * 1000 : first;
    before = nextOffset(answer, year, month);
    if (before === null) {
      return { ok: true, counts, first };
    }
  }
  return { ok: false, counts, first };
};

const EMPTY = { owner: '', counts: new Map(), loaded: new Set(), first: null };

/**
 * The open chat's day counts: `{ counts, known(year, month), first, ask(year,
 * month) }`. `ask` reads a month once; `counts` maps `YYYY-MM-DD` to the
 * number of messages. Nothing is asked of a chat that is not on Telegram.
 */
export const useDayCounts = ({ api, chat, filter = 'empty' }) => {
  const owner = chat ? `${chat.key}|${filter}` : '';
  const [state, setState] = useState(EMPTY);
  const busy = useRef(new Set());
  const mine = state.owner === owner ? state : { ...EMPTY, owner };
  const usable =
    chat?.source === 'telegram' && typeof api?.telegramCalendar === 'function';
  const ask = async (year, month) => {
    const id = `${owner}|${monthKey(year, month)}`;
    if (
      !usable ||
      mine.loaded.has(monthKey(year, month)) ||
      busy.current.has(id)
    ) {
      return;
    }
    busy.current.add(id);
    const read = await readMonth(api, chat.chat, filter, year, month);
    busy.current.delete(id);
    if (!read.ok) {
      return;
    }
    setState((before) => {
      const base = before.owner === owner ? before : { ...EMPTY, owner };
      return {
        owner,
        counts: new Map([...base.counts, ...read.counts]),
        loaded: new Set([...base.loaded, monthKey(year, month)]),
        first: read.first ?? base.first,
      };
    });
  };
  return {
    counts: mine.counts,
    first: mine.first,
    known: (year, month) => mine.loaded.has(monthKey(year, month)),
    ask,
  };
};
