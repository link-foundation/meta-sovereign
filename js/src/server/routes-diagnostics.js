import { classifyOrigin } from './cors.js';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { bodyFailure, json, readBody } from './util.js';

const settings = async (req, res, ctx) => {
  if (req.method === 'GET') {
    return json(res, 200, ctx.diagnostics.read());
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'use GET or POST' });
  }
  try {
    const input = await readBody(req, { limit: 4096, allowEmpty: false });
    if (typeof input.verbose !== 'boolean') {
      return json(res, 400, { error: 'verbose must be true or false' });
    }
    return json(res, 200, await ctx.diagnostics.save(input));
  } catch (error) {
    const [status, answer] = bodyFailure(error) ?? [
      503,
      { error: 'diagnostic settings were not saved' },
    ];
    return json(res, status, answer);
  }
};

const sessionFile = async (req, res, ctx) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'read-only session log' });
  }
  const session = ctx.diagnosticsSession;
  if (!session) {
    return json(res, 404, {
      error: 'this runtime has no persisted session log',
    });
  }
  let file;
  try {
    file = await open(session.file, 'r');
    const { size } = await file.stat();
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${session.metadata().file}"`,
      'content-length': size,
    });
    if (size) {
      // Freeze the byte range: new polling traffic cannot extend this download.
      await pipeline(
        file.createReadStream({ start: 0, end: size - 1, autoClose: false }),
        res
      );
    } else {
      res.end();
    }
  } catch {
    json(res, 503, { error: 'session log download unavailable' });
  } finally {
    await file?.close();
  }
};

const logs = (req, res, url, ctx) => {
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

export const handleDiagnostics = async (req, res, path, url, ctx) => {
  if (
    ![
      '/api/diagnostics/logs',
      '/api/diagnostics/settings',
      '/api/diagnostics/session',
    ].includes(path)
  ) {
    return false;
  }
  if (classifyOrigin(req, ctx.allowOrigins ?? []) === 'denied') {
    json(res, 403, { error: 'app origin required' });
    return true;
  }
  res.setHeader('Cache-Control', 'no-store');
  if (path === '/api/diagnostics/settings') {
    await settings(req, res, ctx);
  } else if (path === '/api/diagnostics/session') {
    await sessionFile(req, res, ctx);
  } else {
    logs(req, res, url, ctx);
  }
  return true;
};
