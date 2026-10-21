// What of the chats the page holds, and what it loads next (R-Y25 ..
// R-Y27). The local server's store keeps every message ever loaded; the
// page holds the chat list (each chat's newest message) and, for the
// open chat, a window of it that grows back as the user scrolls up:
//
//   1. the chat on screen, and what is about to scroll into view — a
//      page is asked for two screens before the top is reached, from the
//      store first and from Telegram only for what it does not have;
//   2. the chat list's next page, before its end scrolls into view;
//   3. a little of every chat that shows in the list (prefetch), one at a
//      time and only for chats never read, so opening one is instant.
//
// Everything Telegram is asked for goes through the server's queue at
// that priority (../sources/telegram-history.js), so what the user looks
// at is never stuck behind the background download.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { byTime, chatMessages, networkMessageId } from './chat-model.js';

export const PAGE_SIZE = 50;
// How far back a jump to a message may load (pages of PAGE_SIZE), and
// how long it waits for a page already coming.
const REACH_PAGES = 40;
const REACH_WAIT_MS = 30_000;
const REACH_POLL_MS = 100;
const pause = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));
export const PREFETCH_SIZE = 30;
const PREFETCH_QUEUE = 40;
const HOLD_MS = 30_000;
// A page that brought nothing older (Telegram not connected yet, or still
// reading) is asked for again only after this long, never at once: an
// open chat must not ask its server hundreds of times a second.
export const STALL_MS = 5000;

const EMPTY = Object.freeze({
  messages: [],
  more: false,
  server: false,
  loading: false,
  failed: false,
  complete: false,
  stalledAt: 0,
});

/** Whether the window waits before asking for older messages again. */
export const isStalled = (window, now = Date.now()) =>
  Boolean(window?.stalledAt) && now - window.stalledAt < STALL_MS;

/**
 * A window after one page of the store arrived: the page joins what is
 * held; `more` (the store has older ones) follows the page only when it
 * reaches further back than the window did.
 */
export const mergePage = (window = EMPTY, result) => {
  const got = result?.messages ?? [];
  const byId = new Map(window.messages.map((m) => [m.id, m]));
  for (const message of got) {
    byId.set(message.id, message);
  }
  const messages = [...byId.values()].sort(byTime);
  const first = window.messages[0];
  const reachesBack = !first || (got.length > 0 && byTime(got[0], first) <= 0);
  return {
    ...window,
    messages,
    more: reachesBack ? Boolean(result?.more) : window.more,
    server: true,
  };
};

const historyId = (chat) => `history:telegram:${chat}`;

/** Whether the store holds a Telegram chat back to its first message. */
export const historyComplete = (links = [], chat) =>
  Boolean(links.find((l) => l?.id === historyId(chat))?.complete);

/**
 * The open chat's messages: the links the page holds and its window,
 * from the window's oldest message on (an older one that arrived by
 * itself — an edit — would otherwise show above a gap).
 */
export const windowMessages = (links = [], key, window, options = {}) => {
  if (!window?.server) {
    return chatMessages(links, key, options);
  }
  const held = new Set(links.map((l) => l?.id));
  const all = chatMessages(
    [...links, ...window.messages.filter((m) => !held.has(m.id))],
    key,
    options
  );
  const floor = window.messages[0];
  return floor ? all.filter((m) => m.pending || byTime(m, floor) >= 0) : all;
};

/** Whether older messages can be loaded: from the store or Telegram. */
export const hasOlder = (window, { telegram, complete }) =>
  Boolean(window?.server) &&
  (window.more || (telegram && !complete && !window.complete));

const isTelegram = (api, chat) =>
  chat?.source === 'telegram' && typeof api.telegramHistory === 'function';

// A newest page that did not come (the server busy, a moment offline)
// is asked again after these waits, while the chat stays open.
const REFILL_DELAYS_MS = [2000, 5000, 10_000, 20_000, 30_000];

