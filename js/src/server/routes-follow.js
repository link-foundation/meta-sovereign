import { json, readBody } from './util.js';
import { followTelegramRoute } from './routes-follow-telegram.js';
import { followBacklinkRoute } from './routes-follow-backlinks.js';
import { followTimeout } from '../follow/retry.js';
import {
  extractFollowLinks,
  listFollowLinks,
  clearFollowLinks,
} from '../follow/link-cache.js';

const ROOT = '/api/automations/follow';
const discoveryResponse = async (ctx, action, input, res) => {
  try {
    json(res, 200, await ctx.followDiscovery[action](input));
  } catch (error) {
    const known = [
      'not-connected',
      'unsupported',
      'captcha',
      'rate-limited',
      'timeout',
      'bad-request',
      'cancelled',
      'stopped',
      'busy',
      'account-changed',
    ];
    const code = followTimeout(error)
      ? 'timeout'
      : known.includes(error.code)
        ? error.code
        : error.code === 'follow-provider-response'
          ? error.code
          : 'follow-provider-error';
    const status =
      code === 'unsupported'
        ? 404
        : code === 'rate-limited'
          ? 429
          : ['not-connected', 'captcha'].includes(code)
            ? 409
            : 400;
    json(res, status, {
      code,
      error: 'Follow group discovery could not be completed',
      ...(Number.isSafeInteger(error.vkCode)
        ? { providerCode: error.vkCode }
        : {}),
    });
  }
};
export const followRoute = async (store, req, res, path, url, ctx) => {
  if (await followBacklinkRoute(store, ctx, req, res, path, url)) {
    return true;
  }
  if (await followTelegramRoute(ctx, req, res, path, url)) {
    return true;
  }
  if (req.method === 'POST' && path === `${ROOT}/discovery/cancel`) {
    await discoveryResponse(ctx, 'cancel', await readBody(req), res);
    return true;
  }
  const read = {
    [`${ROOT}/chats`]: 'chats',
    [`${ROOT}/details`]: 'details',
  }[path];
  if (req.method === 'GET' && read) {
    await discoveryResponse(
      ctx,
      read,
      Object.fromEntries(url.searchParams),
      res
    );
    return true;
  }
  if (req.method === 'GET' && path === ROOT) {
    json(
      res,
      200,
      await listFollowLinks(store, Object.fromEntries(url.searchParams))
    );
    return true;
  }
  const actions = {
    [`${ROOT}/extract`]: extractFollowLinks,
    [`${ROOT}/clear`]: clearFollowLinks,
  };
  const action = req.method === 'POST' ? actions[path] : null;
  if (!action) {
    return false;
  }
  json(res, 200, await action(store, await readBody(req)));
  return true;
};
