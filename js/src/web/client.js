/**
 * Offline-first SPA client.
 *
 * Wraps `{ store, server }` so callers can write/read links without
 * caring whether a server is reachable. The contract:
 *
 *   - Every write goes to the *local* store first (durable in
 *     IndexedDB / localStorage) and emits a subscribe event so views
 *     re-render immediately, with no round-trip lag.
 *   - When a server is connected the same write replicates over the
 *     /ws sync transport (vector-clock CRDT — no read-your-write
 *     surprises). Reads on the server are still useful for derived
 *     queries (autocomplete, audience, search) which are computed on
 *     the server side; the client falls back to local equivalents
 *     when offline.
 *
 * The client emits a `mode-change` event when it transitions between
 * "online" (server reachable + sync attached) and "offline" (no
 * server) so the UI can surface a visible badge.
 */

import { createReplyCache } from '../replies/reply-cache.js';
import { createReplyService } from '../replies/reply-service.js';
import { aggregateContacts } from '../server/aggregate.js';
import { createAvailability } from './server-availability.js';
import { createRecoveringRequest } from './request-recovery.js';
import { conversationQuery } from '../crm/conversation-policy.js';

// A read the server has not answered in this long falls back to local.
const READ_TIMEOUT_MS = 30_000;
const timeoutSignal = (ms) => globalThis.AbortSignal?.timeout?.(ms);

// The local links, plus the server's that the local store does not hold
// (the local copy has the user's latest edits).
// A chat page's query: its size, and where it is (R-Y106).
const pageQuery = ({ key, before, after, at, around, limit = 50 }) => {
  const params = new URLSearchParams({ key, limit: String(limit) });
  for (const [name, value] of Object.entries({ before, after, at, around })) {
    if (value) {
      params.set(name, value);
    }
  }
  return params;
};

const withRemote = (local, remote) => {
  if (!Array.isArray(remote) || remote.length === 0) {
    return local;
  }
  const ids = new Set(local.map((link) => link.id));
  return [...local, ...remote.filter((link) => !ids.has(link.id))];
};

const computeAutocomplete = async (store, q, me = 'me') => {
  if (!q) {
    return [];
  }
  const links = await store.query();
  const messages = links.filter(
    (l) => l.id?.startsWith('msg:') && l.sender === me
  );
  const matches = new Map();
  for (const m of messages) {
    const body = String(m.body ?? '');
    if (body.toLowerCase().includes(q.toLowerCase())) {
      matches.set(body, (matches.get(body) ?? 0) + 1);
    }
  }
  return [...matches.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([text, count]) => ({ text, count }));
};

// The same contacts as the server's /api/contacts, from the local store.
const computeContacts = async (store) =>
  aggregateContacts(await store.query(), { people: true });

// `timing` ({ recheckMs, setTimer, clearTimer }) is for tests.
// The browser's copy of the reply index (../replies/reply-cache.js), kept
// by `driver` and brought up to date from the server.
const replyCacheOf = (driver, fetchOrLocal) =>
  createReplyCache({
    driver,
    fetchModel: ({ since }) =>
      fetchOrLocal(
        `/api/suggest/model?${new URLSearchParams({ since })}`,
        () => null
      ),
  });

const suggestParams = ({
  source,
  chat,
  lastMessage,
  typed,
  limit,
  replyTo,
  locale,
  settings,
}) => {
  const params = new URLSearchParams({
    typed,
    limit: String(limit),
    ...conversationQuery(settings),
  });
  for (const [key, value] of Object.entries({
    source,
    chat,
    last: lastMessage,
    replyTo,
    locale,
  })) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return params;
};

const loadDirectory = async (store, fetchOrLocal, { onProgress }) => {
  const [remote, heads] = await Promise.all([
    fetchOrLocal('/links?except=msg:', () => null, { recover: false }),
    fetchOrLocal('/api/chat/heads', () => null, { recover: false }),
  ]);
  if (!Array.isArray(remote) || !Array.isArray(heads)) {
    const local = await store.query().catch(() => []);
    throw Object.assign(new Error('the server did not answer'), {
      local,
      code: 'network',
    });
  }
  const directory = [...remote, ...heads];
  onProgress?.(directory);
  // Let the first card paint before consulting a potentially large browser
  // cache. Server read markers always win over older cached read markers.
  if (onProgress) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  const local = await store.query().catch(() => []);
  return [
    ...new Map(
      [...local, ...directory].map((link) => [link.id, link])
    ).values(),
  ];
};