/**
 * `refill(target)`: the chat's newest page (`newest(target)`, null when
 * it did not come), asked again after REFILL_DELAYS_MS while
 * `isOpen(target)`. `stop()` drops a planned try.
 */
export const createRefill = ({
  newest,
  isOpen,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
}) => {
  let timer = null;
  const stop = () => {
    clearTimer(timer);
    timer = null;
  };
  const refill = (target, attempt = 0) => {
    stop();
    return newest(target)
      .catch(() => null)
      .then((result) => {
        if (result || attempt >= REFILL_DELAYS_MS.length) {
          return;
        }
        timer = setTimer(() => {
          timer = null;
          return isOpen(target) ? refill(target, attempt + 1) : null;
        }, REFILL_DELAYS_MS[attempt]);
      });
  };
  return { refill, stop };
};

// What failed is asked again by itself, as Telegram's apps do (R-Y96):
// after the wait Telegram asked for, else 1 s doubling up to 30 s. The
// spinner stays meanwhile; nothing says it failed.
const RETRY_MAX_MS = 30_000;
export const retryDelay = (tries, retryAfter) =>
  Math.max(
    (Number(retryAfter) || 0) * 1000,
    Math.min(1000 * 2 ** tries, RETRY_MAX_MS)
  );

// `later(target, run, retryAfter)` runs `run` again while `target` is
// open; `done(target)` starts the next failure's wait from 1 s.
const useRetry = (key) => {
  const open = useRef(key);
  open.current = key;
  const tries = useRef(new Map());
  const timers = useRef(new Map());
  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        globalThis.clearTimeout(timer);
      }
    },
    []
  );
  const later = useCallback((target, run, retryAfter) => {
    const count = tries.current.get(target) ?? 0;
    tries.current.set(target, count + 1);
    globalThis.clearTimeout(timers.current.get(target));
    timers.current.set(
      target,
      globalThis.setTimeout(
        () => {
          timers.current.delete(target);
          if (open.current === target) {
            run();
          }
        },
        retryDelay(count, retryAfter)
      )
    );
  }, []);
  const done = useCallback((target) => tries.current.delete(target), []);
  return { later, done };
};

// The opened chat: its newest page from the store, and Telegram asked
// for what the store lacks — again and again until it answers.
const useOpenChat = (
  api,
  current,
  { supported, refill, retry, patch, newest }
) => {
  const key = current?.key ?? null;
  useEffect(() => {
    if (!current || !supported) {
      return;
    }
    const target = current.key;
    const chat = current.chat;
    refill(target);
    if (!isTelegram(api, current)) {
      return;
    }
    // Asks Telegram only when the store does not have it; again and
    // again until it answers.
    const ask = () =>
      api
        .telegramHistory({ chat, limit: PAGE_SIZE, priority: 'view' })
        .catch(() => null)
        .then((result) => {
          if (!result || result.error) {
            retry.later(target, ask, result?.retryAfter);
            return null;
          }
          retry.done(target);
          if (result.complete) {
            patch(target, () => ({ complete: true }));
          }
          return result.written > 0 ? newest(target) : null;
        });
    ask();
  }, [api, key]);
};

const useRefill = (newest, key) => {
  const open = useRef(key);
  open.current = key;
  const refiller = useMemo(
    () => createRefill({ newest, isOpen: (target) => open.current === target }),
    [newest]
  );
  useEffect(() => () => refiller.stop(), [refiller]);
  return refiller.refill;
};

// A stalled window may ask again once STALL_MS has passed.
const useStallEnd = (key, stalledAt, patch) => {
  useEffect(() => {
    if (!stalledAt || !key) {
      return undefined;
    }
    const timer = globalThis.setTimeout(
      () =>
        patch(key, (w) => (w.stalledAt === stalledAt ? { stalledAt: 0 } : {})),
      STALL_MS
    );
    return () => globalThis.clearTimeout(timer);
  }, [key, stalledAt, patch]);
};

