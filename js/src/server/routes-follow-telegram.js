import { json, readBody } from './util.js';

const ROOT = '/api/automations/follow/telegram';
export const followTelegramRoute = async (ctx, req, res, path, url) => {
  const action =
    req.method === 'GET' && path === ROOT
      ? 'followTelegramList'
      : req.method === 'POST'
        ? {
            [`${ROOT}/preview`]: 'followTelegramPreview',
            [`${ROOT}/apply`]: 'followTelegramApply',
            [`${ROOT}/cancel`]: 'followTelegramCancel',
          }[path]
        : null;
  if (!action) {
    return false;
  }
  const account = ctx.telegramAccount;
  if (typeof account?.[action] !== 'function') {
    json(res, 501, { ok: false, code: 'user-account-required' });
    return true;
  }
  const body =
    req.method === 'GET'
      ? Object.fromEntries(url.searchParams)
      : await readBody(req);
  try {
    json(res, 200, await account[action](body));
  } catch {
    json(res, 200, {
      ok: false,
      code:
        action === 'followTelegramApply' ? 'outcome-unknown' : 'read-failed',
    });
  }
  return true;
};
