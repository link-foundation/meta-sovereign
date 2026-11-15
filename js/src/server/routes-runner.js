import { classifyOrigin } from './cors.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { bodyFailure, json, readBody } from './util.js';

const permitted = (req, ctx, action) =>
  classifyOrigin(req, ctx.allowOrigins ?? []) !== 'denied' &&
  (action === 'status' || isTrustedMutation(req, ctx.allowOrigins));
const validInput = (input) =>
  input &&
  Object.keys(input).length === 1 &&
  ['local', 'server'].includes(input.mode);
const failureResponse = (res, error) => {
  const failure = bodyFailure(error);
  const busy = error.code === 'STORE_LOCKED';
  return json(res, failure?.[0] ?? (busy ? 409 : 503), {
    ok: false,
    code: failure
      ? 'invalid-runner-action'
      : busy
        ? 'runner-controller-busy'
        : 'runner-control-unconfirmed',
  });
};

/** HTTP callers select an action, never an executable, profile path or host. */
export const handleRunner = async (req, res, path, ctx) => {
  const match = /^\/api\/runner(?:\/(start|stop))?$/.exec(path);
  if (!match) {
    return false;
  }
  const action = match[1] ?? 'status';
  res.setHeader('Cache-Control', 'no-store');
  if (!permitted(req, ctx, action)) {
    json(res, 403, { ok: false, code: 'app-origin-required' });
    return true;
  }
  if (req.method !== (action === 'status' ? 'GET' : 'POST')) {
    json(res, 405, { ok: false, code: 'method-not-allowed' });
    return true;
  }
  try {
    const input =
      action === 'status'
        ? {}
        : await readBody(req, {
            limit: 1024,
            allowEmpty: false,
          });
    if (action !== 'status' && !validInput(input)) {
      json(res, 400, { ok: false, code: 'invalid-runner-action' });
      return true;
    }
    const answer = await ctx.runnerSessions.execute({
      action,
      mode: input.mode,
    });
    json(res, 200, answer);
  } catch (error) {
    failureResponse(res, error);
  }
  return true;
};
