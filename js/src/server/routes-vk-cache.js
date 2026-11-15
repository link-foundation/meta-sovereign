import { isTrustedMutation } from './routes-auto-import.js';
import { json, readBody, bodyFailure } from './util.js';
import { safeMessage } from './redact.js';

export const handleVkCache = async (store, req, res, p, _url, ctx) => {
  const action = p.startsWith('/api/vk/cache/')
    ? p.slice('/api/vk/cache/'.length)
    : '';
  if (!['inspect', 'refresh', 'export'].includes(action)) {
    return false;
  }
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, code: 'method-not-supported' }) ?? true;
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return json(res, 403, { ok: false, code: 'forbidden' }) ?? true;
  }
  try {
    const input = await readBody(req);
    const result = await ctx.vkCache.run(action, input, ctx.storeDir);
    return json(res, 200, result) ?? true;
  } catch (error) {
    const [status, body] = bodyFailure(error) ?? [
      400,
      { ok: false, code: error.code ?? 'failed', error: safeMessage(error) },
    ];
    return json(res, status, body) ?? true;
  }
};
