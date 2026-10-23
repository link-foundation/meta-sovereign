// A chat window opened far back, as Telegram's apps open a date picked
// in the calendar (R-Y106) or a message far back — a mention, a match of
// a search, a reply (R-Y107; learned, never copied): the page around the
// first message on or after that moment replaces what is held, with a
// `ceiling` — the newest message held — so nothing newer shows above a
// gap; scrolling down reads the pages after it (`loadNewer`) until the
// newest is reached and the ceiling goes; the round "down" button goes
// back to the newest at once (`toNewest`).

import { useCallback, useEffect } from 'react';
import { byTime, networkMessageId } from './chat-model.js';

/** A window after a page newer than its ceiling arrived. */
export const mergeNewer = (window, result) => {
  const got = result?.messages ?? [];
  const byId = new Map(window.messages.map((m) => [m.id, m]));
  for (const message of got) {
    byId.set(message.id, message);
  }
  const messages = [...byId.values()].sort(byTime);
  return {
    ...window,
    messages,
    ceiling: result?.newer ? (got.at(-1) ?? window.ceiling) : null,
  };
};

/** The open chat's messages under the window's ceiling (pending stay). */
export const underCeiling = (messages, window) => {
  const ceiling = window?.ceiling;
  return ceiling
    ? messages.filter((m) => m.pending || byTime(m, ceiling) <= 0)
    : messages;
};

// The window a jump opens: the page around the date, nothing newer.
// `view` tells a window opened anew from one that changed: what it no
// longer holds did not leave the chat (./chat-leaving.js).
let views = 0;
const opened = (page) => ({
  view: (views += 1),
  messages: page.messages,
  more: Boolean(page.more),
  ceiling: page.newer ? (page.messages.at(-1) ?? null) : null,
  server: true,
  loading: false,
  failed: false,
  stalledAt: 0,
});

const linkIdOf = (current, id) => `msg:${current.source}:${current.chat}:${id}`;

// Telegram asked where `ms` is: `{ id }` its first message then (a link
// id), `{ newest: true }` none that late, null when it did not answer.
const askAt = async (api, current, ms) => {
  if (typeof api.telegramHistoryAt !== 'function') {
    return {};
  }
  const answer = await api
    .telegramHistoryAt({
      chat: String(current.chat),
      date: Math.floor(ms / 1000),
    })
    .catch(() => null);
  if (!answer?.ok) {
    return null;
  }
  return answer.id === null || answer.id === undefined
    ? { newest: true }
    : { id: linkIdOf(current, answer.id) };
};

const FLASH_MS = 1600;
const SHOW_TRIES = 20;

const SETTLE_MS = 160;

const rowOf = (id) => {
  const safe = globalThis.CSS?.escape(id) ?? String(id);
  return globalThis.document?.querySelector(
    `.chat-scroll [data-message="${safe}"], .chat-scroll [data-items~="${safe}"]`
  );
};

// Whether a row is in its stream's view.
const seen = (node) => {
  const box = node?.closest?.('.chat-scroll')?.getBoundingClientRect?.();
  const row = node?.getBoundingClientRect?.();
  return Boolean(box && row) && row.bottom > box.top && row.top < box.bottom;
};

// Where a message is: its row (or its album's), in the middle, flashed;
// at once when the chat was opened around it (`instant`), smoothly when
// it was drawn already, as Telegram's apps go.
const showMessage = (id, { instant = false } = {}) => {
  const node = rowOf(id);
  if (!node) {
    return false;
  }
  node.scrollIntoView?.({
    block: 'center',
    behavior: instant ? 'auto' : 'smooth',
  });
  node.classList?.add('is-found');
  globalThis.setTimeout(() => node.classList?.remove('is-found'), FLASH_MS);
  return true;
};

const pause = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

// A chat opened around a message: shown once drawn, and again while the
// chat's own moves (its first scroll to the end) took it out of view.
const showOpened = async (id) => {
  let shown = false;
  for (let i = 0; i < SHOW_TRIES && !shown; i += 1) {
    await frame();
    shown = showMessage(id, { instant: true });
  }
  for (let i = 0; shown && i < 3; i += 1) {
    await pause(SETTLE_MS);
    if (!seen(rowOf(id))) {
      showMessage(id, { instant: true });
    }
  }
  return shown;
};

const frame = () =>
  new Promise((resolve) =>
    (globalThis.requestAnimationFrame ?? globalThis.setTimeout)(resolve)
  );

/**
 * Go to message `id` (a link id), as a click on a reply, a pinned
 * message, a mention or a match does in Telegram's apps: shown when
 * drawn; else `reach(id)` opens the chat around it, and it is shown once
 * drawn. Whether it is.
 */
export const goToMessage = async (id, reach) => {
  if (showMessage(id)) {
    return true;
  }
  if (!id || !(await reach?.(id))) {
    return false;
  }
  return showOpened(id);
};

