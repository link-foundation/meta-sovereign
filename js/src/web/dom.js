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
import { createAutomationApi } from './automation-api.js';
import { attachWebRtcSync } from './webrtc-sync.js';
import {
  greetingCatalogue,
  loadGreetingSelection,
  planFromStore,
  saveGreetingSelection,
} from '../greetings/plan.js';

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

/**
 * Forget the discovered server so the next API call boots again.
 *
 * Discovery is memoised, which is right for a page that lives as long
 * as its tab (the SPA reloads itself after a manual override is saved,
 * see `applyLocalServerOverride`). Tests need the undo: node runs each
 * test file in its own process, but bun and deno share one module
 * registry across files, so whichever file touched `api` first would
 * otherwise decide the binding for every file after it.
 */
export const resetServerBinding = () => {
  bootPromise = null;
  automationApi = null;
};

const serverResponse = async (path, init) => {
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
  return fetch(url, init).catch(() => null);
};

const serverFetch = async (path, init) => {
  const response = await serverResponse(path, init);
  // "Online" does not mean "implements this route": the Rust backend
  // answers routes it does not have with a 404 and a JSON error body
  // (`docs/SERVER-PARITY.md`), and a proxy in front of it may answer
  // with HTML. Both mean the same thing as being offline, so both
  // return null and let the caller's `??` default take over —
  // otherwise `{error: 'unknown route'}` would reach the screens as
  // if it were data.
  if (!response?.ok) {
    return null;
  }
  return response.json().catch(() => null);
};

/**
 * POST that keeps the server's own answer on an error status — a
 * draft send that the network refused (502) must show *why*. A
 * missing route (`unknown route`, an HTML proxy page) or no server at
 * all still collapses to null, like `serverFetch`.
 */
