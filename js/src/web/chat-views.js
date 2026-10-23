// Live counters under channel posts, as Telegram Desktop keeps them
// (R-Y182; learned, never copied): a post that comes on screen is marked
// viewed (messages.getMessagesViews with increment) once per post and
// session, the marks of several posts batched into one request and
// never sent more often than every few seconds; while posts stay on
// screen their counters are asked again now and then (no increment) and
// the numbers change in place — views, forwards and replies. The batching
// is pure (`createViewBatcher`, with a clock and timers it is given).

import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Icon } from './icons.js';
import { formatCompact } from './stats-graph.js';

const el = React.createElement;

export const VIEW_GAP_MS = 4000;
export const REFRESH_MS = 30_000;
export const MAX_BATCH = 100;

const keyOf = (chat, id) => `${chat}:${id}`;

const chunks = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
};

/**
 * Decides what to ask of Telegram, and when. `send({ chat, ids,
 * increment })` returns a promise of the answer (or throws); `onItems(chat,
 * items)` gets the counters back. `see(chat, id)` and `unsee(chat, id)`
 * say which posts are on screen. A post seen is marked viewed once (in
 * batches of up to 100 per chat), at most every `gap` ms; the posts
 * still on screen are asked again every `refresh` ms.
 */
export const createViewBatcher = ({
  send,
  onItems = () => {},
  gap = VIEW_GAP_MS,
  refresh = REFRESH_MS,
  now = Date.now,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (handle) => globalThis.clearTimeout(handle),
}) => {
  const visible = new Map(); // chat -> Set of ids on screen
  const pending = new Map(); // chat -> Set of ids to mark viewed
  const counted = new Set(); // chat:id marked viewed this session
  let timer = null;
  let timerAt = 0;
  let lastSent = -Infinity;
  let lastRefresh = -Infinity;

  const setOf = (map, chat) => {
    if (!map.has(chat)) {
      map.set(chat, new Set());
    }
    return map.get(chat);
  };

  const ask = async (chat, ids, increment) => {
    try {
      const answer = await send({ chat, ids, increment });
      if (answer?.ok && Array.isArray(answer.items)) {
        onItems(chat, answer.items);
      }
    } catch {
      // A counter that cannot be asked stays as it was.
    }
  };

  const hasVisible = () => [...visible.values()].some((s) => s.size > 0);
  const hasPending = () => [...pending.values()].some((s) => s.size > 0);

  // The next run: soon when posts wait to be marked, else when the posts
  // on screen are due to be asked again. A sooner run replaces a later one.
  const schedule = () => {
    let wait = null;
    if (hasPending()) {
      wait = Math.max(0, lastSent + gap - now());
    } else if (hasVisible()) {
      wait = Math.max(0, lastRefresh + refresh - now());
    }
    if (wait === null || (timer !== null && timerAt <= now() + wait)) {
      return;
    }
    if (timer !== null) {
      clearTimer(timer);
    }
    timerAt = now() + wait;
    timer = setTimer(run, wait);
  };

  // The posts newly seen are marked viewed; the others on screen are
  // refreshed when it is time.
  const run = () => {
    timer = null;
    const marked = new Set();
    if (hasPending()) {
      lastSent = now();
      for (const [chat, ids] of pending) {
        for (const batch of chunks([...ids], MAX_BATCH)) {
          batch.forEach((id) => {
            counted.add(keyOf(chat, id));
            marked.add(keyOf(chat, id));
          });
          ask(chat, batch, true);
        }
      }
      pending.clear();
    }
    if (now() - lastRefresh >= refresh) {
      lastRefresh = now();
      for (const [chat, ids] of visible) {
        const rest = [...ids].filter((id) => !marked.has(keyOf(chat, id)));
        for (const batch of chunks(rest, MAX_BATCH)) {
          ask(chat, batch, false);
        }
      }
    }
    schedule();
  };

  return {
    see(chat, id) {
      setOf(visible, chat).add(id);
      if (!counted.has(keyOf(chat, id))) {
        setOf(pending, chat).add(id);
      }
      schedule();
    },
    unsee(chat, id) {
      visible.get(chat)?.delete(id);
    },
    /** Whether the post was marked viewed (or is waiting to be). */
    counts: (chat, id) =>
      counted.has(keyOf(chat, id)) || Boolean(pending.get(chat)?.has(id)),
    stop() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
};

// What Telegram last said, by post; the page redraws on every change.
const live = new Map(); // chat:id -> { views?, forwards?, replies? }
const listeners = new Set();
let version = 0;

/** Keeps the counters an answer holds (only what it holds). */
export const applyItems = (chat, items) => {
  let changed = false;
  for (const { id, ...counters } of items ?? []) {
    const key = keyOf(chat, id);
    const before = live.get(key) ?? {};
    const after = { ...before, ...counters };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      live.set(key, after);
      changed = true;
    }
  }
  if (changed) {
    version += 1;
    listeners.forEach((listener) => listener());
  }
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Forgets every kept counter (the tests'). */
export const resetViews = () => {
  live.clear();
  version += 1;
};

const idsOf = (message) => {
  const parts = String(message?.id ?? '').split(':');
  const id = Number(parts.pop());
  return parts[0] === 'msg' && parts[1] === 'telegram' && id > 0
    ? { chat: parts[2], id }
    : null;
};

const number = (value) =>
  Number.isInteger(value) && value >= 0 ? value : null;

/**
 * The counters of a post: what the stored message carries, over which
 * the last answer of Telegram (`fresh`) wins.
 * → `{ views, forwards, replies }`, each a number or null.
 */
export const statsOf = (message, fresh = {}) => ({
  views: number(fresh.views ?? Number(message?.raw?.views)),
  forwards: number(fresh.forwards ?? Number(message?.raw?.forwards)),
  replies: number(fresh.replies ?? Number(message?.raw?.replies?.replies)),
});

/** Whether the message is a channel post whose views are shown and kept. */
export const countsViews = (message) =>
  Boolean(idsOf(message)) &&
  !message.pending &&
  !message.service &&
  Number.isInteger(Number(message.raw?.views));

/** The message's counters, redrawn when an answer changes them. */
export const useLiveStats = (message) => {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version
  );
  const at = idsOf(message);
  return statsOf(message, at ? live.get(keyOf(at.chat, at.id)) : undefined);
};

const batchers = new WeakMap();
const batcherOf = (api) => {
  if (!batchers.has(api)) {
    batchers.set(
      api,
      createViewBatcher({
        send: (body) => api.telegramMessageViews(body),
        onItems: applyItems,
      })
    );
  }
  return batchers.get(api);
};

// Tells the batcher while the node is on screen.
const useSeen = (ref, api, message, on) => {
  const at = idsOf(message);
  const chat = at?.chat;
  const id = at?.id;
  useEffect(() => {
    const node = ref.current;
    const Observer = globalThis.IntersectionObserver;
    if (!on || !node || !chat || typeof Observer !== 'function') {
      return undefined;
    }
    const batcher = batcherOf(api);
    const observer = new Observer((entries) => {
      const shown = entries.some((e) => e.isIntersecting);
      if (shown) {
        batcher.see(chat, id);
      } else {
        batcher.unsee(chat, id);
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      batcher.unsee(chat, id);
    };
  }, [on, api, chat, id]);
};

/**
 * The eye and the number of views (and of forwards) in a post's footer;
 * while the post is on screen it is marked viewed and kept up to date.
 * `track` false (the footer's hidden twin) only takes the room.
 */
export const ViewCount = ({ message, api, track = true }) => {
  const ref = useRef(null);
  const stats = useLiveStats(message);
  const on =
    track &&
    countsViews(message) &&
    typeof api?.telegramMessageViews === 'function';
  useSeen(ref, api, message, on);
  if (!countsViews(message) || stats.views === null) {
    return null;
  }
  return el(
    'span',
    {
      ref,
      className: 'bubble-views',
      'data-views': stats.views,
      ...(stats.forwards ? { 'data-forwards': stats.forwards } : {}),
    },
    [
      stats.forwards
        ? el('span', { key: 'f', className: 'bubble-forwards' }, [
            el(Icon, { key: 'i', name: 'forward', size: 11 }),
            formatCompact(stats.forwards),
          ])
        : null,
      el(Icon, { key: 'e', name: 'eye', size: 12 }),
      el(
        'span',
        { key: 'n', className: 'bubble-views-n' },
        formatCompact(stats.views)
      ),
    ]
  );
};
