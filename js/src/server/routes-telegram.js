/**
 * The connected Telegram account (see ../sources/telegram-account.js).
 *   GET  /api/telegram/status          -> { connected, kind, account, at, … }
 *   POST /api/telegram/sync    {full?} -> the status after a sync
 *   POST /api/telegram/history {chat}  -> { written }
 * Responses carry the account's public name and counts, never a secret.
 */

import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

const PREFIX = '/api/telegram/';

const NONE = { connected: false, kind: null, account: null };

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
  if (req.method !== 'POST') {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  if (p === `${PREFIX}sync`) {
    const result = await account.sync({
      full: Boolean(body.full),
      reason: 'manual',
    });
    return json(res, 200, result) ?? true;
  }
  if (p === `${PREFIX}history`) {
    const limit = Math.min(Number(body.limit) || 50, 200);
    const result = await account.history({ chat: body.chat, limit });
    return json(res, 200, result) ?? true;
  }
  return false;
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
    return json(res, 502, { error: error.message, code: error.code }) ?? true;
  }
};
