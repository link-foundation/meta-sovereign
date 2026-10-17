// The live half of the chat screen: links that update the moment the
// server learns something (its /api/events stream), and a composer that
// behaves like a messenger's —
//
//   - Send takes the text out of the box at once (a second Enter or a
//     double click finds nothing to send), so one press is one message;
//   - each message gets a `clientId`; the server sends one id at most once
//     and Telegram drops a repeated `random_id`, so a retry never posts
//     twice;
//   - messages of a chat go out one after another, in order, each shown
//     with a clock until it is sent, then ✓, then ✓✓ once read;
//   - a failure that passes by itself is tried again by itself; one that
//     does not stays with its reason and Retry / Delete (./chat-outbox.js);
//   - the queue and every chat's unsent draft survive a reload, and a
//     Telegram chat's draft follows the one on the user's other devices.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DRAFTS_KEY,
  OUTBOX_KEY,
  afterFailure,
  cascade,
  keptDrafts,
  nextToSend,
  readSaved,
  requeueFailed,
  restoreOutbox,
  waitsForNetwork,
  writeSaved,
} from './chat-outbox.js';

const BATCH_MS = 80;

/** Apply `{ type: 'put', link } | { type: 'delete', id }` events. */
export const applyLinkEvents = (links, events = []) => {
  if (!links || events.length === 0) {
    return links;
  }
  const byId = new Map(links.map((l) => [l.id, l]));
  for (const event of events) {
    if (event?.type === 'delete' && event.id) {
      byId.delete(event.id);
    } else if (event?.type === 'put' && event.link?.id) {
      byId.set(event.link.id, event.link);
    }
  }
  return [...byId.values()];
};

/**
 * All links, loaded on each `tick` and kept current by the server's event
 * stream. Events that arrive while a load is in flight are applied again
 * on top of its answer, so none is lost to the reload. Each time the
 * stream (re)opens, `refresh()` reloads once to catch up on what was
 * missed while it was closed.
 */
