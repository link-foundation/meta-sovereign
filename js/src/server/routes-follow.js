import { json, readBody } from './util.js';
import {
  extractFollowLinks,
  listFollowLinks,
  clearFollowLinks,
} from '../follow/link-cache.js';

const ROOT = '/api/automations/follow';
export const followRoute = async (store, req, res, path, url) => {
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
