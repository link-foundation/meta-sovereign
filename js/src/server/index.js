/**
 * Local web server (R-F4) + universal links HTTP surface (R-F8) + UI (R-F1).
 *
 * Endpoints (full list lives in `routes-derived.js` and `routes-mutating.js`):
 *   GET  /                         -> SPA shell
 *   GET  /app.js, /app.min.js, /app.css -> SPA assets
 *   GET  /links, /links/:id        -> read links
 *   PUT  /links                    -> upsert
 *   DEL  /links/:id                -> delete
 *   GET  /sources                  -> list message-source adapters
 *   GET  /api/contacts             -> contacts derived from messages
 *   GET  /api/status               -> store stats + verify diff count
 *   GET  /api/autocomplete?q=&me=  -> outgoing-history-driven completions
 *   GET  /api/suggest?source=&chat=&typed= -> reply-graph autocomplete
 *   GET  /api/audience?q=          -> set-algebra over store filters
 *   GET  /api/facts                -> question-answer pairs per partner
 *   GET  /api/search?q=            -> dice-similarity search
 *   GET  /api/patterns             -> persisted patterns
 *   PUT  /api/patterns             -> upsert pattern link
 *   POST /api/patterns/infer       -> { examples, mode } -> { regex, flags }
 *   GET  /api/graphs               -> persisted automation graphs
 *   PUT  /api/graphs               -> upsert graph
 *   POST /api/graphs/run           -> { id, message, mode } -> plan
 *   GET  /api/replies              -> persisted reply variation groups
 *   PUT  /api/replies              -> upsert reply variation group
 *   GET  /api/profile              -> read profile (R-D5)
 *   PUT  /api/profile              -> upsert + plan cross-network sync
 *   GET  /api/resume               -> read resume (R-D6)
 *   PUT  /api/resume               -> upsert + plan cross-network sync
 *   POST /api/broadcast            -> queue post for outbound networks
 *   POST /api/outreach             -> { query, text, networks, mode } -> plan
 *   /api/automations/*, POST /api/send, /api/typing -> routes-automations.js
 *   /api/message/* (edit, delete, react, read, forward) -> routes-messages.js
 *   /api/people, /api/audiences, /api/lists -> routes-people.js
 *   GET  /api/greetings/*          -> greeting stickers/texts (routes-greetings.js)
 *   POST /api/email/pull           -> local-server email API/protocol proxy
 *   POST /api/email/send           -> local-server email send proxy
 *   GET  /api/backups              -> list archives (gated on archiveDir)
 *   POST /api/backups              -> { passphrase?, keep? } -> { file }
 *   POST /api/backups/restore      -> { file, passphrase? } -> { restored }
 *   GET  /api/auto-import          -> browser auto-import status + jobs
 *   POST /api/auto-import          -> { provider } -> job (see routes-auto-import.js)
 *
 * Implemented with Node's built-in `http` module to keep the dependency
 * footprint at zero. The Docker images in `docker/` simply run
 * `node js/bin/meta-sovereign serve`.
 */

import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDualStore, wrapSecretStore } from '../storage/index.js';
import {
  getSource as getSourceDefault,
  liveOptionsFrom,
  listSources,
} from '../sources/index.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { json } from './util.js';
import { handleDerivedRoutes } from './routes-derived.js';
import { handleMutatingRoutes } from './routes-mutating.js';
import { handleCvRoutes } from './routes-cv.js';
import { handleGreetingRoutes } from './routes-greetings.js';
import { handleBackupRoutes } from './routes-backup.js';
import { handleSuggestRoutes } from './routes-suggest.js';
import { handleAutomationRoutes } from './routes-automations.js';
import { handlePeopleRoutes } from './routes-people.js';
import {
  createAutomationRunner,
  createAutomationScheduler,
} from '../automation/runner.js';
import { createDefaultSender } from '../sources/browser-sender.js';
import { setTypingFor } from '../sources/live-links.js';
import { createReplyService } from '../replies/reply-service.js';
import { createChatIndex } from './chat-index.js';
import { handleChatRoutes } from './routes-chat.js';
import { createClinkReplyStore } from '../replies/reply-store-clink.js';
import { handleAutoImportRoutes } from './routes-auto-import.js';
import { handleTelegramRoutes } from './routes-telegram.js';
import { handleMessageRoutes } from './routes-messages.js';
import { handleEventRoutes } from './routes-events.js';
import { handleMetrics } from './metrics.js';
import { jsonLog } from './log.js';
import { createPeer, attachSyncWebSocket } from '../sync/index.js';
import { attachSignaling } from '../sync/webrtc-signaling.js';
import { registerDefaultHandlers } from './handlers-bootstrap.js';
import { classifyOrigin, handleCors, parseAllowedOrigins } from './cors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

