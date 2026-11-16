import { classifyOrigin } from './cors.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { bodyFailure, json, readBody } from './util.js';

const permitted = (req, ctx, action) =>
  classifyOrigin(req, ctx.allowOrigins ?? []) !== 'denied' &&
  (action === 'status' || isTrustedMutation(req, ctx.allowOrigins));
const validInput = (input, action) =>
  input &&
  (action === 'configure'
    ? Object.keys(input).length === 2 &&
      typeof input.document === 'string' &&
      typeof input.revision === 'string'
    : Object.keys(input).length === 1 &&
      ['local', 'server'].includes(input.mode));
const readOnly = (action) => ['status', 'profile', 'inspect'].includes(action);
const readInput = (req, action) => {
  if (action === 'inspect') {
    const entries = [...new URL(req.url, 'http://local').searchParams];
    return entries.length === 1 ? Object.fromEntries(entries) : null;
  }
  return readOnly(action)
    ? {}
    : readBody(req, {
        limit: action === 'configure' ? 131072 : 1024,
        allowEmpty: false,
      });
};
const failureResponse = (res, error) => {
  const failure = bodyFailure(error);
  const busy = error.code === 'STORE_LOCKED';
  return json(
    res,
    failure?.[0] ??
      (error.code === 'INVALID_RUNNER_PROFILE' ? 400 : busy ? 409 : 503),
    {
      ok: false,
      code:
        failure || error.code === 'INVALID_RUNNER_PROFILE'
          ? 'invalid-runner-action'
          : busy
            ? 'runner-controller-busy'
            : 'runner-control-unconfirmed',
    }
  );
};

/** Execution selects configured targets; configuration owns one fixed profile. */
export const handleRunner = async (req, res, path, ctx) => {
  const match =
    /^\/api\/runner(?:\/(start|stop|profile|configure|inspect))?$/.exec(path);
  if (!match) {
    return false;
  }
  const action = match[1] ?? 'status';
  res.setHeader('Cache-Control', 'no-store');
  if (!permitted(req, ctx, readOnly(action) ? 'status' : action)) {
    json(res, 403, { ok: false, code: 'app-origin-required' });
    return true;
  }
  if (req.method !== (readOnly(action) ? 'GET' : 'POST')) {
    json(res, 405, { ok: false, code: 'method-not-allowed' });
    return true;
  }
  try {
    const input = await readInput(req, action);
    if (
      (!readOnly(action) || action === 'inspect') &&
      !validInput(input, action)
    ) {
      json(res, 400, { ok: false, code: 'invalid-runner-action' });
      return true;
    }
    const answer = await ctx.runnerSessions.execute({
      action,
      mode: input.mode,
      document: input.document,
      revision: input.revision,
    });
    json(res, answer.code === 'runner-profile-conflict' ? 409 : 200, answer);
  } catch (error) {
    failureResponse(res, error);
  }
  return true;
};
