import { readBody, json, bodyFailure } from './util.js';
import { createFollowBacklinks } from '../follow/backlinks.js';
import { backlinkError } from '../follow/backlink-shape.js';

const ROOT = '/api/automations/follow/backlinks';
const pageInput = (input) => {
  for (const key of ['limit', 'offset']) {
    if (input[key] !== undefined) {
      input[key] = /^\d+$/u.test(input[key]) ? Number(input[key]) : NaN;
    }
  }
  return input;
};
const respondFailure = (res, error) => {
  const body = bodyFailure(error);
  if (body) {
    return json(res, ...body);
  }
  const failure = backlinkError(error);
  const status =
    failure.code === 'not-found'
      ? 404
      : ['bad-request', 'confirmation-required'].includes(failure.code)
        ? 400
        : 409;
  return json(res, status, { ok: false, ...failure });
};
const serviceOf = (store, ctx) => {
  if (ctx.followClosing) {
    throw Object.assign(new Error('stopped'), { code: 'stopped' });
  }
  ctx.followBacklinks ??= createFollowBacklinks({
    store,
    ...ctx.followBacklinkOptions,
    trace: (event) => {
      if (process.env.MS_FOLLOW_DEBUG === '1') {
        ctx.log?.({ level: 'debug', ...event });
      }
    },
  });
  return ctx.followBacklinks;
};
export const followBacklinkRoute = async (store, ctx, req, res, path, url) => {
  if (path !== ROOT && !path.startsWith(`${ROOT}/`)) {
    return false;
  }
  const action = path.slice(ROOT.length + 1);
  const read = req.method === 'GET' && ['', 'status'].includes(action);
  const write =
    req.method === 'POST' &&
    ['preview', 'apply', 'resume', 'cancel'].includes(action);
  if (!read && !write) {
    return false;
  }
  try {
    const service = serviceOf(store, ctx);
    const input = read
      ? Object.fromEntries(url.searchParams)
      : await readBody(req);
    if (read && action === '') {
      pageInput(input);
    }
    const result = await service[action || 'list'](input);
    json(res, 200, result);
  } catch (error) {
    respondFailure(res, error);
  }
  return true;
};