// Conservative Content-Security-Policy. The SPA loads no remote
// resources except VK greeting-sticker previews from https://vk.com
// (issue #35; Telegram thumbnails are proxied through
// /api/greetings/file) and ships no inline scripts/styles: only same-origin SPA
// modules/bundles and app.css. WebSockets connect to the same
// origin (/ws + /rtc); discovery may also attempt 127.0.0.1 / localhost
// on alternate ports. Browser-first provider API calls (JMAP, Gmail,
// Graph, etc.) use HTTPS directly when CORS allows them.
export const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'wasm-unsafe-eval'; " +
  "style-src 'self'; " +
  "img-src 'self' data: blob: https://vk.com; " +
  "connect-src 'self' https: ws: wss: http://127.0.0.1:* http://localhost:*; " +
  "worker-src 'self'; " +
  "font-src 'self' data:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none'";

const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

// SPA assets keep their names across releases, so browsers must
// revalidate them (`no-cache`) instead of guessing a lifetime — Safari
// otherwise kept running an old bundle after an update. The ETag makes
// the revalidation a cheap 304 when nothing changed.
const serveStatic = async (req, res, filePath) => {
  try {
    const stat = await fs.stat(filePath);
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = { 'cache-control': 'no-cache', etag };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      ...headers,
      'content-type': MIME[ext] ?? 'application/octet-stream',
    });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
};

// Browser-safe modules outside js/src/web that the SPA imports directly.
// Each entry maps a URL prefix to the directory under src/ that holds
// the matching file. Only files whose name matches the allow-list
// regex are served, and the resolved path must stay under the mapped
// directory (no `..`).
const SRC_ROOT = path.resolve(here, '..');
const BROWSER_MOUNTS = [
  ['/storage/', path.join(SRC_ROOT, 'storage')],
  ['/handlers/', path.join(SRC_ROOT, 'handlers')],
  ['/sync/', path.join(SRC_ROOT, 'sync')],
];

const handleStatic = async (req, res, p) => {
  if (req.method !== 'GET') {
    return false;
  }
  if (p === '/' || p === '/index.html') {
    return serveStatic(req, res, path.join(webRoot, 'index.html'));
  }
  if (/^\/[a-zA-Z0-9._-]+\.(js|css|svg|wasm)$/.test(p)) {
    return serveStatic(req, res, path.join(webRoot, p.slice(1)));
  }
  for (const [prefix, dir] of BROWSER_MOUNTS) {
    if (!p.startsWith(prefix)) {
      continue;
    }
    const tail = p.slice(prefix.length);
    if (!/^[a-zA-Z0-9._-]+\.js$/.test(tail)) {
      continue;
    }
    const resolved = path.join(dir, tail);
    if (!resolved.startsWith(dir + path.sep) && resolved !== dir) {
      continue;
    }
    return serveStatic(req, res, resolved);
  }
  return false;
};

/**
 * CV routes accept an injected browser so tests — and any embedder
 * that already owns a session — never open a second one.
 * @param {{commander?: object, sessionFactory?: Function, artifactDir?: string}} cv
 */
const cvContext = (cv = {}) => ({
  cvCommander: cv.commander ?? null,
  cvSessionFactory: cv.sessionFactory ?? null,
  cvArtifactDir: cv.artifactDir ?? null,
});

/**
 * The reply service behind /api/suggest. `replies.clink` (or
 * `MS_REPLY_CLINK=1`) mirrors the reply graph into a link-cli database
 * next to the store.
 */
const replyService = (store, storeDir, replies = {}) => {
  const option = replies.clink ?? process.env.MS_REPLY_CLINK === '1';
  const clink =
    option === true
      ? createClinkReplyStore({ db: path.join(storeDir, 'replies.links') })
      : option || null;
  return createReplyService({ store, self: replies.self ?? [], clink });
};

/**
 * Sending, typing and automations. `automations.send` and `.setTyping`
 * replace the adapters (tests); by default a message goes through the
 * network's API and falls back to its official web UI. The scheduler
 * fires schedule and incoming triggers unless `scheduler: false`.
 */
