// A chat window opened far back, as Telegram's apps open a date picked
// in the calendar (R-Y106; learned, never copied): the page around the
// first message on or after that moment replaces what is held, with a
// `ceiling` — the newest message held — so nothing newer shows above a
// gap; scrolling down reads the pages after it (`loadNewer`) until the
// newest is reached and the ceiling goes; the round "down" button goes
// back to the newest at once (`toNewest`).

import { useCallback } from 'react';
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

/**
 * `{ jump(ms), loadNewer(), toNewest() }` for the open chat's window;
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

  return { jump, loadNewer, toNewest };
};