/**
 * The open chat's window: its newest page when it opens, older pages on
 * `loadOlder()`. Without a server (offline, the static site), none — the
 * chat shows what the page holds.
 */
export const useChatWindow = (api, current, links, tick = 0) => {
  const [windows, setWindows] = useState(() => new Map());
  const ref = useRef(windows);
  ref.current = windows;
  const patch = useCallback((key, change) => {
    setWindows((before) => {
      const next = new Map(before);
      const now = before.get(key) ?? EMPTY;
      next.set(key, { ...now, ...change(now) });
      ref.current = next;
      return next;
    });
  }, []);
  const key = current?.key ?? null;
  const supported = typeof api.chatPage === 'function';

  const newest = useCallback(
    async (target) => {
      const result = await api.chatPage({ key: target, limit: PAGE_SIZE });
      if (result) {
        patch(target, (w) => mergePage(w, result));
      }
      return result;
    },
    [api, patch]
  );
  const refill = useRefill(newest, key);
  const retry = useRetry(key);

  useOpenChat(api, current, { supported, refill, retry, patch, newest });

  // The page reconnected or the store caught up (a restart, a sync):
  // what the store got meanwhile came with no event, so the open chat's
  // newest page is read again, joining what is held.
  const seenTick = useRef(tick);
  useEffect(() => {
    if (seenTick.current === tick) {
      return;
    }
    seenTick.current = tick;
    if (key && supported) {
      refill(key);
    }
  }, [tick]);

  const complete =
    Boolean(current) && historyComplete(links ?? [], current.chat);
  const window = key ? (windows.get(key) ?? EMPTY) : EMPTY;
  const telegram = isTelegram(api, current);

  const older = async (target, chat, held) => {
    const oldest = held.messages[0];
    if (!held.more && telegram) {
      const answer = await api.telegramHistory({
        chat,
        before: networkMessageId(oldest),
        limit: PAGE_SIZE,
        priority: 'view',
      });
      if (!answer || answer.error) {
        throw Object.assign(new Error(answer?.error ?? 'no answer'), {
          retryAfter: answer?.retryAfter,
        });
      }
      patch(target, () => ({ complete: Boolean(answer.complete) }));
    }
    const result = await api.chatPage({
      key: target,
      before: oldest?.id ?? null,
      limit: PAGE_SIZE,
    });
    patch(target, (w) => {
      const next = result ? mergePage(w, result) : w;
      const grew = next.messages[0]?.id !== w.messages[0]?.id;
      return {
        ...next,
        loading: false,
        failed: !result,
        stalledAt: grew ? 0 : Date.now(),
      };
    });
  };

  const loadOlder = useCallback(async () => {
    const held = key ? ref.current.get(key) : null;
    if (
      !current ||
      !held ||
      held.loading ||
      isStalled(held) ||
      !hasOlder(held, { telegram, complete })
    ) {
      return;
    }
    const target = key;
    patch(target, () => ({ loading: true, failed: false }));
    try {
      await older(target, current.chat, held);
      retry.done(target);
    } catch (error) {
      patch(target, () => ({ loading: false, failed: true }));
      retry.later(target, () => latestLoadOlder.current(), error.retryAfter);
    }
  }, [api, key, telegram, complete]);
  const latestLoadOlder = useRef(loadOlder);
  latestLoadOlder.current = loadOlder;

  // Load older pages until message `id` is held (a mention far back,
  // R-Y55; a match of a search, R-Y98); whether it is. A page already
  // coming (the user scrolled) is waited for, not taken as the end.
  const reach = useCallback(
    async (id) => {
      const until = Date.now() + REACH_WAIT_MS;
      for (let page = 0; page < REACH_PAGES; page += 1) {
        const held = key ? ref.current.get(key) : null;
        if (!held || held.messages?.some((m) => m.id === id)) {
          return Boolean(held);
        }
        if (held.loading && Date.now() < until) {
          await pause(REACH_POLL_MS);
          page -= 1;
          continue;
        }
        if (
          held.loading ||
          isStalled(held) ||
          !hasOlder(held, { telegram, complete })
        ) {
          return false;
        }
        patch(key, () => ({ loading: true, failed: false }));
        try {
          await older(key, current.chat, held);
        } catch {
          patch(key, () => ({ loading: false, failed: true }));
          return false;
        }
      }
      return false;
    },
    [api, key, telegram, complete]
  );

  useStallEnd(key, window.stalledAt, patch);

  return {
    window,
    older: hasOlder(window, { telegram, complete }),
    stalled: Boolean(window.stalledAt),
    loading: window.loading,
    failed: window.failed,
    loadOlder,
    reach,
  };
};