const localWrites = (store) => ({
  async broadcast({ id, text, networks, body }) {
    const link = {
      id: id ?? `broadcast:${Date.now()}`,
      tokens: ['broadcast'],
      networks,
      body: body ?? text,
    };
    await store.put(link);
    return link;
  },
  async syncProfile(profile) {
    const link = {
      id: `profile:${profile.id ?? 'me'}`,
      tokens: ['profile-sync'],
      ...profile,
    };
    await store.put(link);
    return link;
  },
});

const suggestionCalls = (fetchOrLocal, replies, replyCache) => ({
  replyCache,
  async suggest({
    source,
    chat,
    lastMessage,
    typed = '',
    limit = 8,
    replyTo,
    locale,
    settings,
  } = {}) {
    const params = suggestParams({
      source,
      chat,
      lastMessage,
      typed,
      limit,
      replyTo,
      locale,
      settings,
    });
    return fetchOrLocal(
      `/api/suggest?${params}`,
      () => replies().autocomplete({ source, chat, lastMessage, typed, limit }),
      { recover: false }
    );
  },
});

export const createOfflineClient = ({
  store,
  server,
  replyDriver = null,
  ...timing
}) => {
  const handlers = new Set();
  const emit = (event) => {
    for (const h of handlers) {
      h(event);
    }
  };

  let online = Boolean(server);
  const setOnline = (next) => {
    if (online === next) {
      return;
    }
    online = next;
    emit({ type: 'mode-change', online });
  };

  const watch = createAvailability({
    server: () => server,
    setOnline,
    ...timing,
  });
  const makeRequests = () =>
    createRecoveringRequest({
      fetchImpl: (url, init) => server.fetchImpl(url, init),
      reached: watch.reached,
      failed: watch.failed,
    });
  let requests = makeRequests();

  // The same reply graph as the server's /api/suggest, learned from
  // the local store, for offline use.
  let localReplies = null;
  const replies = () => (localReplies ??= createReplyService({ store }));

  const fetchOrLocal = async (path, fallback, { recover = true } = {}) => {
    if (!server?.fetchImpl || (!online && !recover)) {
      return fallback();
    }
    try {
      // A server that does not answer (busy, stuck) counts as gone.
      const signal = recover ? null : timeoutSignal(READ_TIMEOUT_MS);
      const res = await requests.request(
        `${server.origin}${path}`,
        signal ? { signal } : {},
        { retry: recover, json: true }
      );
      watch.reached();
      if (!res.ok) {
        return fallback();
      }
      return await res.json();
    } catch (error) {
      if (error?.name !== 'AbortError') {
        await watch.failed();
      }
      return fallback();
    }
  };

  const replyCache = replyCacheOf(replyDriver, fetchOrLocal);

  return {
    on: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    isOnline: () => online,
    reached: watch.reached,
    failed: watch.failed,
    close: () => {
      watch.stop();
      requests.stop();
    },
    setServer: (next) => {
      watch.stop();
      requests.stop();
      server = next;
      requests = makeRequests();
      setOnline(Boolean(next));
    },

    // ---- core link operations ----------------------------------------
    async put(link) {
      await store.put(link);
      return link;
    },
    async get(id) {
      return store.get(id);
    },
    async delete(id) {
      return store.delete(id);
    },
    /**
     * Every link: the local store's, plus — when online — the server's
     * (imports, live messages), so views see server-side data. A link
     * held in both comes from the local store, which has the user's
     * latest edits.
     */
    async links() {
      const local = await store.query();
      return withRemote(local, await fetchOrLocal('/links', () => []));
    },

    /** The links whose id starts with `prefix` (local first, as `links`). */
    async linksWithPrefix(prefix) {
      const local = await store.query((link) =>
        String(link.id ?? '').startsWith(prefix)
      );
      const query = new URLSearchParams({ prefix });
      return withRemote(local, await fetchOrLocal(`/links?${query}`, () => []));
    },

    /**
     * What the chat screen needs: every link but messages, plus each
     * chat's newest message — the server's store may hold whole
     * histories, read by page through `chatPage`. Without a server, the
     * local store's links. With one that does not answer (busy, being
     * restarted) it throws, the local links on the error (`local`): the
     * local store holds only a few chats, so a list already shown is kept
     * and the load is tried again rather than shrunk to those.
     */
    chatLinks: (options = {}) =>
      server ? loadDirectory(store, fetchOrLocal, options) : store.query(),
    /** A page of one chat from the server's store; null without one. */
    async chatPage(request) {
      return fetchOrLocal(
        `/api/chat/messages?${pageQuery(request)}`,
        () => null,
        { recover: false }
      );
    },

    // ---- derived queries (server when online, local fallback) ---------
    async autocomplete(q, me = 'me') {
      return fetchOrLocal(
        `/api/autocomplete?q=${encodeURIComponent(q)}&me=${encodeURIComponent(me)}`,
        () => computeAutocomplete(store, q, me),
        { recover: false }
      );
    },
    /**
     * Message-to-message autocomplete: whole replies we used for the
     * chat's last incoming message, then word by word over `typed`.
     */
    ...suggestionCalls(fetchOrLocal, replies, replyCache),
    async contacts() {
      return fetchOrLocal('/api/contacts', () => computeContacts(store));
    },
    async status() {
      return fetchOrLocal(
        '/api/status',
        async () => {
          const links = await store.query();
          return { online, count: links.length };
        },
        { recover: false }
      );
    },

    // ---- DDD: writing a link IS the API ------------------------------
    // Trigger a broadcast by writing a link; the server-side handler
    // (or the in-browser handler bus, when offline) does the actual
    // work and stamps `handledBy`.
    ...localWrites(store),
  };
};

