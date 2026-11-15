import { classifyOrigin } from './cors.js';
import { json } from './util.js';

export const handleDiagnostics = (req, res, path, url, ctx) => {
  if (path !== '/api/diagnostics/logs') {
    return false;
  }
  if (classifyOrigin(req, ctx.allowOrigins ?? []) === 'denied') {
    return json(res, 403, { ok: false, error: 'app origin required' }) ?? true;
  }
  if (req.method !== 'GET') {
    return (
      json(res, 405, { ok: false, error: 'read-only diagnostics' }) ?? true
    );
  }
  const after = Number(url.searchParams.get('after') ?? 0);
  const session = url.searchParams.get('session');
  if (
    !Number.isSafeInteger(after) ||
    after < 0 ||
    (session !== null && !/^[a-f0-9-]{36}$/i.test(session))
  ) {
    return (
      json(res, 400, { ok: false, error: 'invalid diagnostics cursor' }) ?? true
    );
  }
  res.setHeader('Cache-Control', 'no-store');
  return json(res, 200, ctx.logJournal.read({ after, session })) ?? true;
};
