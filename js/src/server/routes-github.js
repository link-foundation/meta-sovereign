/**
 * The GitHub inbox routes (R-Z11), all under /api/github/:
 *
 *   GET  repos                  the user's repositories, `selected` marked
 *   GET  settings               { repos, intervalMinutes, notifications,
 *                                 discussions }
 *   POST settings               the same, saved
 *   GET  notifications          the stored notification inbox
 *   POST notifications/read     { threadId } | { all: true } -- the only
 *                               thing that marks anything read on GitHub
 *
 * "Fetch now" and the schedule are the shared pull runner's: POST /api/pull
 * {source: "github"} (./routes-pull.js). Pull, clone and post-comment stay in
 * ./routes-mutating.js. Answers are
 * `{ ok, ... }` or the uniform `{ ok: false, error, code }`.
 */

import { fail, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { safeMessage } from './redact.js';

const STATUS = {
  'bad-request': 400,
  'no-token': 400,
  'rate-limited': 429,
  'discussions-unavailable': 403,
};

const failure = (res, error) => {
  const code = error.code ?? 'github-error';
  const status = STATUS[code] ?? (error.status === 401 ? 401 : 502);
  return (
    json(res, status, {
      ok: false,
      error: safeMessage(error),
      code,
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    }) ?? true
  );
};

const guarded = async (res, work) => {
  try {
    return (await work()) ?? true;
  } catch (error) {
    return failure(res, error);
  }
};

const mutation = async (req, res, ctx, work) => {
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return fail(
      res,
      403,
      'forbidden',
      'GitHub settings must be changed from the meta-sovereign app'
    );
  }
  return guarded(res, async () => work(await readBody(req)));
};

const READ = {
  repos: async (service) => ({ repos: await service.listRepos() }),
  settings: async (service) => ({ settings: await service.settings() }),
  notifications: async (service) => ({
    notifications: await service.notifications(),
  }),
};

const WRITE = {
  settings: async (service, body) => ({
    settings: await service.saveSettings(body),
  }),
  'notifications/read': (service, body) =>
    service.markRead({
      threadId: body.threadId ?? null,
      all: body.all === true,
    }),
};

export const handleGithubRoutes = async (req, res, p, ctx) => {
  const prefix = '/api/github/';
  if (!p.startsWith(prefix) || !ctx.github) {
    return false;
  }
  const name = p.slice(prefix.length);
  if (req.method === 'GET' && Object.hasOwn(READ, name)) {
    return guarded(res, async () =>
      json(res, 200, { ok: true, ...(await READ[name](ctx.github)) })
    );
  }
  if (req.method === 'POST' && Object.hasOwn(WRITE, name)) {
    return mutation(req, res, ctx, async (body) =>
      json(res, 200, { ok: true, ...(await WRITE[name](ctx.github, body)) })
    );
  }
  return false;
};