/**
 * The local copy (the page its server serves) follows that server: a
 * server restarted with a new build would otherwise leave an open tab
 * on the old bundle, talking to the new routes, until a manual reload.
 * `check()` asks for the bundle again (a cheap revalidation) and reloads
 * the page when its ETag changed since the page opened.
 */
export const createBuildWatch = ({ bundleUrl, fetchImpl, reload }) => {
  const tagOf = () =>
    fetchImpl(bundleUrl, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.headers.get('etag') : null))
      .catch(() => null);
  let first = tagOf();
  let reloading = false;
  return {
    check: async () => {
      const was = (await first) ?? null;
      const now = await tagOf();
      if (!was) {
        first = Promise.resolve(now);
        return false;
      }
      if (!now || now === was || reloading) {
        return false;
      }
      reloading = true;
      reload();
      return true;
    },
  };
};

// A page that found no server when it opened looks again after these
// waits (the last one repeats), and reloads once one answers.
const LOOK_AGAIN_MS = [5000, 10_000, 20_000, 30_000];

/** Look for a server until one is found; `stop()` ends it. */
export const createRediscovery = ({
  discover,
  found,
  delays = LOOK_AGAIN_MS,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
  events = globalThis,
  document = globalThis.document,
}) => {
  let timer = null;
  let stopped = false;
  let checking = false;
  let attempt = 0;
  const clear = () => {
    clearTimer(timer);
    timer = null;
  };
  const stop = () => {
    stopped = true;
    clear();
    events.removeEventListener?.('focus', wake);
    events.removeEventListener?.('online', wake);
    document?.removeEventListener?.('visibilitychange', visible);
  };
  const check = async () => {
    if (stopped || checking) {
      return;
    }
    clear();
    checking = true;
    const server = await Promise.resolve()
      .then(() => discover())
      .catch(() => null);
    checking = false;
    if (stopped) {
      return;
    }
    if (server) {
      stop();
      found(server);
    } else {
      plan();
    }
  };
  const wake = () => {
    void check();
  };
  const visible = () => {
    if (document?.visibilityState !== 'hidden') {
      wake();
    }
  };
  const plan = () => {
    if (stopped) {
      return;
    }
    const wait = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    timer = setTimer(check, wait);
    timer?.unref?.();
  };
  events.addEventListener?.('focus', wake);
  events.addEventListener?.('online', wake);
  document?.addEventListener?.('visibilitychange', visible);
  plan();
  return { stop, check };
};