const knownChats = (links) =>
  new Set(
    links
      .filter((l) => l?.id?.startsWith('history:telegram:'))
      .map((l) => String(l.chat))
  );

/**
 * `prefetch(chat)` for every chat that shows in the list: a few of its
 * newest messages are read into the store, one chat at a time, newest
 * request first, only for chats never read. Telegram's "wait" pauses it.
 */
export const usePrefetch = (api, links, { now = () => Date.now() } = {}) => {
  const asked = useRef(new Set());
  const queue = useRef([]);
  const busy = useRef(false);
  const holdUntil = useRef(0);
  const timer = useRef(null);
  const known = useMemo(() => knownChats(links ?? []), [links]);
  const knownRef = useRef(known);
  knownRef.current = known;
  const supported = typeof api.telegramHistory === 'function';

  const pump = useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    try {
      while (queue.current.length > 0) {
        const wait = holdUntil.current - now();
        if (wait > 0) {
          globalThis.clearTimeout(timer.current);
          timer.current = globalThis.setTimeout(() => pump(), wait);
          return;
        }
        const chat = queue.current.pop();
        if (knownRef.current.has(chat)) {
          continue;
        }
        const answer = await api
          .telegramHistory({
            chat,
            limit: PREFETCH_SIZE,
            priority: 'prefetch',
          })
          .catch(() => null);
        if (!answer || answer.error) {
          const seconds = Number(answer?.retryAfter) || 0;
          holdUntil.current = now() + Math.max(seconds * 1000, HOLD_MS);
          asked.current.delete(chat);
        }
      }
    } finally {
      busy.current = false;
    }
  }, [api]);

  useEffect(() => () => globalThis.clearTimeout(timer.current), []);

  return useCallback(
    (chat) => {
      if (
        !supported ||
        chat?.source !== 'telegram' ||
        asked.current.has(chat.chat) ||
        knownRef.current.has(chat.chat)
      ) {
        return;
      }
      asked.current.add(chat.chat);
      queue.current.push(chat.chat);
      // Chats that scrolled past long ago wait for another look.
      for (const dropped of queue.current.splice(
        0,
        Math.max(0, queue.current.length - PREFETCH_QUEUE)
      )) {
        asked.current.delete(dropped);
      }
      pump();
    },
    [api, pump]
  );
};

/**
 * `more()` reads the chat list's next page (once at a time) while the
 * account says there is one; the new chats arrive by the event stream.
 */
export const useMoreChats = (api, telegram, refresh) => {
  const busy = useRef(false);
  const available =
    typeof api.telegramDialogs === 'function' &&
    telegram?.connected &&
    telegram.kind === 'user' &&
    telegram.dialogsComplete !== true;
  const more = useCallback(async () => {
    if (!available || busy.current) {
      return;
    }
    busy.current = true;
    try {
      const answer = await api.telegramDialogs({ priority: 'list' });
      if (answer?.written > 0) {
        refresh?.();
      }
    } catch {
      // The next look at the list's end asks again.
    } finally {
      busy.current = false;
    }
  }, [api, available]);
  return { more, available: Boolean(available) };
};
