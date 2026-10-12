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
  describeRecipes,
  probeBrowserAutomation,
} from '../sources/auto-import/index.js';

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
    return fail(res, error);
  }
};
