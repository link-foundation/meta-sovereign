/**
 * Browser auto-import routes (JS server only — see SERVER-PARITY.md).
 *
 *   GET  /api/auto-import                   -> { available, reason, providers, jobs }
 *   POST /api/auto-import        {provider} -> job (opens the browser)
 *   GET  /api/auto-import/jobs/:id          -> job
 *   POST /api/auto-import/jobs/:id/capture  -> job (reads the open chat)
 *   POST /api/auto-import/jobs/:id/stop     -> job (closes the browser)
 *
 * Sign-ins from the user's own browsers (./sign-ins.js):
 *   POST /api/auto-import/browsers/scan     -> { browsers, fullDiskAccess }
 *   POST /api/auto-import/browsers/import   {sources:[{browser,profile}]}
 *                                           -> { services, errors }
 *   POST /api/auto-import/browsers/full-disk-access
 *                                           -> opens System Settings (macOS)
 * Scanning reads only host names; importing reads cookie values and keeps
 * them in an owner-only file until the service's import window opens. Both
 * are POST so they share the same-app check below.
 *
 * These routes start processes on the user's machine, so mutating calls
 * must come from the app: a JSON content type (cross-origin pages need a
 * CORS preflight, see ./cors.js) and an Origin that is absent, the
 * server's own, or on the CORS allow-list.
 */

import { json, readBody } from './util.js';
import { classifyOrigin } from './cors.js';
import {
  createAutoImportManager,
  createSignIns,
  createTelegramCreds,
  describeRecipes,
  probeBrowserAutomation,
} from '../sources/auto-import/index.js';
import { createTelegramMtproto } from '../sources/telegram-mtproto.js';

const PREFIX = '/api/auto-import';
const JOB_ROUTE =
  /^\/api\/auto-import\/jobs\/([A-Za-z0-9-]+)(?:\/(capture|stop))?$/;

// No Origin (CLI, curl), the SPA the server serves itself, or a page on
// the CORS allow-list (the hosted app, the mobile WebViews).
export const isTrustedMutation = (req, allowedOrigins = []) => {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.toLowerCase().startsWith('application/json')) {
    return false;
  }
  return classifyOrigin(req, allowedOrigins) !== 'denied';
};

const signInsFor = (ctx) => {
  ctx.autoImportSignIns ??= createSignIns({ dataDir: ctx.storeDir });
  return ctx.autoImportSignIns;
};

// User-account auth over MTProto (GramJS). Injected in tests; the real
// client is lazy-loaded, so a machine without GramJS still runs — the
// finder then groups user sessions by phone instead of by @username.
const mtprotoFor = (ctx) => {
  ctx.telegramMtproto ??= createTelegramMtproto(
    ctx.telegramMtprotoOptions ?? {}
  );
  return ctx.telegramMtproto;
};

const telegramCredsFor = (ctx) => {
  ctx.telegramCreds ??= createTelegramCreds({
    dataDir: ctx.storeDir,
    // Verify a discovered session -> real account when GramJS is present.
    mtproto: (opts) =>
      Promise.resolve({ getMe: () => mtprotoFor(ctx).identify(opts) }),
  });
  return ctx.telegramCreds;
};

const managerFor = (store, ctx) => {
  if (!ctx.autoImport) {
    ctx.autoImport = createAutoImportManager({
      store,
      dataDir: ctx.storeDir,
      log: ctx.log,
      signIns: signInsFor(ctx),
      ...(ctx.autoImportLauncher ? { launcher: ctx.autoImportLauncher } : {}),
    });
  }
  return ctx.autoImport;
};

const availability = async (ctx) => {
  if (ctx.autoImportLauncher) {
    return { available: true, reason: null };
  }
  ctx.autoImportProbe ??= probeBrowserAutomation();
  return ctx.autoImportProbe;
};

const fail = (res, error) =>
  json(res, error.status ?? 500, { error: error.message }) ?? true;

const handleJobRoute = async (manager, req, res, id, action) => {
  if (!action && req.method === 'GET') {
    return json(res, 200, manager.get(id)) ?? true;
  }
  if (action && req.method === 'POST') {
    const job =
      action === 'capture' ? await manager.capture(id) : await manager.stop(id);
    return json(res, 200, job) ?? true;
  }
  return false;
};

