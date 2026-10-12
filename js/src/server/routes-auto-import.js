/**
 * Browser auto-import routes (JS server only — see SERVER-PARITY.md).
 *
 *   GET  /api/auto-import                   -> { available, reason, providers, jobs }
 *   POST /api/auto-import        {provider} -> job (opens the browser)
 *   GET  /api/auto-import/jobs/:id          -> job
 *   POST /api/auto-import/jobs/:id/capture  -> job (reads the open chat)
 *   POST /api/auto-import/jobs/:id/stop     -> job (closes the browser)
 *
 * These routes start processes on the user's machine, so mutating calls
 * must come from the SPA itself: a JSON content type (which forces a
 * CORS preflight this server never approves) and, when the browser sends
 * one, an Origin matching the Host the request was addressed to.
 */

import { json, readBody } from './util.js';
import {
  createAutoImportManager,
  describeRecipes,
  probeBrowserAutomation,
} from '../sources/auto-import/index.js';

const PREFIX = '/api/auto-import';
const JOB_ROUTE =
  /^\/api\/auto-import\/jobs\/([A-Za-z0-9-]+)(?:\/(capture|stop))?$/;

export const isTrustedMutation = (req) => {
  const type = String(req.headers['content-type'] ?? '');
  if (!type.toLowerCase().startsWith('application/json')) {
    return false;
  }
  const origin = req.headers.origin;
  if (!origin) {
    return true; // CLI / curl / same-process callers send no Origin.
  }
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
};

const managerFor = (store, ctx) => {
  if (!ctx.autoImport) {
    ctx.autoImport = createAutoImportManager({
      store,
      dataDir: ctx.storeDir,
      log: ctx.log,
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
  return (
    json(res, 200, {
      available,
      reason,
      providers: describeRecipes(),
      jobs: ctx.autoImport?.list() ?? [],
    }) ?? true
  );
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
  if (req.method === 'POST' && !isTrustedMutation(req)) {
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