const automationContext = (
  store,
  automations = {},
  log = null,
  getSource = getSourceDefault
) => {
  const say = (event) => log?.(event);
  // The saved connection's token and ids, so the API is really tried
  // before the web app.
  const optionsFor = (source) =>
    liveOptionsFrom(store, source).catch(() => ({}));
  const send =
    automations.send ??
    createDefaultSender({
      getSource,
      options: automations.options,
      optionsFor,
      browser: automations.browser,
      log: say,
    });
  const setTyping =
    automations.setTyping ??
    (async ({ source, chat, cancel }) =>
      setTypingFor(getSource, {
        source,
        chat,
        cancel,
        options: await optionsFor(source),
      }).catch((error) => ({
        supported: false,
        source,
        error: error.message,
      })));
  const self = (automations.self ?? []).map(String);
  const runner = createAutomationRunner({
    store,
    send,
    setTyping,
    resolveAudience: automations.resolveAudience,
    self,
    log: say,
  });
  const scheduler = createAutomationScheduler({
    store,
    runner,
    isSelf: (sender) => sender === 'me' || self.includes(String(sender)),
    tickMs: automations.tickMs,
    log: say,
  });
  if (automations.scheduler !== false) {
    scheduler.start();
  }
  return {
    send,
    setTyping,
    automations: { runner, scheduler },
    closeAutomations: async () => {
      scheduler.stop();
      await send.close?.();
    },
  };
};

/**
 * Greeting routes accept injected sources (and a sleep) so tests send
 * nothing to a real network.
 * @param {{resolveSource?: Function, sleep?: Function}} greetings
 */
// The Telegram chats the background download goes through: each with
// its type and newest message, from the chat index.
const telegramChats = async (chatIndex) =>
  (await chatIndex.heads())
    .filter((link) => link.source === 'telegram')
    .map((link) => ({
      chat: String(link.chat),
      chatType: link.chatType ?? null,
      at: link.timestamp ?? null,
    }));

// Pictures shown in Chat are kept next to the store.
const mediaDirOf = (storeDir) =>
  storeDir ? path.join(storeDir, 'media', 'telegram') : null;

/**
 * The connected Telegram account (sync, history, sending). Tests that
 * inject a fake login (`telegramMtproto`/`telegramCreds`) get no real
 * account unless they pass one, so nothing ever dials Telegram.
 */
const telegramAccountFor = (store, log, options) => {
  if (options.telegramAccount !== undefined) {
    return options.telegramAccount || null;
  }
  if (options.telegramMtproto || options.telegramCreds) {
    return null;
  }
  const account = createTelegramAccount({
    store,
    log: (e) => log?.(e),
    chats: options.chats,
    mediaDir: options.mediaDir ?? null,
  });
  account.start();
  return account;
};

// `telegram` sends and types through the connected account; every other
// network keeps its adapter.
const accountSources = (account) => (name) => {
  const adapter = getSourceDefault(name);
  return name === 'telegram' && account && adapter
    ? { ...adapter, live: { ...adapter.live, ...account.live } }
    : adapter;
};

const greetingContext = (greetings = {}) => ({
  greetingSources: greetings.resolveSource ?? null,
  greetingSleep: greetings.sleep ?? null,
});

const applySecurityHeaders = (res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!res.hasHeader(k)) {
      res.setHeader(k, v);
    }
  }
};

