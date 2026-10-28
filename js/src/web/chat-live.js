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

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { chatFeedFor } from './chat-feed.js';
export { applyLinkEvents } from './chat-feed.js';
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
import { sendAsField } from './chat-send-as.js';
import { useEditMode } from './chat-edit-mode.js';
import { traceClient } from './client-log.js';
import { READ_RECOVERED_EVENT } from './read-retry.js';
import { OutboxContext } from './outbox-context.js';
import { activeAccount } from './telegram-account-scope.js';

/** Shared directory: reopening a view shows its last good snapshot immediately. */
export const useLiveLinks = (api, tick) => {
  const feed = useMemo(() => chatFeedFor(api), [api]);
  const snapshot = useSyncExternalStore(
    feed.subscribe,
    feed.snapshot,
    feed.snapshot
  );
  useEffect(() => {
    feed.refresh();
  }, [feed, tick]);
  useEffect(() => feed.follow(), [feed]);
  const add = useCallback(
    (list = []) => {
      feed.push(list.filter(Boolean).map((link) => ({ type: 'put', link })));
    },
    [feed]
  );
  return { ...snapshot, add, retry: feed.refresh };
};

let counter = 0;
const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `c${Date.now().toString(36)}${(counter += 1)}${Math.random().toString(36).slice(2)}`;

// What the link preview's bar chose, as a send carries it (R-Y145).
const previewOf = (item) =>
  Object.fromEntries(
    ['noWebpage', 'invertMedia', 'previewUrl', 'previewSize']
      .filter((key) => item[key])
      .map((key) => [key, item[key]])
  );

// One send's answer; a thrown error is a failure like any other.
const sendTrace = (item) => ({
  source: item.source,
  chat: item.chat,
  clientId: item.clientId,
  replyTo: item.replyTo ?? 0,
  quoted: Boolean(item.replyQuote),
  attempt: item.attempts ?? 0,
});
const recordSendResult = (api, trace, result) =>
  traceClient(api, 'send_result', {
    ...trace,
    success: result?.status === 'sent' || result?.status === 'stored',
    code: result?.code ?? result?.status ?? 'no-answer',
  });
