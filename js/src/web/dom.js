// Tiny DOM helper used across views, plus the API surface used by
// every view. The API is a thin shim over an offline-first client
// (see ./client.js): it tries the discovered server first, and falls
// back to the local browser store when offline.

import {
  createBrowserStore,
  pickBrowserDriver,
  pickSnapshotDriver,
} from '../storage/browser-store.js';
import {
  discoverServer,
  findServerByPicture,
  mayNeedPicture,
} from './discover.js';
import {
  createBuildWatch,
  createOfflineClient,
  createRediscovery,
} from './client.js';
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

/**
 * A server this page can see but not use (Safari keeps an https page
 * from http://127.0.0.1, R-Y60): found by its picture, `{ origin,
 * localUi }`, or null. The page stays where it is; the browser-only
 * notice offers the server's own copy as a link.
 */
export const findNearbyServer = async ({
  may = mayNeedPicture,
  find = findServerByPicture,
} = {}) => (may() ? find().catch(() => null) : null);

const localBroadcast = async (networks, body) =>
  (networks ?? []).map((n) => ({ network: n, queued: true, body }));

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

// The local copy keeps up with its server (R-Y65): the server back with
// a new build reloads it (`check()` on every return), and a copy opened
// while its server was down looks for it again.
const followServer = (client, origin) => {
  const here = globalThis.location?.origin ?? '';
  const reload = () => globalThis.location?.reload?.();
  if (!origin) {
    if (LOOPBACK.test(here)) {
      createRediscovery({ discover: () => discoverServer({}), found: reload });
    }
    return null;
  }
  if (origin !== here || typeof globalThis.fetch !== 'function') {
    return null;
  }
  const watch = createBuildWatch({
    bundleUrl: new URL('./app.min.js', globalThis.location.href).toString(),
    fetchImpl: globalThis.fetch.bind(globalThis),
    reload,
  });
  client.on((event) => {
    if (event.type === 'mode-change' && event.online) {
      watch.check();
    }
  });
  return watch;
};