const statusRoute = async (res, ctx) => {
  const { available, reason } = await availability(ctx);
  const signIns = signInsFor(ctx);
  return (
    json(res, 200, {
      available,
      reason,
      providers: describeRecipes(),
      jobs: ctx.autoImport?.list() ?? [],
      signIns: await signIns.summary(),
      fullDiskAccess: await signIns.access(),
    }) ?? true
  );
};

const BROWSERS_ROUTE =
  /^\/api\/auto-import\/browsers\/(scan|import|full-disk-access)$/;

const browsersRoute = async (req, res, ctx, action) => {
  const { available, reason } = await availability(ctx);
  if (!available) {
    return json(res, 503, { error: reason }) ?? true;
  }
  const signIns = signInsFor(ctx);
  if (action === 'scan') {
    return json(res, 200, await signIns.scan()) ?? true;
  }
  if (action === 'import') {
    const body = await readBody(req);
    const result = await signIns.importFrom(body.sources);
    ctx.log?.({
      event: 'auto_import_sign_ins',
      services: Object.keys(result.services),
      errors: result.errors.length,
    });
    return json(res, 200, result) ?? true;
  }
  return json(res, 200, await signIns.openFullDiskAccessSettings()) ?? true;
};

// A new credential is stored: the connected account reconnects and pulls
// the chats in the background, so Chat fills without another click.
const accountConnected = (ctx) => {
  ctx.telegramAccount?.connected().catch((error) => {
    ctx.log?.({
      level: 'error',
      event: 'telegram_sync_failed',
      reason: 'connect',
      error: error.message,
    });
  });
};

const TELEGRAM_ROUTE = /^\/api\/auto-import\/telegram\/(scan|identify|use)$/;

// Find the user's own Telegram sign-ins (bot tokens and user sessions)
// scattered across their repositories, group them by account, and connect
// the chosen one. Values stay on this computer; the responses carry only
// kinds, paths and masked hints (see ../sources/auto-import/telegram-creds.js).
const telegramRoute = async (store, req, res, ctx, action) => {
  const creds = telegramCredsFor(ctx);
  const body = await readBody(req).catch(() => ({}));
  if (action === 'scan') {
    const result = await creds.scan({ roots: body.roots });
    ctx.log?.({ event: 'telegram_creds_scan', found: result.entries.length });
    return json(res, 200, result) ?? true;
  }
  if (action === 'identify') {
    return json(res, 200, await creds.identify(body.ids ?? null)) ?? true;
  }
  const id = String(body.id ?? '');
  const result = await creds.use(id, { store });
  // A phone & password credential has no session yet: start the interactive
  // MTProto sign-in from its stored api_id/api_hash/phone and hand the UI
  // the next step (a login code), exactly like the manual login form.
  if (result.needsLogin) {
    const context = await creds.loginContext(id);
    const login = await startLogin(store, context ?? {}, ctx);
    ctx.log?.({ event: 'telegram_creds_use', kind: 'user-password' });
    return json(res, 200, { ...login, needsLogin: true }) ?? true;
  }
  ctx.log?.({ event: 'telegram_creds_use', kind: result.kind });
  if (result.ok !== false) {
    accountConnected(ctx);
  }
  return json(res, 200, result) ?? true;
};

// Sign in to a Telegram **user** account (not a bot) over MTProto, the way
// konard/telegram-bot does: api_id/api_hash/phone -> a login code -> an
// optional 2FA password -> a reusable session string, stored under
// secret:telegram:*. The live GramJS client is held between requests in
// ctx.telegramLogins, keyed by an opaque id.
const TELEGRAM_LOGIN_ROUTE =
  /^\/api\/auto-import\/telegram\/login\/(start|code|password|cancel)$/;

const loginsFor = (ctx) => (ctx.telegramLogins ??= new Map());

const saveUserSession = async (store, apiId, apiHash, session) => {
  const stamp = new Date().toISOString();
  const put = (id, tokens, value) =>
    store.put({ id, tokens, value, updated: stamp });
  await put(
    'secret:telegram:user-session',
    ['secret', 'telegram', 'user-session'],
    session
  );
  await put(
    'secret:telegram:api-id',
    ['secret', 'telegram', 'api-id'],
    String(apiId)
  );
  await put(
    'secret:telegram:api-hash',
    ['secret', 'telegram', 'api-hash'],
    apiHash
  );
};

