/**
 * CV synchronisation API (R-V16).
 *
 * Thin HTTP skin over `js/src/cv`: the catalogue and the dry-run plans
 * need no browser at all, while `read`/`sync` open one through the
 * facade. Tests inject `ctx.cvCommander` (or `ctx.cvSessionFactory`)
 * so the whole surface is verifiable without downloading Chromium.
 *
 * Endpoints:
 *   GET  /api/cv/platforms            catalogue of supported platforms
 *   GET  /api/cv/plan?platform=…      declarative plan + evidence
 *   GET  /api/cv/stored               snapshots the store already holds
 *   POST /api/cv/read                 live read of one or more platforms
 *   POST /api/cv/compare              cross-platform matrix + diffs
 *   POST /api/cv/sync                 reconcile and (optionally) push,
 *                                     narrowed by `paths`/`groups`
 *   GET  /api/cv/telemetry            recorded run events
 */

import { json, readBody } from './util.js';
import {
  compareAllCvs,
  cvPlatformCatalogue,
  diffAllCvs,
  dryRunPlan,
  getCvPlatform,
  listCvPlatforms,
  loadCvTelemetry,
  loadStoredCvs,
  readAllCvs,
  summarizeCvRuns,
  syncCvAcross,
} from '../cv/index.js';

/** Accept `?platforms=a,b`, `["a","b"]` or nothing (= all). */
const platformIds = (value) => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? value.split(',')
      : null;
  const ids = (raw ?? listCvPlatforms()).map((id) => String(id).trim());
  for (const id of ids) {
    // Throws with the list of known ids, which becomes a 400 below.
    getCvPlatform(id);
  }
  return ids;
};

/** Options shared by every live endpoint. */
const liveOptions = (store, body, ctx) => ({
  store,
  vars: body.vars ?? {},
  headless: body.headless !== false,
  profileDir: body.profileDir ?? null,
  artifactDir: body.artifactDir ?? ctx?.cvArtifactDir ?? null,
  save: body.save !== false,
  recordTelemetry: body.recordTelemetry !== false,
  commander: ctx?.cvCommander ?? null,
  openSession: ctx?.cvSessionFactory ?? undefined,
});

const badRequest = (res, error) =>
  json(res, error.code === 'browser-unavailable' ? 503 : 400, {
    error: error.message,
    code: error.code ?? 'bad-request',
    ...(error.missing ? { missing: error.missing } : {}),
  }) ?? true;

/** Run a handler, turning thrown platform/browser errors into JSON. */
const guarded = async (res, fn) => {
  try {
    return (await fn()) ?? true;
  } catch (error) {
    return badRequest(res, error);
  }
};

const entriesFor = async (store, body) => {
  if (Array.isArray(body.entries) && body.entries.length > 0) {
    return body.entries;
  }
  return loadStoredCvs(store, platformIds(body.platforms));
};

const handleCatalogue = async (store, req, res, p, url) => {
  if (p === '/api/cv/platforms' && req.method === 'GET') {
    return json(res, 200, cvPlatformCatalogue()) ?? true;
  }
  if (p === '/api/cv/plan' && req.method === 'GET') {
    return guarded(res, () => {
      const id = url?.searchParams.get('platform') ?? '';
      return json(res, 200, dryRunPlan(getCvPlatform(id)));
    });
  }
  if (p === '/api/cv/stored' && req.method === 'GET') {
    return guarded(res, async () => {
      const ids = platformIds(url?.searchParams.get('platforms'));
      return json(res, 200, { entries: await loadStoredCvs(store, ids) });
    });
  }
  return false;
};

const handleRead = async (store, req, res, p, ctx) => {
  if (p !== '/api/cv/read' || req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  return guarded(res, async () => {
    const ids = platformIds(body.platforms);
    const result = await readAllCvs(ids, liveOptions(store, body, ctx));
    return json(res, 200, result);
  });
};

const handleCompare = async (store, req, res, p) => {
  if (p !== '/api/cv/compare' || req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  return guarded(res, async () => {
    const entries = await entriesFor(store, body);
    return json(res, 200, {
      entries,
      comparison: compareAllCvs(entries, { prefer: body.prefer ?? null }),
      diffs: diffAllCvs(entries, body.canonical ?? null),
    });
  });
};

const handleSync = async (store, req, res, p, ctx) => {
  if (p !== '/api/cv/sync' || req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  return guarded(res, async () => {
    const ids = platformIds(body.platforms);
    const result = await syncCvAcross(ids, {
      ...liveOptions(store, body, ctx),
      dryRun: body.dryRun !== false,
      prefer: body.prefer ?? null,
      canonical: body.canonical ?? null,
      paths: Array.isArray(body.paths) ? body.paths : null,
      groups: Array.isArray(body.groups) ? body.groups : null,
    });
    return json(res, 200, result);
  });
};

const handleTelemetry = async (store, req, res, p, url) => {
  if (p !== '/api/cv/telemetry' || req.method !== 'GET') {
    return false;
  }
  const search = url?.searchParams;
  const limit = Number(search?.get('limit') ?? 500);
  const events = await loadCvTelemetry(store, {
    runId: search?.get('runId') ?? null,
    platform: search?.get('platform') ?? null,
    type: search?.get('type') ?? null,
    limit: Number.isFinite(limit) ? limit : 500,
  });
  return json(res, 200, { runs: summarizeCvRuns(events), events }) ?? true;
};

export const handleCvRoutes = async (store, req, res, p, url, ctx) => {
  if (!p.startsWith('/api/cv/')) {
    return false;
  }
  return (
    (await handleCatalogue(store, req, res, p, url)) ||
    (await handleRead(store, req, res, p, ctx)) ||
    (await handleCompare(store, req, res, p)) ||
    (await handleSync(store, req, res, p, ctx)) ||
    (await handleTelemetry(store, req, res, p, url))
  );
};
