/**
 * Greetings API (issue #35).
 *
 * Thin HTTP skin over `js/src/greetings`: the catalogue and the plan
 * preview need no network access; listing stickers live and sending a
 * queued plan go through the source adapters with the credentials the
 * store holds as `secret:*` links. Tests inject `ctx.greetingSources`
 * (and `ctx.greetingSleep`) so nothing reaches a real network.
 *
 * Endpoints:
 *   GET  /api/greetings/catalogue     networks, built-in stickers, sets
 *   GET  /api/greetings/selection     stickers/texts the user picked
 *   PUT  /api/greetings/selection     save the pick
 *   POST /api/greetings/stickers      list greeting stickers live
 *   POST /api/greetings/plan          { mode, networks, limit, run }
 *                                     -> plan (+ results when queued)
 *   GET  /api/greetings/file?id=…     Telegram thumbnail proxy (the
 *                                     download URL embeds the bot token)
 */

import { json, readBody, text } from './util.js';
import { getSource } from '../sources/index.js';
import {
  greetingCatalogue,
  listLiveGreetingStickers,
  loadGreetingCredentials,
  loadGreetingSelection,
  planGreetings,
  runGreetings,
  saveGreetingSelection,
} from '../greetings/index.js';

/** vk-bot pauses 30 s between greetings; never wait longer per send. */
const MAX_DELAY_MS = 60_000;
const MAX_LIMIT = 100;

const FILE_TYPES = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const clamp = (value, fallback, max) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : fallback;
};

const listOrNull = (value) =>
  Array.isArray(value) && value.length > 0 ? value.map(String) : null;

const resolverOf = (ctx) => ctx?.greetingSources ?? getSource;

const handleSelection = async (store, req, res, p) => {
  if (p !== '/api/greetings/selection') {
    return false;
  }
  if (req.method === 'GET') {
    return json(res, 200, await loadGreetingSelection(store)) ?? true;
  }
  if (req.method === 'PUT') {
    const body = await readBody(req).catch(() => ({}));
    return json(res, 200, await saveGreetingSelection(store, body)) ?? true;
  }
  return false;
};

const handleStickers = async (store, req, res, p, ctx) => {
  if (p !== '/api/greetings/stickers' || req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  const result = await listLiveGreetingStickers({
    networks: listOrNull(body.networks) ?? ['vk', 'telegram'],
    selection: await loadGreetingSelection(store),
    resolveSource: resolverOf(ctx),
    credentials: await loadGreetingCredentials(store),
  });
  return json(res, 200, result) ?? true;
};

const greetedIds = async (store) =>
  (await store.query((l) => l.id?.startsWith('greeting:'))).map((l) => l.id);

const handlePlan = async (store, req, res, p, ctx) => {
  if (p !== '/api/greetings/plan' || req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  const plan = planGreetings({
    links: await store.query((l) => l.id?.startsWith('msg:')),
    mode: body.mode === 'reply' ? 'reply' : 'initiate',
    selection: await loadGreetingSelection(store),
    greeted: await greetedIds(store),
    networks: listOrNull(body.networks),
    me: listOrNull([body.me ?? []].flat()),
    limit: clamp(body.limit, 10, MAX_LIMIT),
    staleDays: clamp(body.staleDays, 30, 3650),
  });
  if (body.run !== 'queue') {
    return json(res, 200, plan) ?? true;
  }
  const results = await runGreetings(plan, {
    store,
    resolveSource: resolverOf(ctx),
    credentials: await loadGreetingCredentials(store),
    delayMs: clamp(body.delayMs, 0, MAX_DELAY_MS),
    ...(ctx?.greetingSleep ? { sleep: ctx.greetingSleep } : {}),
  });
  return json(res, 200, { plan, results }) ?? true;
};

const handleFile = async (store, req, res, p, url, ctx) => {
  if (p !== '/api/greetings/file' || req.method !== 'GET') {
    return false;
  }
  const id = url?.searchParams.get('id') ?? '';
  if (!/^[\w-]{1,256}$/.test(id)) {
    return json(res, 400, { error: 'invalid file id' }) ?? true;
  }
  const live = resolverOf(ctx)('telegram')?.live;
  const { token = null } = (await loadGreetingCredentials(store)).telegram;
  const file = await live.fetchFile(id, { token });
  const type = FILE_TYPES[file.path.split('.').pop()?.toLowerCase()];
  if (!type) {
    return json(res, 415, { error: 'not an image', path: file.path }) ?? true;
  }
  res.setHeader('cache-control', 'private, max-age=86400');
  return text(res, 200, Buffer.from(file.bytes), type) ?? true;
};

export const handleGreetingRoutes = async (store, req, res, p, url, ctx) => {
  if (!p.startsWith('/api/greetings/')) {
    return false;
  }
  try {
    if (p === '/api/greetings/catalogue' && req.method === 'GET') {
      return json(res, 200, greetingCatalogue()) ?? true;
    }
    return (
      (await handleSelection(store, req, res, p)) ||
      (await handleStickers(store, req, res, p, ctx)) ||
      (await handlePlan(store, req, res, p, ctx)) ||
      (await handleFile(store, req, res, p, url, ctx))
    );
  } catch (error) {
    return json(res, 502, { error: error.message }) ?? true;
  }
};