const boot = async () => {
  const store = await createBrowserStore({ driver: pickBrowserDriver() });
  // Local handler bus so writes to broadcast:* trigger work even
  // when the SPA is fully offline.
  const bus = createHandlerBus(store);
  const built = broadcastHandler({ broadcast: localBroadcast });
  bus.register('broadcast', built.selector, built.run);

  const discovered = await discoverServer({});
  // Looked for meanwhile; the app does not wait for it.
  const nearby = discovered ? Promise.resolve(null) : findNearbyServer();
  const server = discovered
    ? {
        origin: discovered.origin,
        fetchImpl: globalThis.fetch.bind(globalThis),
      }
    : null;
  const client = createOfflineClient({
    store,
    server,
    replyDriver: pickSnapshotDriver('meta-sovereign:reply-model'),
  });
  // When a server is reachable, also open a WebRTC peer sync over its
  // /rtc broker so writes propagate browser-to-browser without the
  // server relaying every byte (R-J7). Best-effort: a missing
  // RTCPeerConnection (older browsers) just skips this path.
  const rtc = discovered
    ? attachWebRtcSync({ store, origin: discovered.origin })
    : null;
  return {
    store,
    bus,
    client,
    rtc,
    nearby,
    origin: discovered?.origin ?? null,
    follow: followServer(client, discovered?.origin ?? null),
  };
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

// A request that left but got no answer (the server stopped, the
// connection dropped): not "offline", a failure worth trying again.
const NO_ANSWER = Object.freeze({
  ok: false,
  status: 0,
  json: async () => ({
    status: 'failed',
    code: 'network',
    error: 'no answer from the local server',
  }),
});

const serverResponse = async (path, init, { network = false } = {}) => {
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
  return fetch(url, init).catch(() => (network ? NO_ANSWER : null));
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
const serverPostReport = async (path, body, options) => {
  const response = await serverResponse(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    options
  );
  const data = response ? await response.json().catch(() => null) : null;
  if (!data || data.error === 'unknown route') {
    return null;
  }
  return { ...data, httpStatus: response.status };
};

// One file's bytes to the server (R-Y99), with how far it got: fetch
// cannot say that of an upload, XMLHttpRequest can. Resolves to the
// server's answer, `{ error }` when it refused, null when there is no
// server.
const uploadFile = async (file, { onProgress, signal } = {}) => {
  const { client, origin } = await ensure();
  if (!client.isOnline() || typeof globalThis.XMLHttpRequest !== 'function') {
    return null;
  }
  const name = encodeURIComponent(file?.name || 'file');
  const path = `/api/telegram/upload?name=${name}`;
  const url = origin ? new URL(path, origin).toString() : path;
  return new Promise((resolve) => {
    const xhr = new globalThis.XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onload = () => {
      const data = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return null;
        }
      })();
      resolve(
        data ? { ...data, httpStatus: xhr.status } : { error: 'upload failed' }
      );
    };
    xhr.onerror = () => resolve({ error: 'upload failed', code: 'network' });
    xhr.onabort = () => resolve({ error: 'cancelled', code: 'cancelled' });
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
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
export const serverPostConfirmed = async (path, body, ask, options) => {
  const first = await serverPostReport(path, body, options);
  if (!first?.needsConfirmation) {
    return first;
  }
  if (!(await ask?.(first))) {
    return { status: 'cancelled', cancelled: true };
  }
  return serverPostReport(
    path,
    { ...body, confirmToken: first.confirm.token },
    options
  );
};

/** The server bridge for ./automation-api.js; null means "no server". */
const remote = {
  get: (path) => serverFetch(path),
  post: (path, body) => postJson(path, body),
  report: (path, body) => serverPostReport(path, body),
  // `{ network: true }`: a request that got no answer comes back as
  // `{ status: 'failed', code: 'network' }` instead of null ("no server").
  confirmed: (path, body, ask, options) =>
    serverPostConfirmed(path, body, ask, options),
  put: (path, body) => serverFetch(path, jsonInit('PUT', body)),
  del: (path) => serverFetch(path, { method: 'DELETE' }),
};

// A Telegram action that needs the server.
const telegramPost = async (name, body) =>
  (await serverPostReport(`/api/telegram/${name}`, body).catch((error) => ({
    error: error.message,
  }))) ?? { error: 'server required' };

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
  'nextDraft',
  'resetEdit',
  'autopilots',
  'autopilot',
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
  linksWithPrefix: async (prefix) => {
    const { client } = await ensure();
    return client.linksWithPrefix(prefix);
  },
  chatLinks: async () => {
    const { client } = await ensure();
    return client.chatLinks();
  },
  chatPage: async (request) => {
    const { client } = await ensure();
    return client.chatPage(request);
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
      return true;
    }
    return false;
  },
  // A server found by its picture only (Safari), or null.
  nearby: async () => (await ensure()).nearby,
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
  // The browser's copy of the reply index (../replies/reply-cache.js).
  replyCache: async () => (await ensure()).client.replyCache,
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
    const { client, origin, follow } = await ensure();
    const Source = globalThis.EventSource;
    if (!client.isOnline() || typeof Source !== 'function') {
      return () => {};
    }
    const url = origin
      ? new URL('/api/events', origin).toString()
      : '/api/events';
    const source = new Source(url);
    source.addEventListener('ready', () => {
      onState('open');
      // Opened again after the server restarted: maybe a new build.
      follow?.check();
    });
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
  // Mark a chat read up to a message on Telegram, and save its draft
  // there, so the phone and other apps show the same.
  telegramRead: async ({ chat, maxId, topic }) =>
    (await serverPostReport('/api/telegram/read', {
      chat,
      maxId,
      ...(topic ? { topic } : {}),
    }).catch((error) => ({ error: error.message }))) ?? {
      error: 'server required',
    },
  // A forum group's topics (R-Y122): { chat } → { ok, forum, topics }.
  telegramForumTopics: ({ chat }) => telegramPost('forum-topics', { chat }),
  telegramDraft: async ({ chat, text }) =>
    (await serverPostReport('/api/telegram/draft', { chat, text }).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required' },
  // A chat's newest messages, or the page before message `before`; the
  // server answers from the store when it has them (`cached`).
  telegramHistory: async (request) =>
    (await serverPostReport(
      '/api/telegram/history',
      typeof request === 'object' ? request : { chat: request }
    ).catch((error) => ({ error: error.message }))) ?? {
      error: 'server required for Telegram history',
    },
  // The first message on a date and a page around it (R-Y106):
  // { chat, date } (unix seconds) → { ok, id, newest }; or message `id`
  // and a page around it (R-Y107): { chat, id } → { ok, id, newest }.
  telegramHistoryAt: async (body = {}) =>
    (await serverPostReport('/api/telegram/history-at', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for Telegram history' },
  // The next page of the chat list.
  telegramDialogs: async ({ priority = 'list' } = {}) =>
    (await serverPostReport('/api/telegram/dialogs', { priority }).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for Telegram dialogs' },
  autoImportAction: async (id, action) =>
    (await serverFetch(
      `/api/auto-import/jobs/${encodeURIComponent(id)}/${action}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }
    )) ?? { error: 'server required for auto-import' },

  // One link as the server's store holds it (a reply's original that
  // the page does not hold), or null.
  storedLink: async (id) =>
    (await serverFetch(`/links/${encodeURIComponent(id)}`).catch(() => null)) ??
    null,

  // Re-read specific messages (e.g. those stored before raw existed).
  telegramRefresh: async (body = {}) =>
    (await serverPostReport('/api/telegram/refresh', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for refresh' },

  // Forward messages to another chat.
  telegramForward: async (body = {}) =>
    (await serverPostReport('/api/telegram/forward', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for forward' },

  // Delete messages; revoke=true deletes for everyone.
  telegramDelete: async (body = {}) =>
    (await serverPostReport('/api/telegram/delete', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for delete' },

  // Pin or unpin a message (unpin, oneSide, silent as Telegram has them).
  telegramPin: async (body = {}) =>
    (await serverPostReport('/api/telegram/pin', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for pin' },

  // The chat list's menu (R-Y97): { chat, action, for? } — pin, unpin,
  // mute (for seconds, 0 for good), unmute, archive, unarchive, read,
  // unread, unmark.
  telegramDialog: async (body = {}) =>
    (await serverPostReport('/api/telegram/dialog', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for the chat list menu' },

  // Search in one chat (R-Y98): { chat, q, offsetId? } → { ids, count,
  // more }, newest first; the messages found are stored.
  // Across Telegram (R-Y107): { q } → { ok, peers }; { q, cursor? } →
  // { ok, messages, count, more, cursor }.
  telegramSearchPeers: async (body = {}) =>
    (await serverPostReport('/api/telegram/search-peers', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for search' },
  telegramSearchGlobal: async (body = {}) =>
    (await serverPostReport('/api/telegram/search-global', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for search' },
  telegramSearch: async (body = {}) =>
    (await serverPostReport('/api/telegram/search', body).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for search' },

  // A chat's shared media (R-Y111): how many of each kind → { ok,
  // counts }; a kind's page → { ok, messages, count, more, last }.
  telegramSharedCounts: async (chat) =>
    (await serverPostReport('/api/telegram/shared-counts', { chat }).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for shared media' },
  telegramSharedMedia: async (body = {}) =>
    (await serverPostReport('/api/telegram/shared-media', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for shared media' },

  // Clear, delete or leave a chat (R-Y100): { chat, action: 'clear' |
  // 'delete' | 'leave', revoke? } → { ok, deleted }.
  telegramRemoveChat: async (body = {}) =>
    (await serverPostReport('/api/telegram/remove-chat', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for the chat list menu' },

  // A chat's scheduled messages (R-Y102): { chat } → { ok, links };
  // sent now, deleted ({ chat, ids }), moved ({ chat, id, date }).
  telegramFolders: (body = {}) => telegramPost('folders', body),
  // Stickers and saved GIFs (R-Y105): the panel's lists ({ fresh }),
  // a set's stickers ({ id }), one sent ({ chat, id, replyTo, silent,
  // scheduleDate, clientId }).
  telegramStickers: (body = {}) => telegramPost('stickers', body),
  telegramStickerSet: (body = {}) => telegramPost('sticker-set', body),
  telegramGifs: (body = {}) => telegramPost('gifs', body),
  // Stickers ({ q, lang }) and GIFs ({ q, offset }) searched (R-Y112).
  telegramStickerSearch: (body = {}) => telegramPost('sticker-search', body),
  telegramEmojiKeywords: (body = {}) => telegramPost('emoji-keywords', body),
  telegramInviteCheck: (body = {}) => telegramPost('invite-check', body),
  telegramInviteJoin: (body = {}) => telegramPost('invite-join', body),
  telegramInviteRevoke: (body = {}) => telegramPost('invite-revoke', body),
  telegramComments: (body = {}) => telegramPost('comments', body),
  telegramCommentSend: (body = {}) => telegramPost('comment-send', body),
  telegramCommentsRead: (body = {}) => telegramPost('comments-read', body),
  // Who read a message ({ chat, id }), who reacted ({ chat, id, emoji?,
  // offset? }) (R-Y127).
  telegramReaders: (body = {}) => telegramPost('readers', body),
  telegramTranslate: (body = {}) => telegramPost('translate', body),
  telegramBotCommands: (body = {}) => telegramPost('bot-commands', body),
  // Inline bots in the message box (R-Y138).
  telegramInlineBot: (body = {}) => telegramPost('inline-bot', body),
  telegramInlineResults: (body = {}) => telegramPost('inline-results', body),
  telegramInlineSend: (body = {}) => telegramPost('inline-send', body),
  telegramInlineStartBot: (body = {}) => telegramPost('inline-start-bot', body),
  // The message box's link preview, and its picture (R-Y145).
  telegramLinkPreview: (body = {}) => telegramPost('link-preview', body),
  telegramLinkPreviewPhotoUrl: async ({ id } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !/^\d{1,20}$/.test(String(id ?? ''))) {
      return null;
    }
    const path = `/api/telegram/link-preview-photo?id=${id}`;
    return origin ? new URL(path, origin).toString() : path;
  },
  telegramReactors: (body = {}) => telegramPost('reactors', body),
  // New groups and channels, a chat's info edited (R-Y129).
  telegramChatContacts: () => telegramPost('chat-contacts', {}),
  telegramGroupCreate: (body = {}) => telegramPost('group-create', body),
  telegramChannelCreate: (body = {}) => telegramPost('channel-create', body),
  telegramChatEdit: (body = {}) => telegramPost('chat-edit', body),
  // A group's permissions, slow mode and recent actions (R-Y133).
  telegramChatPermissions: (body = {}) =>
    telegramPost('chat-permissions', body),
  telegramChatPermissionsSet: (body = {}) =>
    telegramPost('chat-permissions-set', body),
  telegramSlowMode: (body = {}) => telegramPost('slow-mode', body),
  telegramAdminLog: (body = {}) => telegramPost('admin-log', body),
  // A chat's auto-delete timer, Saved Messages by chat (R-Y143).
  telegramHistoryTtl: (body = {}) => telegramPost('history-ttl', body),
  telegramSavedDialogs: (body = {}) => telegramPost('saved-dialogs', body),
  telegramSavedHistory: (body = {}) => telegramPost('saved-history', body),
  telegramSavedDelete: (body = {}) => telegramPost('saved-delete', body),
  // Viewing stories (R-Y140): the strip, one peer's, seen up to an id,
  // and a story's picture or video.
  telegramStories: (body = {}) => telegramPost('stories', body),
  telegramStoriesPeer: (body = {}) => telegramPost('stories-peer', body),
  telegramStoriesRead: (body = {}) => telegramPost('stories-read', body),
  telegramStoryUrl: async ({ peer, id } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !peer || !id) {
      return null;
    }
    const path = `/api/telegram/story?peer=${encodeURIComponent(peer)}&id=${encodeURIComponent(id)}`;
    return origin ? new URL(path, origin).toString() : path;
  },
  // The user's own profile (R-Y136).
  telegramProfile: () => telegramPost('profile', {}),
  telegramProfileSave: (body = {}) => telegramPost('profile-save', body),
  telegramUsernameCheck: (body = {}) => telegramPost('username-check', body),
  telegramUsernameSave: (body = {}) => telegramPost('username-save', body),
  telegramProfilePhoto: (body = {}) => telegramPost('profile-photo', body),
  // Privacy and security (R-Y139).
  telegramPrivacy: () => telegramPost('privacy', {}),
  telegramPrivacySet: (body = {}) => telegramPost('privacy-set', body),
  telegramAuthorizations: () => telegramPost('sessions', {}),
  telegramSessionTerminate: (body = {}) =>
    telegramPost('session-terminate', body),
  telegramSessionsTerminateOthers: () =>
    telegramPost('sessions-terminate-others', {}),
  telegramBlocked: (body = {}) => telegramPost('blocked', body),
  telegramUnblock: (body = {}) => telegramPost('unblock', body),
  // A group's members ({ chat, q, offset, limit }) and one removed
  // ({ chat, user }) (R-Y125).
  telegramMembers: (body = {}) => telegramPost('members', body),
  telegramMemberRemove: (body = {}) => telegramPost('member-remove', body),
  // Block, contacts and report (R-Y128).
  telegramPeerBlock: (body = {}) => telegramPost('peer-block', body),
  telegramPeerContact: (body = {}) => telegramPost('peer-contact', body),
  telegramPeerReport: (body = {}) => telegramPost('peer-report', body),
  telegramPeerReportSpam: (body = {}) => telegramPost('peer-report-spam', body),
  // The bar over a chat with a stranger (R-Y137).
  // The message effects Telegram offers (R-Y149).
  telegramEffects: (body = {}) => telegramPost('effects', body),
  telegramSendAs: (body = {}) => telegramPost('send-as', body),
  telegramSendAsSave: (body = {}) => telegramPost('send-as-save', body),
  telegramPeerSettings: (body = {}) => telegramPost('peer-settings', body),
  telegramPeerHideBar: (body = {}) => telegramPost('peer-hide-bar', body),
  telegramPeerShareContact: (body = {}) =>
    telegramPost('peer-share-contact', body),
  telegramGifSearch: (body = {}) => telegramPost('gif-search', body),
  // The panel's menu ({ id, action }; R-Y115).
  telegramStickerSave: (body = {}) => telegramPost('sticker-save', body),
  telegramStickerSetBox: (body = {}) => telegramPost('sticker-set-box', body),
  // A die's animations ({ emoticon }; R-Y130).
  telegramDice: (body = {}) => telegramPost('dice', body),
  telegramStickerSetInstall: (body = {}) =>
    telegramPost('sticker-set-install', body),
  telegramSendDocument: (body = {}) => telegramPost('send-document', body),
  telegramScheduled: (body = {}) => telegramPost('scheduled', body),
  telegramScheduledSend: (body = {}) => telegramPost('scheduled-send', body),
  telegramScheduledDelete: (body = {}) =>
    telegramPost('scheduled-delete', body),
  telegramScheduledReschedule: (body = {}) =>
    telegramPost('scheduled-reschedule', body),

  // Files and photos (R-Y99): each file uploaded (`onProgress` 0…1),
  // then sent together: { chat, tokens, caption, asPhoto, group,
  // replyTo } → { ok, ids }.
  telegramUpload: async (file, options = {}) =>
    (await uploadFile(file, options).catch((error) => ({
      error: error.message,
    }))) ?? { error: 'server required for files' },
  telegramSendFiles: async (body = {}) =>
    (await serverPostReport('/api/telegram/send-files', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for files' },

  // A voice message (R-Y108): its upload's token, length in seconds and
  // waveform → { ok, ids }.
  telegramSendVoice: async (body = {}) =>
    (await serverPostReport('/api/telegram/send-voice', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for files' },

  // A bot's button pressed (R-Y110): `{ chat, id, data }` → the bot's
  // answer `{ ok, message, alert, url }`.
  telegramBotCallback: async (body = {}) =>
    (await serverPostReport('/api/telegram/bot-callback', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for bots' },

  // A poll or checklist (R-Y74): `poll-vote` (no options retracts),
  // `poll-stop`, `poll-results`, `poll-votes`, `todo-toggle`.
  telegramPoll: async (action, body = {}) =>
    (await serverPostReport(
      `/api/telegram/${encodeURIComponent(action)}`,
      body
    ).catch((error) => ({ error: error.message }))) ?? {
      error: 'server required for polls',
    },

  // A new poll (R-Y121): { chat, question, options, anonymous, multiple,
  // quiz, correct?, solution?, replyTo?, silent?, scheduleDate? }.
  telegramSendPoll: (body = {}) => telegramPost('send-poll', body),

  // A place or a contact from the composer (R-Y142): { chat, lat, lon,
  // accuracy?, live? }, { chat, id } to stop a live location, { chat,
  // contact | firstName, lastName, phone }.
  telegramSendLocation: (body = {}) => telegramPost('send-location', body),
  telegramStopLive: (body = {}) => telegramPost('stop-live-location', body),
  telegramUpdateLive: (body = {}) => telegramPost('update-live-location', body),
  telegramSendContact: (body = {}) => telegramPost('send-contact', body),

  // Edit, delete, react to, forward a message or mark a chat read on any
  // network: the server tries the API, then the network's web app.
  messageAction: async (action, body = {}) =>
    (await serverPostReport(
      `/api/message/${encodeURIComponent(action)}`,
      body
    ).catch((error) => ({ error: error.message }))) ?? {
      error: 'server required for message actions',
    },
  // Which message actions a network can do ({ edit: { api, browser } …}).
  messageSupports: async (source) =>
    (await serverFetch(
      `/api/message/supports?source=${encodeURIComponent(source)}`
    )) ?? null,

  /**
   * URL for a Telegram photo via the media proxy.
   * Returns null when the server is offline or the endpoint is unknown.
   */
  telegramMediaUrl: async ({ chat, id, size = 'm' } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !chat || !id) {
      return null;
    }
    const path = `/api/telegram/media?chat=${encodeURIComponent(chat)}&id=${encodeURIComponent(id)}&size=${encodeURIComponent(size)}`;
    return origin ? new URL(path, origin).toString() : path;
  },

  // A person's or chat's photo (`s` small, `b` big); the server answers
  // 404 when they have none, and the initials stay.
  // A group member is found by a message of theirs (`chat`, `msg`).
  telegramAvatarUrl: async ({ peer, size = 's', chat, msg } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !peer || peer === 'me') {
      return null;
    }
    const where =
      chat && msg
        ? `&chat=${encodeURIComponent(chat)}&msg=${encodeURIComponent(msg)}`
        : '';
    const path = `/api/telegram/avatar?peer=${encodeURIComponent(peer)}&size=${encodeURIComponent(size)}${where}`;
    return origin ? new URL(path, origin).toString() : path;
  },

  // A sticker's or GIF's picture (`id`), a set's (`set`), or the video
  // of a video sticker or GIF (`full`) (R-Y105).
  telegramStickerUrl: async ({ id, set, full = false } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !(id || set)) {
      return null;
    }
    const which = set
      ? `set=${encodeURIComponent(set)}`
      : `id=${encodeURIComponent(id)}${full ? '&full=1' : ''}`;
    const path = `/api/telegram/sticker?${which}`;
    return origin ? new URL(path, origin).toString() : path;
  },

  // A place's map picture from the server (R-Y131).
  telegramMapUrl: async ({ lat, lon, hash, w, h, zoom, scale } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !Number.isFinite(lat + lon)) {
      return null;
    }
    const query = new URLSearchParams({ lat, lon, w, h, zoom, scale });
    if (hash) {
      query.set('hash', hash);
    }
    const path = `/api/telegram/map?${query}`;
    return origin ? new URL(path, origin).toString() : path;
  },

  // A custom emoji's picture (`full`: its animation or video) (R-Y120).
  telegramCustomEmojiUrl: async ({ id, full = false } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !/^\d{1,20}$/.test(String(id ?? ''))) {
      return null;
    }
    const path = `/api/telegram/custom-emoji?id=${id}${full ? '&full=1' : ''}`;
    return origin ? new URL(path, origin).toString() : path;
  },

  // A message's video, voice, audio, GIF or sticker, streamed by range.
  telegramFileUrl: async ({ chat, id } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !chat || !id) {
      return null;
    }
    const path = `/api/telegram/file?chat=${encodeURIComponent(chat)}&id=${encodeURIComponent(id)}`;
    return origin ? new URL(path, origin).toString() : path;
  },

  // A chat's title, members and how many are online, or a person's
  // last seen; null when the server cannot tell.
  // The page's errors, in the server's log (./client-log.js).
  clientLog: async (entry) =>
    serverResponse('/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => null),
  // What a personal conversation tells about the person (R-Y50).
  peopleLearned: async (key) =>
    key
      ? ((await serverFetch(
          `/api/people/learned?key=${encodeURIComponent(key)}`
        ).catch(() => null)) ?? null)
      : null,
  // Unread @ and ♥ of a chat: which messages, and that they were seen.
  telegramUnreadMarks: async ({ chat, kind }) =>
    (await serverFetch(
      `/api/telegram/unread-marks?chat=${encodeURIComponent(chat)}&kind=${encodeURIComponent(kind)}`
    ).catch(() => null)) ?? null,
  telegramReadMarks: async (body) =>
    (await serverFetch('/api/telegram/read-marks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)) ?? null,
  telegramChatInfo: async (chat) =>
    chat
      ? ((await serverFetch(
          `/api/telegram/chat-info?chat=${encodeURIComponent(chat)}`
        ).catch(() => null)) ?? null)
      : null,
};
