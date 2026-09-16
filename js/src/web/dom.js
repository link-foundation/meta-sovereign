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
import { attachWebRtcSync } from './webrtc-sync.js';

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
  // When a server is reachable, also open a WebRTC peer sync over its
  // /rtc broker so writes propagate browser-to-browser without the
  // server relaying every byte (R-J7). Best-effort: a missing
  // RTCPeerConnection (older browsers) just skips this path.
  const rtc = discovered
    ? attachWebRtcSync({ store, origin: discovered.origin })
    : null;
  return { store, bus, client, rtc, origin: discovered?.origin ?? null };
};

const ensure = () => {
  if (!bootPromise) {
    bootPromise = boot();
  }
  return bootPromise;
};

const serverFetch = async (path, init) => {
  const { client, origin } = await ensure();
  if (!client.isOnline()) {
    return null;
  }
  // The discovered origin is not always the page's own origin: the
  // SPA on GitHub Pages (or opened from a file) talks to a server on
  // 127.0.0.1, so a relative path would hit the page's host instead
  // of the server. `new URL` keeps same-origin deployments unchanged
  // and points cross-origin ones at the backend the client is using.
  const url = origin ? new URL(path, origin).toString() : path;
  // "Online" does not mean "implements this route": the Rust backend
  // answers routes it does not have with a 404 and a JSON error body
  // (`docs/SERVER-PARITY.md`), and a proxy in front of it may answer
  // with HTML. Both mean the same thing as being offline, so both
  // return null and let the caller's `??` default take over —
  // otherwise `{error: 'unknown route'}` would reach the screens as
  // if it were data.
  const response = await fetch(url, init).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  return response.json().catch(() => null);
};

let patternWorker = null;
let patternSeq = 0;
const patternPending = new Map();

const matchPatternLocal = (pattern, flags = 'i', messages = []) => {
  try {
    const regex = new RegExp(pattern, flags);
    const matches = messages
      .map((m) => (typeof m === 'string' ? m : String(m?.body ?? '')))
      .filter((text) => regex.test(text));
    return { count: matches.length, matches, engine: 'js' };
  } catch (err) {
    return { count: 0, matches: [], engine: 'js', error: err.message };
  }
};

const getPatternWorker = () => {
  if (typeof globalThis.Worker === 'undefined') {
    return null;
  }
  if (patternWorker) {
    return patternWorker;
  }
  patternWorker = new globalThis.Worker(
    new URL('./pattern-worker.js', import.meta.url),
    {
      type: 'module',
    }
  );
  patternWorker.onmessage = (event) => {
    const { id, ok, error, ...result } = event.data ?? {};
    const pending = patternPending.get(id);
    if (!pending) {
      return;
    }
    patternPending.delete(id);
    if (ok) {
      pending.resolve(result);
    } else {
      pending.reject(new Error(error ?? 'pattern worker failed'));
    }
  };
  patternWorker.onerror = (event) => {
    const error = new Error(event.message ?? 'pattern worker failed');
    for (const pending of patternPending.values()) {
      pending.reject(error);
    }
    patternPending.clear();
    patternWorker?.terminate();
    patternWorker = null;
  };
  return patternWorker;
};

const matchPattern = async (pattern, flags, messages) => {
  const worker = getPatternWorker();
  if (!worker) {
    return matchPatternLocal(pattern, flags, messages);
  }
  try {
    return await new Promise((resolve, reject) => {
      const id = (patternSeq += 1);
      patternPending.set(id, { resolve, reject });
      worker.postMessage({ id, pattern, flags, messages });
    });
  } catch {
    return matchPatternLocal(pattern, flags, messages);
  }
};

const cvPost = (path, body) =>
  serverFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Offline answer shared by every live CV call. */
const cvOffline = (platforms) => ({
  platform: (platforms ?? []).join(',') || 'all',
  code: 'server-required',
  message: 'the local server drives the browser for CV reads and writes',
});

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
  matchPattern,
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
  outreach: async ({ query, text, networks, mode = 'preview' }) =>
    (await serverFetch('/api/outreach', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, text, networks, mode }),
    })) ?? { audience: [], plan: [], note: 'server required for outreach' },
  // ---- CV synchronisation (issue #29) -----------------------------
  // Reading a live profile needs a browser, which only the local
  // server has; offline the SPA still shows the catalogue, the stored
  // snapshots it holds and a clear "server required" answer.
  cvPlatforms: async () => (await serverFetch('/api/cv/platforms')) ?? [],
  cvPlan: async (platform) =>
    (await serverFetch(
      `/api/cv/plan?platform=${encodeURIComponent(platform)}`
    )) ?? null,
  cvStored: async (platforms = []) =>
    (await serverFetch(
      `/api/cv/stored${platforms.length ? `?platforms=${encodeURIComponent(platforms.join(','))}` : ''}`
    )) ?? { entries: [] },
  cvRead: async ({ platforms, vars = {} } = {}) =>
    (await cvPost('/api/cv/read', { platforms, vars })) ?? {
      entries: [],
      failures: [cvOffline(platforms)],
    },
  cvCompare: async ({ platforms, entries, prefer = null } = {}) =>
    (await cvPost('/api/cv/compare', { platforms, entries, prefer })) ?? {
      entries: [],
      comparison: { rows: [], plan: [], updates: {}, agreed: 0 },
      diffs: [],
    },
  cvSync: async ({ platforms, dryRun = true, prefer = null, vars = {} } = {}) =>
    (await cvPost('/api/cv/sync', { platforms, dryRun, prefer, vars })) ?? {
      dryRun,
      actions: [],
      applied: [],
      entries: [],
      failures: [cvOffline(platforms)],
    },
  cvTelemetry: async ({
    runId = null,
    platform = null,
    type = null,
    limit = 200,
  } = {}) => {
    const search = new URLSearchParams({ limit: String(limit) });
    for (const [key, value] of Object.entries({ runId, platform, type })) {
      if (value) {
        search.set(key, value);
      }
    }
    return (
      (await serverFetch(`/api/cv/telemetry?${search}`)) ?? {
        runs: [],
        events: [],
      }
    );
  },
  listBackups: async () => (await serverFetch('/api/backups')) ?? [],
  createBackup: async ({ passphrase = null, keep } = {}) =>
    (await serverFetch('/api/backups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase, ...(keep ? { keep } : {}) }),
    })) ?? { error: 'server required for backups' },
  restoreBackup: async (file, passphrase = null) =>
    (await serverFetch('/api/backups/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file, passphrase }),
    })) ?? { error: 'server required for restore' },
};
