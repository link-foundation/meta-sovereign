/**
 * Automations API (issue #31 / PR #34) — see `../automation/`.
 *
 * Endpoints:
 *   GET    /api/automations            → { automations } saved + presets
 *   GET    /api/automations/presets    → { presets }
 *   PUT    /api/automations            { automation } → saved automation
 *   DELETE /api/automations/:id
 *   POST   /api/automations/plan       { automation, targets?, limit? }
 *                                      → who it would message and why not
 *   POST   /api/automations/run        { automation, targets?, confirm?,
 *                                        trigger?, test?, limit? }
 *          Safe mode queues drafts; auto mode sends paced and needs
 *          `confirm: true` for manual and chat-menu runs. `test: true`
 *          with targets ignores the conditions (the chat menu's "test").
 *   GET    /api/automations/drafts?source=&chat=&automation=
 *   POST   /api/automations/drafts/send { id, confirm: true, text?, form? }
 *   POST   /api/automations/drafts/form { id, form }
 *   POST   /api/automations/drafts/mark { id }  (sent by hand)
 *   POST   /api/automations/drafts/skip { id }
 *   GET    /api/automations/history?automation=
 *   POST   /api/send   { source, chat, text, contact? } → the chat composer;
 *                      API first, the official web UI when it fails
 *   POST   /api/typing { source, chat } → show our typing status
 *   GET    /api/typing?source=&chat=   → who is typing now
 *
 * `automation` is an id (saved or preset) or a whole definition, so the
 * chat menu can test an edited automation before saving it.
 */

import { json, readBody } from './util.js';
import { confirmed } from './confirmations.js';
import {
  AUTOMATION_PREFIX,
  automationPresets,
  normalizeAutomation,
} from '../automation/automations.js';
import { listAutomations } from '../automation/drafts.js';
import { isTypingActive, typingLink } from '../sources/live-links.js';

const fail = (res, status, code, error) =>
  json(res, status, { error, code }) ?? true;

const validChat = (body) =>
  typeof body.source === 'string' &&
  body.source !== '' &&
  body.chat !== undefined &&
  body.chat !== null &&
  String(body.chat) !== '';

const targetsOf = (body) =>
  Array.isArray(body.targets)
    ? body.targets.filter(validChat).map((t) => ({
        source: t.source,
        chat: String(t.chat),
      }))
    : undefined;

const automationOf = (body) => {
  if (!body.automation) {
    throw new Error('automation (an id or a definition) is required');
  }
  return body.automation;
};

/** Store an outgoing message so the chat and the reply graph see it. */
const sentMessage = ({ source, chat, text }, { at, via }) => ({
  id: `msg:${source}:${chat}:out-${Date.parse(at)}`,
  tokens: ['message', source, String(chat)],
  source,
  chat: String(chat),
  sender: 'me',
  body: text,
  timestamp: at,
  ...(via ? { via } : {}),
});

// The links a send stores: the network's own (a connected Telegram
// account knows the message ids, so the next sync does not show the
// message twice), else one local "sent" link. Each carries the composer's
// `clientId`, which is how the chat matches it to its pending bubble.
const sentLinks = (draft, result) => {
  const stamp = (link) => ({
    ...link,
    ...(result?.via ? { via: result.via } : {}),
    ...(draft.clientId ? { clientId: draft.clientId } : {}),
  });
  const known = result?.links ?? (result?.link ? [result.link] : []);
  if (known.length > 0) {
    return known.map(stamp);
  }
  // Already sent by an earlier try (Telegram told us): the sync brings it.
  if (result?.duplicate) {
    return [];
  }
  return [
    stamp(
      sentMessage(draft, { at: new Date().toISOString(), via: result?.via })
    ),
  ];
};

const SEND_MEMORY_MS = 10 * 60_000;

