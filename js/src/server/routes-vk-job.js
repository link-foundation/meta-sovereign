import { bodyFailure, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

/** VK jobs share transport, origin admission and truthful server capabilities. */
export const createVkJobRoute = ({ path: base, load, save, actions }) => {
  const paths = new Set([
    base,
    ...Object.keys(actions).map((name) => `${base}/${name}`),
  ]);
  return async (store, req, res, path, _url, ctx) => {
    if (!paths.has(path)) {
      return false;
    }
    try {
      let answer;
      if (req.method === 'GET' && path === base) {
        answer = await load(store);
      } else if (req.method === 'POST') {
        if (!isTrustedMutation(req, ctx.allowOrigins)) {
          return (
            json(res, 403, { ok: false, error: 'app origin required' }) ?? true
          );
        }
        const body = await readBody(req);
        answer =
          path === base
            ? await save(store, body)
            : await actions[path.slice(base.length + 1)](ctx, body);
      } else {
        return (
          json(res, 405, { ok: false, error: 'method not supported' }) ?? true
        );
      }
      return (
        json(res, 200, {
          ...answer,
          canRun: true,
          schedulerRunning: ctx.vkOnlineScheduled,
        }) ?? true
      );
    } catch (error) {
      const [status, body] = bodyFailure(error) ?? [
        400,
        { ok: false, error: error.message },
      ];
      return json(res, status, body) ?? true;
    }
  };
};