// A chat opened at a found message waits this long after its first page
// shows, so the chat's own scroll to its end comes first.
const ARRIVE_MS = 120;

/**
 * A chat opened from a search across Telegram goes to the message found
 * (R-Y107) once its first page shows: `state.arrival` is `{ key, id }`,
 * `state.arrived()` says it is done.
 */
export const useArrival = (state) => {
  const arrival = state.arrival;
  const key = state.current?.key ?? null;
  const reach = state.history?.reach;
  const shown = (state.messages?.length ?? 0) > 0;
  useEffect(() => {
    if (!arrival || arrival.key !== key || !reach || !shown) {
      return undefined;
    }
    let gone = false;
    const timer = globalThis.setTimeout(async () => {
      await goToMessage(arrival.id, reach);
      if (!gone) {
        state.arrived?.();
      }
    }, ARRIVE_MS);
    return () => {
      gone = true;
      globalThis.clearTimeout(timer);
    };
  }, [arrival, key, reach, shown]);
};

// Telegram asked for message `id` (a link id) and a page around it, to
// be stored; when it cannot answer (offline), the store may hold it.
const askAround = async (api, current, id) => {
  const num = networkMessageId({ id });
  if (typeof api.telegramHistoryAt === 'function' && num) {
    await api
      .telegramHistoryAt({ chat: String(current.chat), id: num })
      .catch(() => null);
  }
};

/**
 * `{ jump(ms), jumpTo(id), loadNewer(), toNewest() }` for the open
 * chat's window;
 * `patch`, `ref`, `refill` and `retry` are the window's own.
 */
export const useWindowJump = (
  api,
  current,
  { telegram, patch, ref, refill, retry, pageSize }
) => {
  const key = current?.key ?? null;

  // Where `ms` is: `{ id }` the message to show (the window holds it),
  // `{ newest: true }` nothing that late, null when it could not be read.
  const jump = useCallback(
    async (ms) => {
      if (!current || typeof api.chatPage !== 'function') {
        return null;
      }
      const target = key;
      const asked = telegram ? await askAt(api, current, ms) : {};
      if (!asked || asked.newest) {
        return asked;
      }
      const page = await api.chatPage({
        key: target,
        at: new Date(ms).toISOString(),
        limit: pageSize,
      });
      if (!page) {
        return null;
      }
      const found = asked.id ?? page.target;
      if (!found) {
        return { newest: true };
      }
      const held = ref.current.get(target);
      if (held?.server && held.messages.some((m) => m.id === found)) {
        return { id: found };
      }
      patch(target, () => opened(page));
      return { id: found };
    },
    [api, key, telegram]
  );

  // Message `id` (a link id) shown: the window holds it already, or the
  // page around it replaces what is held; whether it is there.
  const jumpTo = useCallback(
    async (id) => {
      const held = key ? ref.current.get(key) : null;
      if (held?.messages?.some((m) => m.id === id)) {
        return true;
      }
      if (!current || typeof api.chatPage !== 'function') {
        return false;
      }
      const target = key;
      if (telegram) {
        await askAround(api, current, id);
      }
      const page = await api.chatPage({
        key: target,
        around: id,
        limit: pageSize,
      });
      if (!page || page.target !== id) {
        return false;
      }
      patch(target, () => opened(page));
      return true;
    },
    [api, key, telegram]
  );

  const loadNewer = useCallback(async () => {
    const held = key ? ref.current.get(key) : null;
    if (!current || !held?.ceiling || held.loading) {
      return;
    }
    const target = key;
    const ceiling = held.ceiling;
    patch(target, () => ({ loading: true, failed: false }));
    try {
      const after = networkMessageId(ceiling);
      if (telegram && after) {
        const answer = await api.telegramHistory({
          chat: current.chat,
          after,
          limit: pageSize,
          priority: 'view',
        });
        if (!answer || answer.error) {
          throw Object.assign(new Error(answer?.error ?? 'no answer'), {
            retryAfter: answer?.retryAfter,
          });
        }
      }
      const result = await api.chatPage({
        key: target,
        after: ceiling.id,
        limit: pageSize,
      });
      patch(target, (w) => ({
        ...(result && w.ceiling?.id === ceiling.id ? mergeNewer(w, result) : w),
        loading: false,
      }));
      retry.done(target);
    } catch (error) {
      patch(target, () => ({ loading: false, failed: true }));
      retry.later(target, () => loadNewer(), error.retryAfter);
    }
  }, [api, key, telegram]);

  // Back to the newest: what is held goes, the newest page comes again.
  const toNewest = useCallback(() => {
    if (!key) {
      return;
    }
    patch(key, () => ({
      view: (views += 1),
      messages: [],
      more: false,
      ceiling: null,
      server: false,
      loading: false,
      failed: false,
      stalledAt: 0,
    }));
    refill(key);
  }, [key]);

  return { jump, jumpTo, loadNewer, toNewest };
};