// A draft (one `clientId`) is sent at most once per server: a second
// request — a double click, a retry after a lost answer — shares the
// first one's outcome instead of sending again. A failed send is
// forgotten, so the user can retry it.
const sendOnce = (ctx, draft, send) => {
  if (!draft.clientId) {
    return send();
  }
  const sends = (ctx.sends ??= new Map());
  const key = `${draft.source}:${draft.chat}:${draft.clientId}`;
  const now = Date.now();
  for (const [k, entry] of sends) {
    if (now - entry.at > SEND_MEMORY_MS) {
      sends.delete(k);
    }
  }
  const known = sends.get(key);
  if (known) {
    return known.promise;
  }
  const promise = send().catch((error) => {
    sends.delete(key);
    throw error;
  });
  sends.set(key, { at: now, promise });
  return promise;
};

const handleSend = async (store, res, body, ctx) => {
  if (!validChat(body) || !String(body.text ?? '').trim()) {
    return fail(res, 400, 'bad-message', 'source, chat and text are needed');
  }
  if (typeof ctx.send !== 'function') {
    return fail(res, 501, 'no-sender', 'no sender is configured');
  }
  const clientId =
    typeof body.clientId === 'string' && body.clientId.length <= 100
      ? body.clientId
      : null;
  const draft = {
    source: body.source,
    chat: String(body.chat),
    contact: body.contact ?? null,
    text: String(body.text),
    ...(clientId ? { clientId } : {}),
  };
  // The composer's Send press confirms exactly this text.
  const ok = await confirmed(ctx, res, {
    action: 'message.send',
    body,
    prepare: async () => ({ preview: draft }),
  });
  if (!ok) {
    return true;
  }
  try {
    const sent = await sendOnce(ctx, draft, async () => {
      const result = await ctx.send(draft);
      const links = sentLinks(draft, result);
      for (const link of links) {
        await store.put(link);
      }
      return {
        status: 'sent',
        via: result?.via,
        link: links.at(-1) ?? null,
        links,
      };
    });
    return json(res, 200, sent);
  } catch (error) {
    return json(res, error.code === 'flood-wait' ? 429 : 502, {
      error: error.message,
      code: error.code ?? 'send-failed',
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    });
  }
};

const handleTyping = async (store, res, body, ctx) => {
  if (!validChat(body)) {
    return fail(res, 400, 'bad-chat', 'source and chat are needed');
  }
  // Shown in our own UI even when the network has no typing API.
  const link = typingLink({ source: body.source, chat: body.chat, user: 'me' });
  await store.put(link);
  const out = await ctx.setTyping({ source: body.source, chat: body.chat });
  return json(res, 200, { ...out, link });
};

const draftAction = (method) => async (store, res, body, ctx) => {
  if (typeof body.id !== 'string') {
    return fail(res, 400, 'bad-draft', 'id is required');
  }
  const runner = ctx.automations.runner;
  if (method === 'send') {
    // One draft per confirmation, exactly as the user saw (or edited) it.
    const ok = await confirmed(ctx, res, {
      action: 'draft.send',
      body,
      prepare: async () => ({
        preview: { id: body.id, text: body.text ?? null, form: body.form },
      }),
    });
    if (!ok) {
      return true;
    }
  }
  const result = {
    send: () =>
      runner.sendDraft(body.id, {
        confirm: true,
        text: body.text,
        form: body.form,
      }),
    form: () => runner.setDraftForm(body.id, body.form),
    mark: () => runner.markSent(body.id),
    skip: () => runner.skip(body.id),
  }[method]();
  const outcome = await result;
  return json(res, outcome.status === 'failed' ? 502 : 200, outcome);
};