const route = async (store, req, res, ctx) => {
  applySecurityHeaders(res);
  if (handleCors(req, res, ctx.allowOrigins)) {
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (await handleStatic(req, res, p)) {
    return;
  }
  if (p === '/sources' && req.method === 'GET') {
    return json(res, 200, listSources());
  }
  if (await handleMetrics(store, req, res, p, ctx)) {
    return;
  }
  if (await handleCvRoutes(store, req, res, p, url, ctx)) {
    return;
  }
  if (await handleSuggestRoutes(req, res, p, url, ctx)) {
    return;
  }
  if (await handleAutomationRoutes(store, req, res, p, url, ctx)) {
    return;
  }
  if (await handlePeopleRoutes(store, req, res, p, url)) {
    return;
  }
  if (await handleGreetingRoutes(store, req, res, p, url, ctx)) {
    return;
  }
  if (await handleMutatingRoutes(store, req, res, p, url, ctx)) {
    return;
  }
  if (await handleBackupRoutes(store, req, res, p, ctx.archiveDir)) {
    return;
  }
  for (const handle of [
    () => handleEventRoutes(store, req, res, p, ctx),
    () => handleAutoImportRoutes(store, req, res, p, ctx),
    () => handleTelegramRoutes(req, res, p, ctx),
    () => handleMessageRoutes(store, req, res, p, url, ctx),
    () => handleChatRoutes(req, res, p, url, ctx),
    () => handleDerivedRoutes(store, req, res, p, url),
  ]) {
    if (await handle()) {
      return;
    }
  }
  return json(res, 404, { error: 'unknown route' });
};

const initStore = async ({
  providedStore,
  storeDir,
  archiveDir,
  secretPassphrase,
  log,
}) => {
  let store = providedStore;
  let resolvedArchiveDir = archiveDir;
  if (!store) {
    store = await openDualStore(storeDir, {
      onError: (error) =>
        log?.({
          level: 'warn',
          event: 'store_snapshot_failed',
          error: error.message,
        }),
    });
    // The binary snapshot may have missed the last writes (a crash).
    await store.reconcile();
    if (!resolvedArchiveDir) {
      resolvedArchiveDir = path.join(storeDir, 'archives');
      await fs.mkdir(resolvedArchiveDir, { recursive: true });
    }
  }
  // Kept before wrapping: the secret wrapper does not pass `flush` on.
  const unwrapped = store;
  const flush = async () => {
    await unwrapped.flush?.();
  };
  if (secretPassphrase) {
    store = wrapSecretStore({ inner: store, passphrase: secretPassphrase });
  }
  return { store, resolvedArchiveDir, flush };
};

export const startServer = async ({
  port = 0,
  storeDir = '.meta-sovereign',
  archiveDir,
  store: providedStore,
  enableHandlers = true,
  enableSync = true,
  log = process.env.MS_LOG_FORMAT === 'json' ? jsonLog() : null,
  node = 'server',
  secretPassphrase = process.env.MS_SECRET_PASSPHRASE ?? null,
  emailLiveFactory = null,
  cv = {},
  // `{ self?, clink? }` for the reply-graph autocomplete (/api/suggest).
  replies,
  // `{ send?, setTyping?, resolveAudience?, self?, scheduler?, tickMs? }`.
  automations,
  greetings,
  allowOrigins,
  autoImportLauncher,
  // Tests inject a fake `createSignIns()` (no real browsers are read).
  autoImportSignIns,
  // Tests inject a fake MTProto (no real GramJS / network for Telegram login).
  telegramMtproto,
  telegramCreds,
  // A `createTelegramAccount()` (or `false` for none); see telegramAccountFor.
  telegramAccount: telegramAccountOption,
} = {}) => {
  const { store, resolvedArchiveDir, flush } = await initStore({
    providedStore,
    storeDir,
    archiveDir,
    secretPassphrase,
    log,
  });
  const chatIndex = createChatIndex(store);
  const telegramAccount = telegramAccountFor(store, log, {
    telegramAccount: telegramAccountOption,
    telegramMtproto,
    telegramCreds,
    chats: () => telegramChats(chatIndex),
    mediaDir: mediaDirOf(storeDir),
  });
  const ctx = {
    archiveDir: resolvedArchiveDir,
    sync: null,
    signaling: null,
    secretPassphrase,
    emailLiveFactory,
    allowOrigins: parseAllowedOrigins(allowOrigins),
    ...cvContext(cv),
    replies: replyService(store, storeDir, replies),
    ...automationContext(
      store,
      automations,
      log,
      accountSources(telegramAccount)
    ),
    ...greetingContext(greetings),
    storeDir,
    log,
    autoImport: null,
    autoImportLauncher,
    autoImportSignIns,
    telegramMtproto,
    telegramCreds,
    telegramAccount,
    chatIndex,
  };
  const server = http.createServer((req, res) => {
    const start = Date.now();
    res.on('finish', () => {
      log?.({
        event: 'http',
        method: req.method,
        path: (req.url ?? '').split('?')[0],
        status: res.statusCode,
        duration_ms: Date.now() - start,
      });
    });
    route(store, req, res, ctx).catch((err) => {
      log?.({
        level: 'error',
        event: 'http_error',
        method: req.method,
        path: (req.url ?? '').split('?')[0],
        error: err.message,
        stack: err.stack ?? null,
      });
      json(res, 500, { error: err.message });
    });
  });
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  let bus = null;
  if (enableHandlers) {
    bus = registerDefaultHandlers(store, { browser: () => ctx.send });
  }
  let wsHandle = null;
  let signaling = null;
  if (enableSync) {
    // Same rule as HTTP: no sockets for pages on other websites.
    const verifyOrigin = (req) =>
      classifyOrigin(req, ctx.allowOrigins) !== 'denied';
    wsHandle = attachSyncWebSocket(server, { path: '/ws', verifyOrigin });
    const peer = createPeer(store, { node });
    peer.connect(wsHandle.transport);
    signaling = attachSignaling(server, { path: '/rtc', verifyOrigin });
    ctx.sync = wsHandle;
    ctx.signaling = signaling;
  }
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    store,
    bus,
    sync: wsHandle,
    signaling,
    archiveDir: resolvedArchiveDir,
    allowOrigins: ctx.allowOrigins,
    close: () =>
      new Promise((resolve) => {
        bus?.close();
        ctx.replies.close().catch(() => {});
        ctx.closeAutomations().catch(() => {});
        ctx.autoImport?.close();
        ctx.chatIndex.close();
        telegramAccount?.stop().catch(() => {});
        wsHandle?.close();
        signaling?.close();
        server.close(() => resolve());
        for (const socket of sockets) {
          socket.destroy();
        }
      })
        // The binary snapshot is written on an interval: write it now.
        .then(() => flush().catch(() => {})),
  };
};
