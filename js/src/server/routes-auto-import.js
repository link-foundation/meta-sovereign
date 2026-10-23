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
import { accountSlot, saveExtraAccount } from '../sources/telegram-accounts.js';

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
  /^\/api\/auto-import\/telegram\/login\/(start|code|password|cancel|qr-start|qr-status|qr-cancel)$/;

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
    // An extra account (R-Y198) is kept under its own namespaced keys;
    // account 1 is saved exactly as before.
    if (meta.slot > 1) {
      await saveExtraAccount(store, meta.slot, {
        apiId: meta.apiId,
        apiHash: meta.apiHash,
        session: login.session,
        account: login.account,
      });
    } else {
      await saveUserSession(store, meta.apiId, meta.apiHash, login.session);
    }
    logins.delete(id);
    return meta.slot > 1
      ? { done: true, account: login.account, extra: meta.slot }
      : { done: true, account: login.account };
  }
  if (login.state === 'qr') {
    return { id, url: login.url, expires: login.expires };
  }
  if (login.state === 'password') {
    return { needs: 'password' };
  }
  if (login.state === 'code') {
    return { needs: 'code', id };
  }
  return { needs: login.state };
};

const badLogin = (message) =>
  Object.assign(new Error(message), { status: 400 });

// The slot a sign-in is for: absent is account 1, as always. An extra
// account beyond the third needs Premium (R-Y198).
const loginSlot = async (body, ctx) => {
  const slot = accountSlot(body.account);
  if (slot === null) {
    throw badLogin('no such account slot');
  }
  if (slot > 3) {
    const me = await ctx.telegramAccount?.accountMe?.().catch(() => null);
    if (!me?.premium) {
      throw badLogin('more than 3 accounts need Telegram Premium');
    }
  }
  return slot;
};

const startLogin = async (store, body, ctx) => {
  const { apiId, apiHash, phone } = body;
  if (!apiId || !apiHash || !phone) {
    throw badLogin('api_id, api_hash and phone are required');
  }
  const slot = await loginSlot(body, ctx);
  const login = await mtprotoFor(ctx).createLogin({ apiId, apiHash, phone });
  await login.ready();
  const id = `tg-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logins = loginsFor(ctx);
  logins.set(id, { login, apiId, apiHash, slot });
  return loginReply(store, logins, id, login, { apiId, apiHash, slot });
};

// Sign in by QR code (R-Y203): qr-start shows a code, qr-status (polled)
// renews it and answers { url, expires } | { needs: 'password' } | { done },
// qr-cancel ends it. The password step is the phone flow's own route.
const API_ID = /^[1-9]\d{0,9}$/;
const API_HASH = /^[0-9a-fA-F]{32}$/;
const LOGIN_ID = /^tg-login-[0-9]+-[a-z0-9]+$/;

const startQrLoginRoute = async (store, body, ctx) => {
  const apiId = String(body.apiId ?? '');
  const apiHash = String(body.apiHash ?? '');
  if (!API_ID.test(apiId) || !API_HASH.test(apiHash)) {
    throw badLogin(
      'api_id (numbers) and api_hash (32 hex characters) are required'
    );
  }
  const slot = await loginSlot(body, ctx);
  const login = await mtprotoFor(ctx).createQrLogin({ apiId, apiHash });
  const id = `tg-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logins = loginsFor(ctx);
  logins.set(id, { login, apiId, apiHash, slot, qr: true });
  return loginReply(store, logins, id, login, { apiId, apiHash, slot });
};

const qrStatusRoute = async (store, body, ctx) => {
  const logins = loginsFor(ctx);
  const id = String(body.id ?? '');
  const entry = LOGIN_ID.test(id) ? logins.get(id) : null;
  if (!entry?.qr) {
    throw Object.assign(new Error('no such QR login (it may have expired)'), {
      status: 404,
    });
  }
  const { login, apiId, apiHash, slot } = entry;
  try {
    await login.status();
  } catch (error) {
    logins.delete(id);
    await login.cancel().catch(() => {});
    throw badLogin(String(error?.errorMessage ?? error?.message ?? error));
  }
  return loginReply(store, logins, id, login, { apiId, apiHash, slot });
};

const continueLogin = async (store, action, body, ctx) => {
  const logins = loginsFor(ctx);
  const entry = logins.get(String(body.id ?? ''));
  if (!entry) {
    throw Object.assign(new Error('no such login (it may have expired)'), {
      status: 404,
    });
  }
  const { login, apiId, apiHash, slot } = entry;
  if (action === 'cancel') {
    await login.cancel();
    logins.delete(body.id);
    return { cancelled: true };
  }
  if (action === 'code') {
    if (!login.submitCode) {
      throw badLogin('a QR login has no code step');
    }
    await login.submitCode(body.code);
  } else if (entry.qr) {
    // A wrong 2-Step password is the user's to fix, not a server error.
    await login.submitPassword(body.password).catch((error) => {
      throw badLogin(String(error?.errorMessage ?? error?.message ?? error));
    });
  } else {
    await login.submitPassword(body.password);
  }
  return loginReply(store, logins, body.id, login, { apiId, apiHash, slot });
};

const loginStep = (store, action, body, ctx) => {
  if (action === 'start') {
    return startLogin(store, body, ctx);
  }
  if (action === 'qr-start') {
    return startQrLoginRoute(store, body, ctx);
  }
  if (action === 'qr-status') {
    return qrStatusRoute(store, body, ctx);
  }
  return continueLogin(
    store,
    action === 'qr-cancel' ? 'cancel' : action,
    body,
    ctx
  );
};

const telegramLoginRoute = async (store, req, res, ctx, action) => {
  const body = await readBody(req).catch(() => ({}));
  const result = await loginStep(store, action, body, ctx);
  ctx.log?.({
    event: 'telegram_login',
    action,
    state: result.needs ?? (result.url ? 'qr' : 'done'),
  });
  // Account 1's service is only told about account 1's sign-in.
  if (result.done && !result.extra) {
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
