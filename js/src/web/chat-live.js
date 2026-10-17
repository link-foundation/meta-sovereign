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
//   - a failed one stays with its reason and Retry / Delete;
//   - every chat keeps its own unsent draft.

import { useCallback, useEffect, useRef, useState } from 'react';

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

const failure = (result) => ({
  status: 'failed',
  error: result.error ?? result.code ?? 'failed',
  code: result.code ?? null,
  retryAfter: result.retryAfter ?? null,
});

/** The composer: per-chat drafts and an ordered, exactly-once send queue. */
export const useComposer = ({ api, current, after, addLinks, typingOut }) => {
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef({});
  const [pending, setPending] = useState([]);
  const pendingRef = useRef([]);
  const queues = useRef(new Map());
  const key = current?.key ?? null;

  const writeDraft = (chat, next) => {
    draftsRef.current = { ...draftsRef.current, [chat]: next };
    setDrafts(draftsRef.current);
  };
  const mutate = (change) => {
    pendingRef.current = change(pendingRef.current);
    setPending(pendingRef.current);
  };
  const patch = (clientId, fields) =>
    mutate((all) =>
      fields
        ? all.map((p) => (p.clientId === clientId ? { ...p, ...fields } : p))
        : all.filter((p) => p.clientId !== clientId)
    );

  const deliver = async (item) => {
    const result = await sendResult(api, item);
    if (result.status === 'sent' || result.status === 'stored') {
      // The network's links replace the pending bubble in the same render.
      addLinks(result.links ?? [result.link]);
      patch(item.clientId, null);
      if (result.status === 'stored') {
        after({ kind: 'stored' });
      }
      return result;
    }
    patch(item.clientId, failure(result));
    return result;
  };

  // One chat's messages leave one after another, in the order sent.
  const enqueue = (item) => {
    const before = queues.current.get(item.key) ?? Promise.resolve();
    const next = before.then(() => deliver(item));
    queues.current.set(item.key, next);
    return next;
  };

  const send = () => {
    if (!current) {
      return null;
    }
    const body = String(draftsRef.current[key] ?? '').trim();
    if (!body) {
      return null;
    }
    writeDraft(key, '');
    const item = {
      clientId: newClientId(),
      key,
      source: current.source,
      chat: current.chat,
      text: body,
      at: new Date().toISOString(),
      status: 'sending',
    };
    mutate((all) => [...all, item]);
    return enqueue(item);
  };

  /** Send a failed message again — the same one, never a copy. */
  const retry = (clientId) => {
    const item = pendingRef.current.find((p) => p.clientId === clientId);
    if (!item || item.status !== 'failed') {
      return null;
    }
    patch(clientId, { status: 'sending', error: null, code: null });
    return enqueue({ ...item, status: 'sending' });
  };

  /** Forget a failed message (its text goes back to the box if empty). */
  const discard = (clientId) => {
    const item = pendingRef.current.find((p) => p.clientId === clientId);
    if (!item || item.status !== 'failed') {
      return;
    }
    patch(clientId, null);
    if (!draftsRef.current[item.key]) {
      writeDraft(item.key, item.text);
    }
  };

  // Leaving the page with messages still going out would lose them.
  const busy = pending.some((p) => p.status === 'sending');
  useEffect(() => {
    if (!busy || typeof globalThis.addEventListener !== 'function') {
      return undefined;
    }
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    globalThis.addEventListener('beforeunload', warn);
    return () => globalThis.removeEventListener('beforeunload', warn);
  }, [busy]);

  return {
    text: key ? (drafts[key] ?? '') : '',
    // `typed`: the user typed it (not a suggestion chip).
    setText: (next, { typed = false } = {}) => {
      if (!key) {
        return;
      }
      writeDraft(key, next);
      if (next && typed) {
        typingOut();
      }
    },
    send,
    retry,
    discard,
    pending,
    sending: pending.some((p) => p.key === key && p.status === 'sending'),
  };
};