// Turn a controller's current state into the response, saving the session
// and dropping the controller once the sign-in is complete.
const loginReply = async (store, logins, id, login, meta) => {
  if (login.state === 'done') {
    await saveUserSession(store, meta.apiId, meta.apiHash, login.session);
    logins.delete(id);
    return { done: true, account: login.account };
  }
  if (login.state === 'password') {
    return { needs: 'password' };
  }
  if (login.state === 'code') {
    return { needs: 'code', id };
  }
  return { needs: login.state };
};

const startLogin = async (store, body, ctx) => {
  const { apiId, apiHash, phone } = body;
  if (!apiId || !apiHash || !phone) {
    throw Object.assign(new Error('api_id, api_hash and phone are required'), {
      status: 400,
    });
  }
  const login = await mtprotoFor(ctx).createLogin({ apiId, apiHash, phone });
  await login.ready();
  const id = `tg-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logins = loginsFor(ctx);
  logins.set(id, { login, apiId, apiHash });
  return loginReply(store, logins, id, login, { apiId, apiHash });
};

const continueLogin = async (store, action, body, ctx) => {
  const logins = loginsFor(ctx);
  const entry = logins.get(String(body.id ?? ''));
  if (!entry) {
    throw Object.assign(new Error('no such login (it may have expired)'), {
      status: 404,
    });
  }
  const { login, apiId, apiHash } = entry;
  if (action === 'cancel') {
    await login.cancel();
    logins.delete(body.id);
    return { cancelled: true };
  }
  if (action === 'code') {
    await login.submitCode(body.code);
  } else {
    await login.submitPassword(body.password);
  }
  return loginReply(store, logins, body.id, login, { apiId, apiHash });
};

const telegramLoginRoute = async (store, req, res, ctx, action) => {
  const body = await readBody(req).catch(() => ({}));
  const result =
    action === 'start'
      ? await startLogin(store, body, ctx)
      : await continueLogin(store, action, body, ctx);
  ctx.log?.({ event: 'telegram_login', action, state: result.needs ?? 'done' });
  if (result.done) {
    accountConnected(ctx);
  }
  return json(res, 200, result) ?? true;
};

const startRoute = async (manager, req, res, ctx) => {
  const { available, reason } = await availability(ctx);
  if (!available) {
    return json(res, 503, { error: reason }) ?? true;
  }
  const body = await readBody(req);
  return json(res, 202, manager.start(String(body.provider ?? ''))) ?? true;
};

const dispatch = async (store, req, res, p, ctx) => {
  if (p === PREFIX && req.method === 'GET') {
    return statusRoute(res, ctx);
  }
  const browsers = BROWSERS_ROUTE.exec(p);
  if (browsers && req.method === 'POST') {
    return browsersRoute(req, res, ctx, browsers[1]);
  }
  const login = TELEGRAM_LOGIN_ROUTE.exec(p);
  if (login && req.method === 'POST') {
    return telegramLoginRoute(store, req, res, ctx, login[1]);
  }
  const telegram = TELEGRAM_ROUTE.exec(p);
  if (telegram && req.method === 'POST') {
    return telegramRoute(store, req, res, ctx, telegram[1]);
  }
  const manager = managerFor(store, ctx);
  if (p === PREFIX && req.method === 'POST') {
    return startRoute(manager, req, res, ctx);
  }
  const match = JOB_ROUTE.exec(p);
  return match ? handleJobRoute(manager, req, res, match[1], match[2]) : false;
};

export const handleAutoImportRoutes = async (store, req, res, p, ctx) => {
  if (p !== PREFIX && !p.startsWith(`${PREFIX}/`)) {
    return false;
  }
  if (req.method === 'POST' && !isTrustedMutation(req, ctx.allowOrigins)) {
    return (
      json(res, 403, {
        error: 'auto-import must be started from the meta-sovereign app',
      }) ?? true
    );
  }
  try {
    return await dispatch(store, req, res, p, ctx);
  } catch (error) {
    // Log the full stack before answering: these handlers catch their own
    // errors (so they never reach the server's http_error logger), which is
    // exactly how a failure like a BigInt serialization crash stayed
    // invisible. The client still gets only the message.
    ctx.log?.({
      level: 'error',
      event: 'auto_import_error',
      path: p,
      error: error.message,
      stack: error.stack ?? null,
    });
    return fail(res, error);
  }
};