const serverPostReport = async (path, body) => {
  const response = await serverResponse(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = response ? await response.json().catch(() => null) : null;
  if (!data || data.error === 'unknown route') {
    return null;
  }
  return { ...data, httpStatus: response.status };
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

const postJson = (path, body) =>
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

const jsonInit = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * A write to another service (a message, a post, a profile or CV
 * update). The server first answers 428 with a preview and a single-use
 * token (server/confirmations.js); `ask(answer)` shows that preview to
 * the user and resolves true to go ahead with exactly it. A press on a
 * Send button that shows the very text being sent is itself the
 * confirmation, so such callers pass `() => true`.
 */
export const serverPostConfirmed = async (path, body, ask) => {
  const first = await serverPostReport(path, body);
  if (!first?.needsConfirmation) {
    return first;
  }
  if (!(await ask?.(first))) {
    return { status: 'cancelled', cancelled: true };
  }
  return serverPostReport(path, { ...body, confirmToken: first.confirm.token });
};

/** The server bridge for ./automation-api.js; null means "no server". */
const remote = {
  get: (path) => serverFetch(path),
  post: (path, body) => postJson(path, body),
  report: (path, body) => serverPostReport(path, body),
  confirmed: (path, body, ask) => serverPostConfirmed(path, body, ask),
  put: (path, body) => serverFetch(path, jsonInit('PUT', body)),
  del: (path) => serverFetch(path, { method: 'DELETE' }),
};

let automationApi = null;
const automationCall =
  (name) =>
  async (...args) => {
    const { store } = await ensure();
    automationApi ??= createAutomationApi({ remote, store });
    return automationApi[name](...args);
  };

// Issue #31 / PR #34: automations, their drafts, the composer's send and
// typing status, people, lists and audiences — see ./automation-api.js.
const AUTOMATION_CALLS = [
  'automations',
  'saveAutomation',
  'deleteAutomation',
  'planAutomation',
  'runAutomation',
  'drafts',
  'draftAction',
  'automationHistory',
  'sendMessage',
  'setTyping',
  'typing',
  'people',
  'audiences',
  'saveAudience',
  'deleteAudience',
  'resolveAudience',
  'lists',
  'saveList',
];

/**
 * Offline answer for the greeting calls that need a network adapter:
 * listing stickers live and sending a queued plan (issue #35).
 */
const greetingsOffline = (networks) => ({
  network: (networks ?? []).join(',') || 'all',
  error: 'server-required',
});

export const api = {
  ...Object.fromEntries(AUTOMATION_CALLS.map((n) => [n, automationCall(n)])),
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
  // "Check again" in the browser-only notice (issue #37). A server
  // that appears later needs the full boot (sync, WebRTC), so a hit
  // reloads the page the same way a manual override does.
  rediscover: async ({
    discover = discoverServer,
    reload = () => globalThis.location?.reload?.(),
  } = {}) => {
    const found = await discover({});
    if (found) {
      resetServerBinding();
      reload();
    }
    return Boolean(found);
  },
  // The endpoints below are derived queries that prefer the server
  // (richer source data) but transparently fall back to local store
  // when the server is unreachable.
  autocomplete: async (q, me = 'me') => {
    const { client } = await ensure();
    return client.autocomplete(q, me);
  },
  suggest: async (query) => {
    const { client } = await ensure();
    return client.suggest(query);
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
    // Saved locally (and to the server); never published by itself.
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
  // Publishing the saved profile / CV is a write to other services:
  // `ask(answer)` confirms the networks and fields in `answer.preview`.
  publishProfile: async ({ networks, ask }) =>
    (await serverPostConfirmed('/api/profile/sync', { networks }, ask)) ?? {
      error: 'server required to update other services',
    },
  publishResume: async ({ networks, ask }) =>
    (await serverPostConfirmed('/api/resume/sync', { networks }, ask)) ?? {
      error: 'server required to update other services',
    },
  // `mode: 'queue'` sends: `ask(answer)` confirms `answer.preview`.
  outreach: async ({ query, text, networks, mode = 'preview', ask }) =>
    (mode === 'queue'
      ? await serverPostConfirmed(
          '/api/outreach',
          { query, text, networks, mode },
          ask
        )
      : await serverFetch('/api/outreach', {
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
    (await postJson('/api/cv/read', { platforms, vars })) ?? {
      entries: [],
      failures: [cvOffline(platforms)],
    },
  cvCompare: async ({ platforms, entries, prefer = null } = {}) =>
    (await postJson('/api/cv/compare', { platforms, entries, prefer })) ?? {
      entries: [],
      comparison: { rows: [], plan: [], updates: {}, agreed: 0 },
      diffs: [],
    },
  // A dry run returns `confirm.token` for applying exactly its plan;
  // applying passes it back (`ask` covers an expired token).
  cvSync: async ({
    platforms,
    dryRun = true,
    prefer = null,
    vars = {},
    confirmToken,
    ask,
  } = {}) =>
    (dryRun
      ? await postJson('/api/cv/sync', { platforms, dryRun, prefer, vars })
      : await serverPostConfirmed(
          '/api/cv/sync',
          { platforms, dryRun, prefer, vars, confirmToken },
          ask
        )) ?? {
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
  // Greetings (issue #35). The catalogue, the selection and the plan
  // preview work from the browser store when no server answers; live
  // sticker lists, sends and Telegram thumbnails need the server,
  // which holds the tokens.
  greetingCatalogue: async () =>
    (await serverFetch('/api/greetings/catalogue')) ?? greetingCatalogue(),
  greetingSelection: async () =>
    (await serverFetch('/api/greetings/selection')) ??
    loadGreetingSelection((await ensure()).store),
  saveGreetingSelection: async (selection) =>
    (await serverFetch('/api/greetings/selection', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(selection),
    })) ?? saveGreetingSelection((await ensure()).store, selection),
  greetingStickers: async (networks) =>
    (await postJson('/api/greetings/stickers', { networks })) ?? {
      stickers: [],
      failures: [greetingsOffline(networks)],
    },
  // `run: 'queue'` sends: `ask(answer)` confirms the plan in
  // `answer.preview`, and exactly that plan is sent.
  greetingPlan: async ({ ask, ...options } = {}) => {
    const answer =
      options.run === 'queue'
        ? await serverPostConfirmed('/api/greetings/plan', options, ask)
        : await postJson('/api/greetings/plan', options);
    if (answer) {
      return answer;
    }
    if (options.run === 'queue') {
      return {
        plan: null,
        results: [],
        failures: [greetingsOffline(options.networks)],
      };
    }
    return planFromStore((await ensure()).store, options);
  },
  /** Proxy URL for a Telegram thumbnail, or null without a server. */
  greetingFileUrl: async (fileId) => {
    const { client, origin } = await ensure();
    if (!fileId || !client.isOnline()) {
      return null;
    }
    const path = `/api/greetings/file?id=${encodeURIComponent(fileId)}`;
    return origin ? new URL(path, origin).toString() : path;
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
  // Browser auto-import (local JS server only).
  autoImportStatus: async () =>
    (await serverFetch('/api/auto-import').catch(() => null)) ?? {
      available: false,
      offline: true,
    },
  startAutoImport: async (provider) =>
    (await serverFetch('/api/auto-import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    })) ?? { error: 'server required for auto-import' },
  autoImportJob: async (id) =>
    (await serverFetch(`/api/auto-import/jobs/${encodeURIComponent(id)}`)) ??
    null,
  // Sign-ins from the user's own browsers: scan (counts only), import
  // (explicit), and the macOS Full Disk Access settings pane.
  browserSignIns: async (action, body = {}) =>
    (await serverPostReport(`/api/auto-import/browsers/${action}`, body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for browser sign-ins' },
  // Find the user's own Telegram sign-ins on this computer: scan folders
  // for bot tokens and user sessions, identify the account each belongs
  // to, and connect the chosen one. Masked hints only, never the value.
  telegramSessions: async (action, body = {}) =>
    (await serverPostReport(`/api/auto-import/telegram/${action}`, body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required to find Telegram sessions' },
  // Sign in to a Telegram user account over MTProto: start (send code),
  // code, password (2FA), cancel. Returns { needs } or { done, account }.
  telegramLogin: async (action, body = {}) =>
    (await serverPostReport(
      `/api/auto-import/telegram/login/${action}`,
      body
    ).catch((error) => ({ error: error.message }))) ?? {
      error: 'server required for Telegram login',
    },
  // The connected Telegram account: is one connected, how did the last
  // sync go, and pull now / one chat's history (server only).
  telegramStatus: async () =>
    (await serverFetch('/api/telegram/status').catch(() => null)) ?? {
      connected: false,
      offline: true,
    },
  telegramSync: async (body = {}) =>
    (await serverPostReport('/api/telegram/sync', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for Telegram sync' },
  /**
   * Live link changes from the server (GET /api/events, Server-Sent
   * Events): `onEvent({ type: 'put', link } | { type: 'delete', id })`,
   * `onState('open' | 'closed')`. EventSource reconnects by itself; the
   * caller reloads everything on each 'open' to catch up on what it
   * missed. Returns a stop function; without a server it does nothing.
   */
  events: async (onEvent, onState = () => {}) => {
    const { client, origin } = await ensure();
    const Source = globalThis.EventSource;
    if (!client.isOnline() || typeof Source !== 'function') {
      return () => {};
    }
    const url = origin
      ? new URL('/api/events', origin).toString()
      : '/api/events';
    const source = new Source(url);
    source.addEventListener('ready', () => onState('open'));
    source.addEventListener('link', (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        // A malformed frame: skip it, the next reload fixes the view.
      }
    });
    source.addEventListener('error', () => onState('closed'));
    return () => source.close();
  },
  telegramHistory: async (chat) =>
    (await serverPostReport('/api/telegram/history', { chat }).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for Telegram history' },
  autoImportAction: async (id, action) =>
    (await serverFetch(
      `/api/auto-import/jobs/${encodeURIComponent(id)}/${action}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    )) ?? { error: 'server required for auto-import' },
};
