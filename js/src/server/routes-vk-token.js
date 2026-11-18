import { classifyOrigin } from './cors.js';
import { bodyFailure, json, readBody } from './util.js';

import { VK_TOKEN_REFUSALS as REFUSALS } from '../transport/vk-token-status.js';

export const handleVkToken = async (req, res, path, ctx) => {
  const match = /^\/api\/vk\/token(?:\/(start|import|cancel))?$/.exec(path);
  if (!match) {
    return false;
  }
  res.setHeader('Cache-Control', 'no-store');
  if (classifyOrigin(req, ctx.allowOrigins ?? []) === 'denied') {
    json(res, 403, { ok: false, code: 'app-origin-required' });
    return true;
  }
  const action = match[1];
  if (req.method !== (action ? 'POST' : 'GET')) {
    json(res, 405, { ok: false, code: 'method-not-allowed' });
    return true;
  }
  try {
    const result = action
      ? await ctx.vkToken[action](
          await readBody(req, {
            limit: action === 'import' ? 12288 : 1024,
            allowEmpty: false,
          })
        )
      : ctx.vkToken.read();
    json(res, 200, result);
  } catch (error) {
    const failure = bodyFailure(error);
    if (failure) {
      json(res, failure[0], { ok: false, code: 'invalid-token-request' });
    } else {
      json(res, REFUSALS.has(error?.code) ? 409 : 503, {
        ok: false,
        code: REFUSALS.has(error?.code) ? error.code : 'authorization-failed',
      });
    }
  }
  return true;
};
