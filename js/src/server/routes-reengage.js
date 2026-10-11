/**
 * Re-engage API (issue #31, R-W9).
 *
 * The SPA plans locally (it holds the same links), so the server is
 * only needed to send through an adapter that has credentials here.
 * Sending is gated twice: one draft per request with `confirm: true`
 * (safe mode), or the whole plan only with `mode: "batch"` and
 * `confirm: true`. Tests inject `ctx.reengageSend` instead of adapters.
 *
 * Endpoints:
 *   POST /api/reengage/plan   { days?, self?, networks?, limit?, templates? }
 *                             → dormant personal contacts with drafts
 *   POST /api/reengage/send   { draft, confirm: true } → send ONE draft
 *   POST /api/reengage/mark   { draft, status: sent|skipped }
 *                             → record a message sent by hand, or a skip
 *   POST /api/reengage/run    { mode: "batch", confirm: true, ...plan }
 *                             → plan and send everything
 */

import { json, readBody } from './util.js';
import { getSource } from '../sources/index.js';
import {
  buildReengageRecord,
  createAdapterSender,
  createReengageSession,
  planReengagement,
} from '../crm/reengage.js';

const fail = (res, status, code, error) =>
  json(res, status, { error, code }) ?? true;

const list = (value) =>
  Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string' && value.trim()
      ? value.split(',').map((item) => item.trim())
      : undefined;

const planFrom = async (store, body) =>
  planReengagement(await store.query(), {
    days: body.days,
    self: list(body.self),
    networks: list(body.networks) ?? null,
    limit: body.limit,
    now: body.now,
    templates: body.templates,
    fallbackForm: body.fallbackForm,
    requireMutual: body.includeUnanswered !== true,
    mode: body.mode,
  });

const senderFor = (ctx) =>
  ctx?.reengageSend ?? createAdapterSender({ getSource });

const validDraft = (draft) =>
  draft &&
  typeof draft.source === 'string' &&
  draft.chat !== undefined &&
  draft.chat !== null &&
  typeof draft.text === 'string' &&
  draft.text.trim() !== '';

const sessionFor = (store, ctx, drafts, mode) =>
  createReengageSession({
    drafts,
    mode,
    send: senderFor(ctx),
    record: (link) => store.put(link),
  });

const handleSend = async (store, res, body, ctx) => {
  if (body.confirm !== true) {
    return fail(
      res,
      400,
      'confirm-required',
      'safe mode: send one draft with confirm: true'
    );
  }
  if (!validDraft(body.draft)) {
    return fail(res, 400, 'bad-draft', 'draft needs source, chat and text');
  }
  const outcome = await sessionFor(store, ctx, [body.draft], 'safe').confirm();
  return json(res, outcome.status === 'sent' ? 200 : 502, {
    status: outcome.status,
    record: outcome.record,
    ...(outcome.error ? { error: outcome.error } : {}),
  });
};

const handleMark = async (store, res, body) => {
  if (!validDraft(body.draft)) {
    return fail(res, 400, 'bad-draft', 'draft needs source, chat and text');
  }
  if (!['sent', 'skipped'].includes(body.status)) {
    return fail(res, 400, 'bad-status', 'status must be "sent" or "skipped"');
  }
  const record = buildReengageRecord(body.draft, {
    status: body.status,
    manual: body.status === 'sent',
  });
  await store.put(record);
  return json(res, 200, { status: body.status, record });
};

const handleRun = async (store, res, body, ctx) => {
  if (body.mode !== 'batch' || body.confirm !== true) {
    return fail(
      res,
      400,
      'safe-mode',
      'sending every draft needs mode: "batch" and confirm: true'
    );
  }
  const plan = await planFrom(store, body);
  const session = sessionFor(store, ctx, plan.drafts, 'batch');
  const results = await session.sendAll();
  return json(res, 200, {
    progress: session.progress(),
    results: results.map((r) => ({
      id: r.draft.id,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
  });
};

const HANDLERS = {
  '/api/reengage/plan': async (store, res, body) =>
    json(res, 200, await planFrom(store, body)),
  '/api/reengage/send': handleSend,
  '/api/reengage/mark': handleMark,
  '/api/reengage/run': handleRun,
};

export const handleReengageRoutes = async (store, req, res, p, ctx) => {
  const handler = HANDLERS[p];
  if (!handler) {
    return false;
  }
  if (req.method !== 'POST') {
    return fail(res, 405, 'method-not-allowed', 'use POST');
  }
  try {
    await handler(store, res, await readBody(req), ctx);
  } catch (error) {
    fail(res, 400, 'bad-request', error.message);
  }
  return true;
};
