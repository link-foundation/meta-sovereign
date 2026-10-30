// Tiny DOM helper used across views, plus the API surface used by
// every view. A known server's reads keep recovering automatically;
// browser-only operation uses the local store (see ./client.js).

import { reportApiFailure } from './api-errors.js';
import { debugBrowser } from './client-log.js';
import { openServerEvents } from './server-events.js';
import { trackServerStream } from './server-transport.js';
import { READ_RECOVERED_EVENT } from './read-retry.js';
import { rememberServerConnection } from './connection-prefs.js';
import { createPasscodeCaller } from './passcode-request.js';
import { messageVersionCalls } from './dom-message-versions.js';
import { LOCKED_EVENT } from './passcode.js';
import { createRecoveringRequest } from './request-recovery.js';
import { isReadRequest } from './request-policy.js';
import { migrateBrowserStore } from '../storage/migrations/browser-runner.js';
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
import { createOfflineClient } from './client.js';
import { createPageLifetime, followServer } from './server-follow.js';
import { createHandlerBus, broadcastHandler } from '../handlers/index.js';
import { createAutomationApi } from './automation-api.js';
import { attachWebRtcSync } from './webrtc-sync.js';
import {
  greetingCatalogue,
  loadGreetingSelection,
  planFromStore,
  saveGreetingSelection,
} from '../greetings/plan.js';
import { TELEGRAM_CALLS } from './dom-telegram-calls.js';
import { bindPaid, guardApi, paidGate } from './paid-send.js';
import { guardCodes, pageCodeGate } from './sign-in-code-guard.js';
import { activeAccount, scopedUrl } from './telegram-account-scope.js';
import { createConversationApi } from './conversation-api.js';

export const h = (tag, attrs = {}, children = []) => {
  const el = globalThis.document.createElement(tag);
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
    el.append(
      typeof c === 'string' ? globalThis.document.createTextNode(c) : c
    );
  }
  return el;
};

let bootPromise = null;
const pageLifetime = createPageLifetime();

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

// The page's store, brought to the current data schema (R-Z17). One written
// by a newer build is not touched: the page works on a scratch copy and
// says so (`ms-schema-too-new`), so nothing of it is overwritten.
const openMigratedStore = async (suffix) => {
  const store = await createBrowserStore({
    driver: pickBrowserDriver({ suffix }),
  });
  try {
    await migrateBrowserStore(store);
    return store;
  } catch (error) {
    if (error?.code !== 'STORE_TOO_NEW') {
      throw error;
    }
    globalThis.msSchemaTooNew = true; // for a banner that mounts later
    globalThis.dispatchEvent?.(
      new globalThis.CustomEvent('ms-schema-too-new', { detail: error.message })
    );
    return createBrowserStore();
  }
};

