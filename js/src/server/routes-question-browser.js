import { json, readBody } from './util.js';
import { safeMessage } from './redact.js';
import { isTrustedMutation } from './routes-auto-import.js';

const ROOT = '/api/automations/answers/browser';
export const questionBrowserRoute = async (req, res, path, ctx) => {
  if (path === ROOT && req.method === 'GET') {
    json(res, 200, ctx.questionBrowser.capabilities());
    return true;
  }
  const action = {
    [`${ROOT}/inspect`]: 'inspect',
    [`${ROOT}/prefill`]: 'prefill',
    [`${ROOT}/select`]: 'select',
    [`${ROOT}/status`]: 'status',
    [`${ROOT}/watch-start`]: 'watchStart',
    [`${ROOT}/watch-status`]: 'watchStatus',
    [`${ROOT}/watch-stop`]: 'watchStop',
  }[path];
  if (req.method !== 'POST' || !action) {
    return false;
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    json(res, 403, {
      code: 'origin-not-allowed',
      error: 'A trusted origin is required.',
    });
    return true;
  }
  try {
    json(res, 200, await ctx.questionBrowser[action](await readBody(req)));
  } catch (error) {
    json(res, 400, {
      code: error.code ?? 'question-browser-failed',
      error: safeMessage(error),
    });
  }
  return true;
};
