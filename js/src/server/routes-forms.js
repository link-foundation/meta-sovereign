import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

export const handleFormRoutes = async (req, res, p, ctx) => {
  if (!['/api/forms/capabilities', '/api/forms/read'].includes(p)) {
    return false;
  }
  try {
    if (p.endsWith('/capabilities') && req.method === 'GET') {
      json(res, 200, await ctx.forms.capabilities());
    } else if (p.endsWith('/read') && req.method === 'POST') {
      if (!isTrustedMutation(req, ctx.allowOrigins)) {
        json(res, 403, { error: 'untrusted request', code: 'forbidden' });
        return true;
      }
      const body = await readBody(req);
      json(
        res,
        200,
        await ctx.forms.read({
          url: body.url,
          browserSlot: body.browserSlot,
          headless: body.headless,
        })
      );
    } else {
      json(res, 405, {
        error: 'Use GET for capabilities or POST for a form read.',
      });
    }
  } catch (error) {
    const status =
      error.code === 'browser-unavailable'
        ? 503
        : error.code === 'form-busy'
          ? 409
          : 400;
    json(res, status, {
      ok: false,
      error: error.message,
      code: error.code ?? 'form-read-failed',
    });
  }
  return true;
};