// Safe mode only queues drafts. Auto mode sends, so the user first sees
// the planned messages and confirms them; exactly those are sent.
const handleRun = async (store, res, body, ctx) => {
  const runner = ctx.automations.runner;
  const automation = await runner.load(automationOf(body));
  const options = {
    targets: targetsOf(body),
    trigger: body.trigger === 'chat-menu' ? 'chat-menu' : 'manual',
    test: body.test === true,
    limit: body.limit,
  };
  if (automation.mode !== 'auto') {
    return json(res, 200, await runner.run(automation, options));
  }
  const ok = await confirmed(ctx, res, {
    action: 'automation.send',
    body,
    prepare: async () => {
      const planned = await runner.plan(automation, options);
      return { preview: planned, data: planned.drafts };
    },
  });
  if (!ok) {
    return true;
  }
  return json(
    res,
    200,
    await runner.run(automation, { ...options, confirmed: ok.data })
  );
};

const POST = {
  '/api/automations/plan': async (store, res, body, ctx) =>
    json(
      res,
      200,
      await ctx.automations.runner.plan(
        await ctx.automations.runner.load(automationOf(body)),
        {
          targets: targetsOf(body),
          limit: body.limit,
          test: body.test === true,
        }
      )
    ),
  '/api/automations/run': handleRun,
  '/api/automations/drafts/send': draftAction('send'),
  '/api/automations/drafts/form': draftAction('form'),
  '/api/automations/drafts/mark': draftAction('mark'),
  '/api/automations/drafts/skip': draftAction('skip'),
  '/api/send': handleSend,
  '/api/typing': handleTyping,
};

const typingNow = async (store, q) => {
  const now = Date.now();
  return (await store.query()).filter(
    (l) =>
      l?.id?.startsWith('typing:') &&
      (!q.get('source') || l.source === q.get('source')) &&
      (!q.has('chat') || String(l.chat) === q.get('chat')) &&
      isTypingActive(l, now)
  );
};

const GET = {
  '/api/automations': async (store) => ({
    automations: await listAutomations(store),
  }),
  '/api/automations/presets': async () => ({ presets: automationPresets() }),
  '/api/automations/drafts': async (store, q, ctx) => ({
    drafts: await ctx.automations.runner.drafts({
      source: q.get('source') || undefined,
      chat: q.has('chat') ? q.get('chat') : undefined,
      automation: q.get('automation') || undefined,
    }),
  }),
  '/api/automations/history': async (store, q, ctx) => ({
    records: await ctx.automations.runner.history({
      automation: q.get('automation') || undefined,
    }),
  }),
  '/api/typing': async (store, q) => ({ typing: await typingNow(store, q) }),
};

const handleWrite = async (store, req, res, p) => {
  if (req.method === 'PUT' && p === '/api/automations') {
    const body = await readBody(req);
    const automation = normalizeAutomation(body.automation ?? body);
    await store.put(automation);
    return json(res, 200, automation) ?? true;
  }
  const prefix = '/api/automations/';
  if (req.method === 'DELETE' && p.startsWith(prefix)) {
    const key = decodeURIComponent(p.slice(prefix.length));
    const id = key.startsWith(AUTOMATION_PREFIX)
      ? key
      : `${AUTOMATION_PREFIX}${key}`;
    await store.delete(id);
    return json(res, 200, { deleted: id }) ?? true;
  }
  return false;
};

const statusFor = (error) =>
  error.code === 'confirm-required' ? [400, error.code] : [400, 'bad-request'];

export const handleAutomationRoutes = async (store, req, res, p, url, ctx) => {
  const get = req.method === 'GET' ? GET[p] : null;
  const post = req.method === 'POST' ? POST[p] : null;
  const isWrite = ['PUT', 'DELETE'].includes(req.method);
  if (!get && !post && !(isWrite && p.startsWith('/api/automations'))) {
    return false;
  }
  try {
    if (get) {
      json(res, 200, await get(store, url.searchParams, ctx));
    } else if (post) {
      await post(store, res, await readBody(req), ctx);
    } else if (!(await handleWrite(store, req, res, p))) {
      return false;
    }
  } catch (error) {
    const [status, code] = statusFor(error);
    fail(res, status, code, error.message);
  }
  return true;
};