export const useLiveLinks = (api, tick, refresh) => {
  const [links, setLinks] = useState(null);
  const [live, setLive] = useState(false);
  const during = useRef(null); // events seen while a load runs
  const buffer = useRef([]);
  const timer = useRef(null);

  useEffect(() => {
    let current = true;
    const seen = [];
    during.current = seen;
    Promise.resolve()
      .then(() => api.links())
      .then(
        (next) => {
          if (current && next !== undefined) {
            setLinks(applyLinkEvents(next, seen));
          }
        },
        () => {}
      )
      .finally(() => {
        if (during.current === seen) {
          during.current = null;
        }
      });
    return () => {
      current = false;
    };
  }, [api, tick]);

  const flush = useCallback(() => {
    timer.current = null;
    const batch = buffer.current.splice(0);
    during.current?.push(...batch);
    setLinks((before) => applyLinkEvents(before, batch));
  }, []);

  /** Take events now (batched, so a burst renders once). */
  const push = useCallback(
    (events) => {
      buffer.current.push(...events);
      timer.current ??= globalThis.setTimeout(flush, BATCH_MS);
    },
    [flush]
  );

  useEffect(() => {
    if (typeof api.events !== 'function') {
      return undefined;
    }
    let stop = () => {};
    let stopped = false;
    Promise.resolve(
      api.events(
        (event) => push([event]),
        (state) => {
          setLive(state === 'open');
          if (state === 'open') {
            refresh();
          }
        }
      )
    ).then(
      (close) => {
        if (stopped) {
          close?.();
        } else {
          stop = close ?? stop;
        }
      },
      () => {}
    );
    return () => {
      stopped = true;
      stop();
      globalThis.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [api, push]);

  /**
   * Links we got another way (a send's answer) show at once — in the
   * same render that drops their pending bubble, so nothing flickers.
   */
  const add = useCallback(
    (list = []) => {
      buffer.current.push(
        ...list.filter(Boolean).map((link) => ({ type: 'put', link }))
      );
      flush();
    },
    [flush]
  );
  return { links, live, add };
};

let counter = 0;
const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `c${Date.now().toString(36)}${(counter += 1)}${Math.random().toString(36).slice(2)}`;

// One send's answer; a thrown error is a failure like any other.
const sendResult = async (api, item) => {
  try {
    const result = await api.sendMessage({
      source: item.source,
      chat: item.chat,
      text: item.text,
      clientId: item.clientId,
    });
    return result ?? { status: 'failed', code: 'no-answer' };
  } catch (error) {
    return { status: 'failed', error: error.message };
  }
};

const isOffline = () => globalThis.navigator?.onLine === false;

const listen = (target, event, fn) => {
  if (typeof target?.addEventListener !== 'function') {
    return () => {};
  }
  target.addEventListener(event, fn);
  return () => target.removeEventListener(event, fn);
};

/**
 * The send queue: every chat's messages in order, each `queued`,
 * `sending`, `waiting` (to be tried again at `retryAt`) or `failed`.
 * Saved in the browser on every change and resumed on load.
 */
const useOutbox = ({ api, addLinks, after, storage }) => {
  const [items, setItems] = useState(() =>
    restoreOutbox(readSaved(OUTBOX_KEY, [], storage))
  );
  const ref = useRef(items);
  const timers = useRef(new Map());
  const [kept, setKept] = useState(true);
  const live = useRef(true);

  const mutate = (change) => {
    ref.current = change(ref.current);
    setKept(writeSaved(OUTBOX_KEY, ref.current, storage));
    setItems(ref.current);
  };
  const patch = (clientId, change) =>
    mutate((all) =>
      change
        ? all.map((p) => (p.clientId === clientId ? change(p) : p))
        : all.filter((p) => p.clientId !== clientId)
    );

  const deliver = async (item) => {
    const result = await sendResult(api, item);
    if (!live.current) {
      return result;
    }
    if (result.status === 'sent' || result.status === 'stored') {
      // The network's links replace the pending bubble in the same render.
      addLinks(result.links ?? [result.link]);
      patch(item.clientId, null);
      if (result.status === 'stored') {
        after({ kind: 'stored' });
      }
    } else {
      const next = afterFailure(item, result);
      patch(item.clientId, () => next);
      if (next.status === 'failed') {
        mutate((all) => cascade(all, next));
      }
    }
    return result;
  };

  // Send a chat's next message, or wake up when it may be tried again.
  const pump = (key) => {
    globalThis.clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    if (!live.current || isOffline()) {
      return null; // the `online` event pumps again
    }
    const next = nextToSend(ref.current, key);
    if (next?.wait !== undefined) {
      timers.current.set(
        key,
        globalThis.setTimeout(() => pump(key), next.wait)
      );
      return null;
    }
    if (!next?.item) {
      return null;
    }
    patch(next.item.clientId, (p) => ({ ...p, status: 'sending' }));
    return deliver(next.item).then((result) => {
      pump(key);
      return result;
    });
  };
  const pumpAll = () => {
    for (const key of new Set(ref.current.map((p) => p.key))) {
      pump(key);
    }
  };

  useEffect(() => {
    live.current = true;
    pumpAll(); // what the last visit left
    // Back online: what waited for the network goes now.
    const stop = listen(globalThis, 'online', () => {
      mutate((all) =>
        all.map((p) => (waitsForNetwork(p) ? { ...p, retryAt: 0 } : p))
      );
      pumpAll();
    });
    return () => {
      live.current = false;
      stop();
      for (const timer of timers.current.values()) {
        globalThis.clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, [api]);

  const find = (clientId) => ref.current.find((p) => p.clientId === clientId);
  return {
    items,
    kept,
    add: (item) => {
      mutate((all) => [...all, item]);
      return pump(item.key);
    },
    /** Send a failed message again — the same one, never a copy. */
    retry: (clientId) => {
      const item = find(clientId);
      if (item?.status !== 'failed') {
        return null;
      }
      patch(clientId, (p) => requeueFailed([p], p.key)[0]);
      return pump(item.key);
    },
    /** Do not wait: try a waiting message now. */
    retryNow: (clientId) => {
      const item = find(clientId);
      if (item?.status !== 'waiting') {
        return null;
      }
      patch(clientId, (p) => ({ ...p, retryAt: 0 }));
      return pump(item.key);
    },
    resendAll: (key) => {
      mutate((all) => requeueFailed(all, key));
      return pump(key);
    },
    remove: (clientId) => {
      const item = find(clientId);
      if (!item || item.status === 'sending') {
        return null;
      }
      patch(clientId, null);
      pump(item.key);
      return item;
    },
    removeFailed: (key) =>
      mutate((all) =>
        all.filter((p) => !(p.key === key && p.status === 'failed'))
      ),
  };
};

const DRAFT_SAVE_MS = 400;
const CLOUD_DRAFT_MS = 2500;

/**
 * Every chat's unsent text, kept in the browser; a Telegram chat's also
 * saved to Telegram (so the phone shows it) and taken from there when
 * the user wrote it on another device and has not typed here since.
 */
const useDraftBox = ({ api, current, cloud, storage }) => {
  const [drafts, setDrafts] = useState(() =>
    keptDrafts(readSaved(DRAFTS_KEY, {}, storage))
  );
  const ref = useRef(drafts);
  const saveTimer = useRef(null);
  const cloudTimer = useRef(null);
  const cloudSeen = useRef({}); // chat key → the cloud text last seen
  const key = current?.key ?? null;

  const save = () => {
    globalThis.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    writeSaved(DRAFTS_KEY, keptDrafts(ref.current), storage);
  };
  const toCloud = (chat) => {
    globalThis.clearTimeout(cloudTimer.current);
    cloudTimer.current = null;
    if (
      chat?.source !== 'telegram' ||
      typeof api.telegramDraft !== 'function'
    ) {
      return;
    }
    const text = String(ref.current[chat.key] ?? '');
    if (text.trim() === String(cloudSeen.current[chat.key] ?? '').trim()) {
      return;
    }
    cloudSeen.current[chat.key] = text;
    api.telegramDraft({ chat: chat.chat, text }).catch(() => {});
  };

  const write = (chatKey, next, { local = true } = {}) => {
    ref.current = { ...ref.current, [chatKey]: next };
    setDrafts(ref.current);
    saveTimer.current ??= globalThis.setTimeout(save, DRAFT_SAVE_MS);
    if (local && current?.key === chatKey) {
      globalThis.clearTimeout(cloudTimer.current);
      cloudTimer.current = globalThis.setTimeout(
        () => toCloud(current),
        CLOUD_DRAFT_MS
      );
    }
  };

  // A draft from another device: taken only over an empty box or the
  // text this one took from there before (what the user typed wins).
  useEffect(() => {
    if (!key || cloud === undefined || cloud === null) {
      return;
    }
    const seen = cloudSeen.current[key];
    cloudSeen.current[key] = cloud;
    const local = String(ref.current[key] ?? '');
    if (cloud !== seen && (!local.trim() || local === seen)) {
      write(key, cloud, { local: false });
    }
  }, [key, cloud]);

  // Leaving a chat or the page: save now.
  useEffect(() => {
    const chat = current;
    const flush = () => {
      if (cloudTimer.current) {
        toCloud(chat);
      }
      save();
    };
    const stop = listen(globalThis, 'pagehide', flush);
    return () => {
      stop();
      flush();
    };
  }, [key]);

  return {
    text: key ? (drafts[key] ?? '') : '',
    get: (chatKey) => String(ref.current[chatKey] ?? ''),
    write,
    // Sent: the box is empty here, and Telegram cleared its own copy
    // (the send carries `clear_draft`).
    sent: (chatKey) => {
      cloudSeen.current[chatKey] = '';
      globalThis.clearTimeout(cloudTimer.current);
      cloudTimer.current = null;
      write(chatKey, '', { local: false });
    },
  };
};

/**
 * The composer: per-chat drafts and an ordered, exactly-once send queue.
 *   typing   { start(), cancel() } — our "typing…" to the other side
 *   cloud    the current chat's draft on Telegram (its read link)
 */
export const useComposer = ({
  api,
  current,
  after,
  addLinks,
  typing = { start: () => {}, cancel: () => {} },
  cloud,
  storage,
}) => {
  const outbox = useOutbox({ api, addLinks, after, storage });
  const box = useDraftBox({ api, current, cloud, storage });
  const key = current?.key ?? null;

  const send = () => {
    if (!current) {
      return null;
    }
    const body = box.get(key).trim();
    if (!body) {
      return null;
    }
    box.sent(key);
    typing.cancel();
    return outbox.add({
      clientId: newClientId(),
      key,
      source: current.source,
      chat: current.chat,
      text: body,
      at: new Date().toISOString(),
      status: 'queued',
      attempts: 0,
    });
  };

  /** Forget a message not sent (its text goes back to an empty box). */
  const discard = (clientId) => {
    const item = outbox.remove(clientId);
    if (item && !box.get(item.key).trim()) {
      box.write(item.key, item.text, { local: false });
    }
  };

  // A page closing with messages going out keeps them only when the
  // browser saved the queue; otherwise ask before leaving.
  const busy = !outbox.kept && outbox.items.some((p) => p.status !== 'failed');
  useEffect(() => {
    if (!busy) {
      return undefined;
    }
    return listen(globalThis, 'beforeunload', (event) => {
      event.preventDefault();
      event.returnValue = '';
    });
  }, [busy]);

  const mine = outbox.items.filter((p) => p.key === key);
  return {
    text: box.text,
    // `typed`: the user typed it (not a suggestion chip).
    setText: (next, { typed = false } = {}) => {
      if (!key) {
        return;
      }
      box.write(key, next);
      if (typed && next) {
        typing.start();
      } else if (typed) {
        typing.cancel();
      }
    },
    send,
    retry: outbox.retry,
    retryNow: outbox.retryNow,
    discard,
    resendAll: () => outbox.resendAll(key),
    deleteAll: () => outbox.removeFailed(key),
    pending: outbox.items,
    failed: mine.filter((p) => p.status === 'failed').length,
    sending: mine.some((p) => p.status !== 'failed'),
  };
};