const boot = async () => {
  // An extra Telegram account keeps its own copy in the browser, so
  // nothing of it mixes with account 1's (R-Y202).
  const slot = activeAccount();
  const suffix = slot > 1 ? `@telegram-${slot}` : '';
  const store = await openMigratedStore(suffix);
  // Local handler bus so writes to broadcast:* trigger work even
  // when the SPA is fully offline.
  const bus = createHandlerBus(store);
  const built = broadcastHandler({ broadcast: localBroadcast });
  bus.register('broadcast', built.selector, built.run);

  const discovered = await discoverServer({ signal: pageLifetime });
  debugBrowser('boot-discovery', { discovered });
  if (discovered) {
    rememberServerConnection();
  }
  // Looked for meanwhile; the app does not wait for it.
  const nearby = discovered ? Promise.resolve(null) : findNearbyServer();
  const server = discovered
    ? {
        origin: discovered.origin,
        // The links and chat pages of the account this tab uses (R-Y202).
        fetchImpl: (url, init) =>
          globalThis.fetch(scopedUrl(String(url), init?.method ?? 'GET'), init),
      }
    : null;
  const client = createOfflineClient({
    store,
    server,
    replyDriver: pickSnapshotDriver(`meta-sovereign:reply-model${suffix}`),
  });
  client.on((event) => {
    if (event.type === 'mode-change' && event.online) {
      globalThis.dispatchEvent?.(new globalThis.Event(READ_RECOVERED_EVENT));
    }
  });
  // When a server is reachable, also open a WebRTC peer sync over its
  // /rtc broker so writes propagate browser-to-browser without the
  // server relaying every byte (R-J7). Best-effort: a missing
  // RTCPeerConnection (older browsers) just skips this path. Only account
  // 1's: the peers are account 1's pages (R-Y202).
  const rtc =
    discovered && slot === 1
      ? attachWebRtcSync({
          store,
          origin: discovered.origin,
          onError: (error) => {
            rawApi
              .clientLog({
                level: 'warn',
                event: 'rtc_negotiation_failed',
                error: String(error?.message ?? 'rtc-failed').slice(0, 300),
              })
              .catch(() => {});
          },
        })
      : null;
  return {
    store,
    bus,
    client,
    requests: createRecoveringRequest({
      fetchImpl: (url, init) => globalThis.fetch(url, init),
      reached: client.reached,
      failed: client.failed,
    }),
    rtc,
    nearby,
    origin: discovered?.origin ?? null,
    follow: followServer(client, discovered?.origin ?? null, {
      signal: pageLifetime,
    }),
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
  bootPromise
    ?.then(({ follow, client, requests }) => {
      follow?.stop?.();
      client.close?.();
      requests.stop();
    })
    .catch(() => {});
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
  const { origin, requests } = await ensure();
  if (!origin) {
    return null;
  }
  // The discovered origin is not always the page's own origin: the
  // SPA on GitHub Pages (or opened from a file) talks to a server on
  // 127.0.0.1, so a relative path would hit the page's host instead
  // of the server. `new URL` keeps same-origin deployments unchanged
  // and points cross-origin ones at the backend the client is using.
  const url = scopedUrl(
    origin ? new URL(path, origin).toString() : path,
    init?.method ?? 'GET'
  );
  return requests
    .request(url, init ?? {}, {
      retry: isReadRequest(path, init?.method),
      json: true,
    })
    .then(announceLocked)
    .catch(() => (network ? NO_ANSWER : null));
};

// The server is locked by a passcode (R-Y183): the page shows its lock screen.
const announceLocked = (response) => {
  if (response.status === 423) {
    globalThis.dispatchEvent?.(new globalThis.Event(LOCKED_EVENT));
  }
  return response;
};

// The local passcode (R-Y183): `op` is status, unlock, lock, set, remove or
// auto-lock; the answer is the server's JSON with `httpStatus`, null offline.
const passcodeCall = createPasscodeCaller(ensure, announceLocked);

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
    if (response) {
      // Logged once per distinct error, never shown for a read (R-Z12).
      const data = await response.json().catch(() => null);
      reportApiFailure({
        path,
        method: init?.method ?? 'GET',
        status: response.status,
        data,
      });
    }
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
  // A refusal is logged and toasted for the user's action (R-Z12).
  reportApiFailure({ path, method: 'POST', status: response.status, data });
  return { ...data, httpStatus: response.status };
};

