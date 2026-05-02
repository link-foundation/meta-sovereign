// Tiny DOM helper used across views, plus the API surface used by
// every view. The API is a thin shim over an offline-first client
// (see ./client.js): it tries the discovered server first, and falls
// back to the local browser store when offline.

import {
  createBrowserStore,
  pickBrowserDriver,
} from '../storage/browser-store.js';
import { discoverServer } from './discover.js';
import { createOfflineClient } from './client.js';
import { createHandlerBus, broadcastHandler } from '../handlers/index.js';

export const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') {
      for (const [evt, fn] of Object.entries(v)) {
        el.addEventListener(evt, fn);
      }
    } else if (k === 'class') {
      el.className = v;
    } else if (k === 'value') {
      el.value = v;
    } else if (v !== false && v !== null && v !== undefined) {
      el.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) {
      continue;
    }
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
};

let bootPromise = null;

const localBroadcast = async (networks, body) =>
  (networks ?? []).map((n) => ({ network: n, queued: true, body }));

const boot = async () => {
  const store = await createBrowserStore({ driver: pickBrowserDriver() });
  // Local handler bus so writes to broadcast:* trigger work even
  // when the SPA is fully offline.
  const bus = createHandlerBus(store);
  const built = broadcastHandler({ broadcast: localBroadcast });
  bus.register('broadcast', built.selector, built.run);

  const discovered = await discoverServer({});
  const server = discovered
    ? {
        origin: discovered.origin,
        fetchImpl: globalThis.fetch.bind(globalThis),
      }
    : null;
  const client = createOfflineClient({ store, server });
  return { store, bus, client };
};

const ensure = () => {
  if (!bootPromise) {
    bootPromise = boot();
  }
  return bootPromise;
};

const serverFetch = async (path, init) => {
  const { client } = await ensure();
  if (!client.isOnline()) {
    return null;
  }
  // Re-derive origin from the discovery cycle inside client.
  // For brevity we lean on the client's `status()` to prove liveness
  // and on globalThis.fetch for the actual call. Same-origin SPAs
  // will resolve relative paths correctly without an explicit origin.
  return fetch(path, init).then((r) => r.json());
};

export const api = {
  links: async () => {
    const { client } = await ensure();
    return client.links();
  },
  get: async (id) => {
    const { client } = await ensure();
    return client.get(id);
  },
  put: async (link) => {
    const { client } = await ensure();
    return client.put(link);
  },
  del: async (id) => {
    const { client } = await ensure();
    return client.delete(id);
  },
  status: async () => {
    const { client } = await ensure();
    return client.status();
  },
  isOnline: async () => {
    const { client } = await ensure();
    return client.isOnline();
  },
  on: async (handler) => {
    const { client } = await ensure();
    return client.on(handler);
  },
  // The endpoints below are derived queries that prefer the server
  // (richer source data) but transparently fall back to local store
  // when the server is unreachable.
  autocomplete: async (q, me = 'me') => {
    const { client } = await ensure();
    return client.autocomplete(q, me);
  },
  contacts: async () => {
    const { client } = await ensure();
    return client.contacts();
  },
  broadcast: async (text, networks) => {
    const { client } = await ensure();
    return client.broadcast({ text, networks });
  },
  // ---- thin server passthroughs (work only when online) -----------
  // These derive from richer server-side data (sources, patterns,
  // etc.). When offline they short-circuit to safe defaults so the
  // UI does not crash; views display "server required" cues elsewhere.
  sources: async () => (await serverFetch('/sources')) ?? [],
  patterns: async () => (await serverFetch('/api/patterns')) ?? [],
  putPattern: async (p) =>
    (await serverFetch('/api/patterns', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
    })) ?? p,
  inferRegex: async (examples, mode = 'simple') =>
    (await serverFetch('/api/patterns/infer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ examples, mode }),
    })) ?? { regex: '', flags: 'i' },
  graphs: async () => (await serverFetch('/api/graphs')) ?? [],
  saveGraph: async (g) =>
    (await serverFetch('/api/graphs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(g),
    })) ?? g,
  runGraph: async (id, message, mode = 'semi') =>
    (await serverFetch('/api/graphs/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, message, mode }),
    })) ?? [],
  replies: async () => (await serverFetch('/api/replies')) ?? [],
  putReply: async (g) =>
    (await serverFetch('/api/replies', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(g),
    })) ?? g,
  audience: async (q) =>
    (await serverFetch(`/api/audience?q=${encodeURIComponent(q)}`)) ?? [],
  facts: async () => (await serverFetch('/api/facts')) ?? [],
  search: async (q) =>
    (await serverFetch(`/api/search?q=${encodeURIComponent(q)}`)) ?? [],
  profile: async () => (await serverFetch('/api/profile')) ?? null,
  putProfile: async (p) => {
    const { client } = await ensure();
    // Profile updates flow through the store too so the offline
    // handler bus could resync later.
    await client.syncProfile(p);
    return (
      (await serverFetch('/api/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p),
      })) ?? p
    );
  },
  resume: async () => (await serverFetch('/api/resume')) ?? null,
  putResume: async (p) =>
    (await serverFetch('/api/resume', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(p),
    })) ?? p,
};