const sendResult = async (api, item) => {
  const trace = sendTrace(item);
  traceClient(api, 'send_start', trace);
  try {
    const result = await api.sendMessage({
      source: item.source,
      chat: item.chat,
      text: item.text,
      clientId: item.clientId,
      ...(item.replyTo ? { replyTo: item.replyTo } : {}),
      ...(item.replyQuote ? { replyQuote: item.replyQuote } : {}),
      ...(item.topic ? { topic: item.topic } : {}),
      ...(item.silent ? { silent: true } : {}),
      ...(item.scheduleDate ? { scheduleDate: item.scheduleDate } : {}),
      ...(item.sendAs ? { sendAs: item.sendAs } : {}),
      ...(item.effect ? { effect: item.effect } : {}),
      ...previewOf(item),
    });
    recordSendResult(api, trace, result);
    return result ?? { status: 'failed', code: 'no-answer' };
  } catch (error) {
    traceClient(api, 'send_result', {
      ...trace,
      success: false,
      code: 'network',
    });
    return {
      status: 'failed',
      code: error?.code ?? 'network',
      error: error.message,
    };
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
export const useOutboxQueue = (
  { api, addLinks, after, storage },
  enabled = true
) => {
  const account = activeAccount();
  const storageKey =
    account === 1 ? OUTBOX_KEY : `${OUTBOX_KEY}@telegram-${account}`;
  const [items, setItems] = useState(() =>
    restoreOutbox(readSaved(storageKey, [], storage))
  );
  const ref = useRef(items);
  const timers = useRef(new Map());
  const [kept, setKept] = useState(true);
  const live = useRef(true);

  const mutate = (change) => {
    ref.current = change(ref.current);
    setKept(writeSaved(storageKey, ref.current, storage));
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
    if (!enabled) {
      return undefined;
    }
    live.current = true;
    pumpAll(); // what the last visit left
    // Back online: what waited for the network goes now.
    const resume = () => {
      mutate((all) =>
        all.map((p) => (waitsForNetwork(p) ? { ...p, retryAt: 0 } : p))
      );
      pumpAll();
    };
    const stop = listen(globalThis, 'online', resume);
    const stopRecovered = listen(globalThis, READ_RECOVERED_EVENT, resume);
    return () => {
      live.current = false;
      stop();
      stopRecovered();
      for (const timer of timers.current.values()) {
        globalThis.clearTimeout(timer);
      }
      timers.current.clear();
    };
  }, [api, enabled]);

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

const useOutbox = (options) => {
  const shared = useContext(OutboxContext);
  const local = useOutboxQueue(options, !shared);
  return shared ?? local;
};

const DRAFT_SAVE_MS = 400;
const CLOUD_DRAFT_MS = 2500;

/**
 * Every chat's unsent text, kept in the browser; a Telegram chat's also
 * saved to Telegram (so the phone shows it) and taken from there when
 * the user wrote it on another device and has not typed here since.
 *
 * The text is not React state of the screen: a keystroke re-renders
 * only what `subscribe`s to it (the box, its suggestions), not the chat
 * list and the messages (R-Y71).
 */
const useDraftBox = ({ api, current, cloud, storage }) => {
  const ref = useRef(null);
  ref.current ??= keptDrafts(readSaved(DRAFTS_KEY, {}, storage));
  const listeners = useRef(new Set());
  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);
  const saveTimer = useRef(null);
  const cloudTimer = useRef(null);
  const cloudSeen = useRef({}); // chat key → the cloud text last seen
  const key = current?.key ?? null;
  // While a message is edited, its text is no draft: not for Telegram,
  // and what is kept on this device is the draft put away, `{ key, stash }`.
  const quiet = useRef(false);

  const save = () => {
    globalThis.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const held = quiet.current;
    const drafts = held?.key
      ? { ...ref.current, [held.key]: held.stash }
      : ref.current;
    writeSaved(DRAFTS_KEY, keptDrafts(drafts), storage);
  };
  const toCloud = (chat) => {
    globalThis.clearTimeout(cloudTimer.current);
    cloudTimer.current = null;
    if (
      quiet.current ||
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
    for (const listener of listeners.current) {
      listener();
    }
    saveTimer.current ??= globalThis.setTimeout(save, DRAFT_SAVE_MS);
    if (local && !quiet.current && current?.key === chatKey) {
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
    text: () => (key ? (ref.current[key] ?? '') : ''),
    subscribe,
    get: (chatKey) => String(ref.current[chatKey] ?? ''),
    quiet,
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

// The optional fields of a message going out, those set alone.
const outFields = (fields) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value));

/**
 * The composer: per-chat drafts and an ordered, exactly-once send queue.
 *   typing   { start(), cancel() } — our "typing…" to the other side
 *   cloud    the current chat's draft on Telegram (its read link)
 *   topic    the forum topic open (R-Y122): what is sent goes there
 */
export const useComposer = ({
  api,
  current,
  topic,
  after,
  addLinks,
  typing = { start: () => {}, cancel: () => {} },
  cloud,
  storage,
}) => {
  const outbox = useOutbox({ api, addLinks, after, storage });
  const box = useDraftBox({ api, current, cloud, storage });
  const key = current?.key ?? null;
  // replyTo: { msgId, senderName, text } set by Reply action; cleared on send.
  const [replyTargets, setReplyTargets] = useState({});
  const replyTo = replyTargets[key] ?? null;
  const setReplyTo = (reply) => {
    setReplyTargets((before) => ({ ...before, [key]: reply }));
    traceClient(api, reply ? 'reply_selected' : 'reply_cleared', {
      chat: current?.chat,
      source: current?.source,
      replyTo: reply?.msgId ?? 0,
      quoted: Boolean(reply?.quoteText),
    });
  };
  // The link preview bar's choice for the next send (R-Y145).
  const previewChoice = useRef(null);
  // Editing a message in the box (R-Y146).
  const edit = useEditMode({
    api,
    box,
    key,
    preview: previewChoice,
    report: (answer) =>
      answer?.error && after?.({ kind: 'action-failed', error: answer.error }),
  });

  // `silent`: without sound; `scheduleDate` (unix seconds): Telegram
  // sends it then (R-Y102).
  // `effect` (R-Y149): a message effect's id, a decimal string.
  const send = ({
    silent = false,
    scheduleDate = null,
    effect = null,
  } = {}) => {
    if (!current) {
      return null;
    }
    // Enter while editing saves the edit.
    if (edit.save()) {
      return null;
    }
    const body = box.get(key).trim();
    if (!body) {
      return null;
    }
    box.sent(key);
    typing.cancel();
    const preview = previewChoice.current ?? {};
    previewChoice.current = null;
    const replyId = replyTo?.msgId ?? null;
    const quote = replyId ? (replyTo?.quoteText ?? null) : null;
    setReplyTo(null);
    return outbox.add({
      clientId: newClientId(),
      key,
      source: current.source,
      chat: current.chat,
      text: body,
      at: new Date().toISOString(),
      status: 'queued',
      attempts: 0,
      ...outFields({ replyTo: replyId, replyQuote: quote, topic }),
      ...outFields({ silent, scheduleDate, effect }),
      ...sendAsField(current.chat),
      ...preview,
    });
  };

  // Words sent as they are, the box's text left (a bot's keyboard
  // button, R-Y110); `replyTo` a network message id.
  const say = (words, { replyTo: answer = null } = {}) => {
    const body = String(words ?? '').trim();
    if (!current || !body) {
      return null;
    }
    return outbox.add({
      clientId: newClientId(),
      key,
      source: current.source,
      chat: current.chat,
      text: body,
      at: new Date().toISOString(),
      status: 'queued',
      attempts: 0,
      ...(answer ? { replyTo: answer } : {}),
      ...(topic ? { topic } : {}),
      ...sendAsField(current.chat),
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
    // The current chat's text, read when asked (not a render's copy).
    get text() {
      return box.text();
    },
    // For a component that shows the text: called on every change.
    subscribe: box.subscribe,
    // `typed`: the user typed it (not a suggestion chip).
    setText: (next, { typed = false } = {}) => {
      if (!key) {
        return;
      }
      box.write(key, next);
      if (typed && next && !edit.editing) {
        typing.start();
      } else if (typed) {
        typing.cancel();
      }
    },
    send,
    say,
    retry: outbox.retry,
    retryNow: outbox.retryNow,
    discard,
    resendAll: () => outbox.resendAll(key),
    deleteAll: () => outbox.removeFailed(key),
    pending: outbox.items,
    failed: mine.filter((p) => p.status === 'failed').length,
    sending: mine.some((p) => p.status !== 'failed'),
    replyTo,
    topic,
    setReplyTo: (msg) => setReplyTo(msg),
    clearReplyTo: () => setReplyTo(null),
    editing: edit.editing,
    startEdit: edit.start,
    cancelEdit: edit.cancel,
    setPreviewChoice: (choice) => {
      previewChoice.current = choice;
    },
  };
};