// One file's bytes to the server (R-Y99), with how far it got: fetch
// cannot say that of an upload, XMLHttpRequest can. Resolves to the
// server's answer, `{ error }` when it refused, null when there is no
// server.
const uploadTo = async (path, file, { onProgress, signal } = {}) => {
  const { client, origin } = await ensure();
  if (!client.isOnline() || typeof globalThis.XMLHttpRequest !== 'function') {
    return null;
  }
  const url = scopedUrl(
    origin ? new URL(path, origin).toString() : path,
    'POST'
  );
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

const uploadFile = (file, options) =>
  uploadTo(
    `/api/telegram/upload?name=${encodeURIComponent(file?.name || 'file')}`,
    file,
    options
  );

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
// Each plain Telegram call of the page (R-Y75 onwards) as a function: a
// call that takes a body sends it, one that takes none always sends {}.
const telegramCalls = Object.fromEntries(
  Object.entries(TELEGRAM_CALLS).map(([name, call]) => [
    name,
    call.body
      ? (body = {}) => telegramPost(call.route, body)
      : () => telegramPost(call.route, {}),
  ])
);

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
  'outbox',
  'resolveOutbox',
  'safetySettings',
  'saveSafetySettings',
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

const rawApi = {
  marketplaces: async () =>
    (await serverFetch('/api/marketplaces')) ?? {
      ok: false,
      accounts: [],
      code: 'server-required',
    },
  marketplaceAction: async (id, action) =>
    (await serverPostReport(
      `/api/marketplaces/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      {}
    )) ?? { ok: false, code: 'server-required' },
  // Plain POSTs to /api/telegram/<route> (./dom-telegram-calls.js).
  ...telegramCalls,
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
  chatLinks: async (options) => {
    const { client } = await ensure();
    return client.chatLinks(options);
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
  // The server's disk and store health, null when it cannot be asked (R-Z14).
  health: async () => {
    const response = await serverResponse('/api/health');
    return response?.ok ? response.json().catch(() => null) : null;
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
    signal = pageLifetime,
  } = {}) => {
    if (signal?.aborted) {
      return false;
    }
    const found = await discover({ signal });
    debugBrowser('manual-rediscovery', { found });
    if (found && !signal?.aborted) {
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
  contactsImportSources: async () =>
    (await serverFetch('/api/contacts/import')) ?? {
      ok: false,
      system: { available: false },
    },
  contactsImportPreview: async (body) =>
    (await serverPostReport('/api/contacts/import/preview', body)) ?? {
      ok: false,
      code: 'server-required',
    },
  contactsImportApply: async (body) =>
    (await serverPostReport('/api/contacts/import/apply', body)) ?? {
      ok: false,
      code: 'server-required',
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
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
  // Read the friends and members the audiences name (R-X13, R-Z7).
  syncAudiences: async (source) =>
    (await serverPostReport('/api/audience/sync', source ? { source } : {})) ??
    null,
  // A chat's deleted messages: list, recover, purge (local only, R-Z7).
  deletedMessages: async (key) =>
    (await serverFetch(`/api/chat/deleted?key=${encodeURIComponent(key)}`)) ??
    null,
  ...messageVersionCalls(serverFetch, ensure),
  recoverDeleted: async (ids) =>
    (await serverPostReport('/api/chat/deleted/recover', { ids })) ?? {
      ok: false,
      error: 'server required',
    },
  purgeDeleted: async (ids) =>
    (await serverPostReport('/api/chat/deleted/purge', {
      ids,
      confirm: true,
    })) ?? { ok: false, error: 'server required' },
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
  // The GitHub inbox (R-Z11): GET when `body` is undefined, else POST. The
  // server's own answer, with its error code, is kept.
  githubInbox: async (route, body) => {
    const path = `/api/github/${route}`;
    const answer =
      body === undefined
        ? await serverResponse(path).then((r) => r?.json().catch(() => null))
        : await serverPostReport(path, body);
    return answer ?? { ok: false, code: 'no-server', error: 'server required' };
  },
  // Older messages of a VK chat (R-Z20): the server's own answer, with its
  // error code and a captcha to show, is kept.
  vkHistory: async (body) =>
    (await serverPostReport('/api/vk/history', body).catch((error) => ({
      ok: false,
      error: error.message,
    }))) ?? { ok: false, code: 'no-server', error: 'server required' },
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
  // Read a network's inbox now (R-Z8): { ok, imported } or { ok: false, code }.
  pullInbox: async (source) =>
    (await serverPostReport('/api/pull', { source })) ?? {
      ok: false,
      code: 'server-required',
      error: 'the local server fetches the inbox',
    },
  autoImportJob: async (id) =>
    (await serverFetch(`/api/auto-import/jobs/${encodeURIComponent(id)}`)) ??
    null,
  // Sign-ins from the user's own browsers: scan (counts only), import
  // (explicit), and the macOS Full Disk Access settings pane.
  browserSignIns: async (action, body = {}) =>
    (await serverPostReport(`/api/auto-import/browsers/${action}`, body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for browser sign-ins' },
  // WhatsApp Web sign-in window and zip exports (R-Z9).
  whatsappWeb: async (action = 'status') =>
    (action === 'status'
      ? await serverFetch('/api/whatsapp/web').catch(() => null)
      : await serverPostReport(`/api/whatsapp/web/${action}`, {}).catch(
          (error) => ({ error: error.message })
        )) ?? { error: 'server required for WhatsApp Web' },
  // An export file streamed to the server's importer (R-Z23): any size,
  // a zip read in place. `{ error }` without a server.
  archiveUpload: async (source, file, options) =>
    (await uploadTo(
      `/api/archive/upload?source=${encodeURIComponent(source)}&name=${encodeURIComponent(file?.name || 'archive')}`,
      file,
      options
    )) ?? { error: 'server required for zip imports' },
  whatsappArchive: async (name, data) =>
    (await serverPostReport('/api/whatsapp/archive', { name, data }).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for zip imports' },
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
  telegramDialogState: async (body) =>
    (await serverPostReport('/api/telegram/dialog-state', body).catch(
      () => null
    )) ?? { ok: false, offline: true },
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
    if (!origin || typeof Source !== 'function') {
      return () => {};
    }
    const url = scopedUrl(
      origin ? new URL('/api/events', origin).toString() : '/api/events'
    );
    const transport = trackServerStream();
    let interrupted = false;
    const stop = openServerEvents(
      url,
      {
        ready: () => {
          transport.state('open');
          client.reached?.();
          if (interrupted) {
            interrupted = false;
            globalThis.dispatchEvent?.(
              new globalThis.Event(READ_RECOVERED_EVENT)
            );
          }
          onState('open');
          follow?.check();
        },
        link: (event) => {
          try {
            onEvent(JSON.parse(event.data));
          } catch {
            /* Skip malformed frames; the next refresh catches up. */
          }
        },
        heartbeat: () => {
          transport.state('open');
          client.reached?.();
        },
        error: () => {
          interrupted = true;
          transport.state('closed');
          onState('closed');
        },
      },
      { Source, signal: pageLifetime, watchdogMs: 60000 }
    );
    return () => {
      stop();
      transport.close();
    };
  },
  /**
   * New incoming messages of every Telegram account the server runs
   * (GET /api/telegram/accounts-events, R-Y202), so the account the page
   * shows can notify for the others: `onEvent({ account, chat, ... })`.
   * Returns a stop function; without a server it does nothing.
   */
  telegramAccountsEvents: async (onEvent) => {
    const { origin } = await ensure();
    const Source = globalThis.EventSource;
    if (!origin || typeof Source !== 'function') {
      return () => {};
    }
    const path = '/api/telegram/accounts-events';
    return openServerEvents(
      origin ? new URL(path, origin).toString() : path,
      {
        message: (event) => {
          try {
            onEvent(JSON.parse(event.data));
          } catch {
            /* Skip malformed frames. */
          }
        },
      },
      { Source, signal: pageLifetime }
    );
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
  telegramForumTopics: ({ chat, fresh }) =>
    telegramPost('forum-topics', { chat, ...(fresh ? { fresh: true } : {}) }),
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

  // The pinned chats in a new order (R-Y159): { folder: 0 | 1, chats }.
  telegramPinnedReorder: async (body = {}) =>
    (await serverPostReport('/api/telegram/pinned-reorder', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for the pinned order' },

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

  // Where Instant View's pictures are served (R-Y205).
  telegramInstantViewMediaBase: async () => {
    const { client, origin } = await ensure();
    if (!client.isOnline()) {
      return null;
    }
    const path = '/api/telegram/instant-view-media';
    return origin ? new URL(path, origin).toString() : path;
  },
  telegramLinkPreviewPhotoUrl: async ({ id } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !/^\d{1,20}$/.test(String(id ?? ''))) {
      return null;
    }
    const path = `/api/telegram/link-preview-photo?id=${id}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
  telegramStoryUrl: async ({ peer, id } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !peer || !id) {
      return null;
    }
    const path = `/api/telegram/story?peer=${encodeURIComponent(peer)}&id=${encodeURIComponent(id)}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
  telegramWallpaperUrl: async ({ id, slug = '', size = 'full' } = {}) => {
    const { origin } = await ensure();
    if (!id) {
      return null;
    }
    const query = new URLSearchParams({ id: String(id), size });
    if (slug) {
      query.set('slug', slug);
    }
    const path = `/api/telegram/wallpaper?${query}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
  telegramRingtoneUrl: async ({ id } = {}) => {
    const { origin } = await ensure();
    if (!id) {
      return null;
    }
    const path = `/api/telegram/ringtone?id=${encodeURIComponent(id)}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
  // A saved song's audio on a profile (R-Y185).
  telegramMusicUrl: async ({ id } = {}) => {
    const { origin } = await ensure();
    if (!id) {
      return null;
    }
    const path = `/api/telegram/music?id=${encodeURIComponent(id)}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },
  passcode: passcodeCall,
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
  telegramUploadProgress: (body = {}) =>
    serverPostReport('/api/telegram/upload-progress', body),

  // A voice message (R-Y108): its upload's token, length in seconds and
  // waveform → { ok, ids }.
  telegramSendVoice: async (body = {}) =>
    (await serverPostReport('/api/telegram/send-voice', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for files' },

  // A round video (R-Y150): its upload's token, length in seconds and
  // side → { ok, ids }.
  telegramSendRound: async (body = {}) =>
    (await serverPostReport('/api/telegram/send-round', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for files' },

  // A bot's button pressed (R-Y110): `{ chat, id, data }` → the bot's
  // answer `{ ok, message, alert, url }`.
  telegramBotCallback: async (body = {}) =>
    (await serverPostReport('/api/telegram/bot-callback', body).catch(
      (error) => ({ error: error.message })
    )) ?? { error: 'server required for bots' },

  // The chat's ephemeral messages, shown to this user only (R-Y223):
  // `{ chat }` -> `{ ok, messages }`. A press on one's button is
  // `telegramEphemeralCallback` (dom-telegram-calls.js).
  telegramEphemeral: async ({ chat } = {}) =>
    serverFetch(`/api/telegram/ephemeral?chat=${encodeURIComponent(chat)}`),

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
  telegramMediaUrl: async ({ chat, id, size = 'm', part = 0, rich } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !chat || !id) {
      return null;
    }
    const path = `/api/telegram/media?chat=${encodeURIComponent(chat)}&id=${encodeURIComponent(id)}&size=${encodeURIComponent(size)}${part ? `&part=${part}` : ''}${rich ? `&rich=${encodeURIComponent(rich)}` : ''}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
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
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
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
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
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
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },

  // A custom emoji's picture (`full`: its animation or video) (R-Y120).
  telegramCustomEmojiUrl: async ({ id, full = false } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !/^\d{1,20}$/.test(String(id ?? ''))) {
      return null;
    }
    const path = `/api/telegram/custom-emoji?id=${id}${full ? '&full=1' : ''}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },

  // A message's video, voice, audio, GIF or sticker, streamed by range.
  // `rich`: `document:<id>` of its rich message, `download`: saved under
  // its name (R-Y224).
  telegramFileUrl: async ({ chat, id, rich, download } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !chat || !id) {
      return null;
    }
    const path = `/api/telegram/file?chat=${encodeURIComponent(chat)}&id=${encodeURIComponent(id)}${rich ? `&rich=${encodeURIComponent(rich)}` : ''}${download ? '&download=1' : ''}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },

  // A mail attachment's address (R-Z5): its download, or (inline) the
  // picture a mail shows; `n` is its place in the message's attachments.
  emailAttachmentUrl: async ({ id, n, inline } = {}) => {
    const { client, origin } = await ensure();
    if (!client.isOnline() || !id) {
      return null;
    }
    const path = `/api/email/attachment?id=${encodeURIComponent(id)}&n=${Number(n) || 0}${inline ? '&inline=1' : ''}`;
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },

  // An imported archive file's address (R-Z15): `/api/media/<network>/<file>`.
  archiveMediaUrl: async (path) => {
    const { origin } = await ensure();
    return scopedUrl(origin ? new URL(path, origin).toString() : path);
  },

  // Fetch new mail from the saved connection (R-Z5): { ok, imported, … }
  // or { ok: false, error, code }.
  emailPull: async (body = {}) =>
    (await serverPostReport('/api/email/pull', body).catch((error) => ({
      ok: false,
      error: error.message,
    }))) ?? { ok: false, error: 'server required', code: 'no-server' },

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
  ...createConversationApi({
    get: serverFetch,
    post: serverPostReport,
    saveLocal: (record) => api.put(record),
  }),
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

// Every send into a chat that charges Stars per message asks first and
// goes out with exactly the Stars confirmed (R-Y184, ./paid-send.js).
bindPaid({
  price: async (chat) => {
    const answer = await rawApi.telegramPaidPrice({ chat });
    return answer?.ok ? Number(answer.stars) || 0 : 0;
  },
});

// A message holding a fresh sign-in code asks first too (R-Y218).
export const api = guardCodes(guardApi(rawApi, paidGate), pageCodeGate(rawApi));
