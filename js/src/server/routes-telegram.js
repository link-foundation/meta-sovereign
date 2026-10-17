/**
 * The connected Telegram account (see ../sources/telegram-account.js).
 *   GET  /api/telegram/status          -> { connected, kind, account, at, … }
 *   POST /api/telegram/sync    {full?} -> the status after a sync
 *   POST /api/telegram/history {chat, before?, limit?, priority?}
 *                                      -> { written, cached, complete } the
 *                                         chat's newest messages, or the page
 *                                         before message `before`; the store
 *                                         answers what it already holds
 *   POST /api/telegram/dialogs {priority?}
 *                                      -> { written, complete } the next page
 *                                         of the chat list
 *   POST /api/telegram/read {chat, maxId}
 *                                      -> { ok } marks the chat read up to
 *                                         maxId on Telegram (forward only)
 *   POST /api/telegram/draft {chat, text}
 *                                      -> { ok } the chat's cloud draft
 * Responses carry the account's public name and counts, never a secret.
 */

import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

const PREFIX = '/api/telegram/';

const NONE = { connected: false, kind: null, account: null };

// Only the page asks for what the user looks at; anything else waits.
const PRIORITIES = new Set(['view', 'list', 'prefetch']);
const priorityOf = (value) => (PRIORITIES.has(value) ? value : 'prefetch');

// POST /api/telegram/<name>: [status, answer] for one request body.
const POSTS = {
  sync: async (account, body) => [
    200,
    await account.sync({ full: Boolean(body.full), reason: 'manual' }),
  ],
  read: async (account, body) => [
    200,
    await account.markRead({ chat: body.chat, maxId: body.maxId }),
  ],
  draft: async (account, body) => {
    const text = typeof body.text === 'string' ? body.text : '';
    if (text.length > 20_000) {
      return [400, { error: 'draft too long', code: 'too-long' }];
    }
    return [200, await account.saveDraft({ chat: body.chat, text })];
  },
  history: async (account, body) => [
    200,
    await account.history({
      chat: body.chat,
      limit: Math.min(Number(body.limit) || 50, 100),
      before:
        Number.isInteger(body.before) && body.before > 0 ? body.before : null,
      priority: priorityOf(body.priority),
    }),
  ],
  dialogs: async (account, body) => [
    200,
    (await account.moreDialogs?.({ priority: priorityOf(body.priority) })) ?? {
      written: 0,
      complete: true,
    },
  ],
};

const dispatch = async (account, req, res, p) => {
  if (p === `${PREFIX}status` && req.method === 'GET') {
    const status = await account.status();
    // Connected but never synced (a key pasted by hand, a restart before
    // the first poll): start the first sync now; the UI polls the status.
    if (status.auto && !status.at && !status.syncing) {
      account.sync({ full: true, reason: 'status' }).catch(() => {});
      return json(res, 200, { ...status, syncing: true }) ?? true;
    }
    return json(res, 200, status) ?? true;
  }
  const post = POSTS[p.slice(PREFIX.length)];
  if (req.method !== 'POST' || !Object.hasOwn(POSTS, p.slice(PREFIX.length))) {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  const [status, answer] = await post(account, body);
  return json(res, status, answer) ?? true;
};

export const handleTelegramRoutes = async (req, res, p, ctx) => {
  if (!p.startsWith(PREFIX)) {
    return false;
  }
  const account = ctx.telegramAccount;
  if (!account) {
    return p === `${PREFIX}status` ? (json(res, 200, NONE) ?? true) : false;
  }
  if (req.method === 'POST' && !isTrustedMutation(req, ctx.allowOrigins)) {
    return (
      json(res, 403, {
        error: 'telegram sync must be started from the meta-sovereign app',
      }) ?? true
    );
  }
  try {
    return await dispatch(account, req, res, p);
  } catch (error) {
    ctx.log?.({
      level: 'error',
      event: 'telegram_route_failed',
      path: p,
      error: error.message,
    });
    return (
      json(res, 502, {
        error: error.message,
        code: error.code,
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      }) ?? true
    );
  }
};
