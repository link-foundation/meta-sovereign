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

const computeContacts = async (store) => {
  const links = await store.query();
  const seen = new Map();
  for (const l of links) {
    if (!l.id?.startsWith('msg:') || !l.sender || l.sender === 'me') {
      continue;
    }
    const key = `${l.source ?? '?'}:${l.sender}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].map(([id, count]) => ({ id, count }));
};

export const createOfflineClient = ({ store, server }) => {
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

  const fetchOrLocal = async (path, fallback) => {
    if (!online || !server?.fetchImpl) {
      return fallback();
    }
    try {
      const res = await server.fetchImpl(`${server.origin}${path}`);
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      return await res.json();
    } catch {
      // Server flapped — degrade gracefully and let the caller
      // see local data instead of a thrown error.
      setOnline(false);
      return fallback();
    }
  };

  return {
    on: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    isOnline: () => online,
    setServer: (next) => {
      server = next;
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
    async links() {
      return store.query();
    },

    // ---- derived queries (server when online, local fallback) ---------
    async autocomplete(q, me = 'me') {
      return fetchOrLocal(
        `/api/autocomplete?q=${encodeURIComponent(q)}&me=${encodeURIComponent(me)}`,
        () => computeAutocomplete(store, q, me)
      );
    },
    async contacts() {
      return fetchOrLocal('/api/contacts', () => computeContacts(store));
    },
    async status() {
      return fetchOrLocal('/api/status', async () => {
        const links = await store.query();
        return { online: false, count: links.length };
      });
    },

    // ---- DDD: writing a link IS the API ------------------------------
    // Trigger a broadcast by writing a link; the server-side handler
    // (or the in-browser handler bus, when offline) does the actual
    // work and stamps `handledBy`.
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
  };
};
