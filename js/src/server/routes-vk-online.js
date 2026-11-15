import { loadVkOnline, saveVkOnline } from '../automation/vk-online.js';
import { bodyFailure, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

export const handleVkOnline = async (store, req, res, path, _url, ctx) => {
  if (!['/api/vk/online', '/api/vk/online/run'].includes(path)) {
    return false;
  }
  try {
    let answer;
    if (req.method === 'GET' && path === '/api/vk/online') {
      answer = await loadVkOnline(store);
    } else if (req.method === 'POST') {
      if (!isTrustedMutation(req, ctx.allowOrigins)) {
        return (
          json(res, 403, { ok: false, error: 'app origin required' }) ?? true
        );
      }
      const body = await readBody(req);
      answer = path.endsWith('/run')
        ? await ctx.vkOnline.run()
        : await saveVkOnline(store, body);
    } else {
      return (
        json(res, 405, { ok: false, error: 'method not supported' }) ?? true
      );
    }
    return (
      json(res, 200, {
        ...answer,
        schedulerRunning: ctx.vkOnlineScheduled,
        canRun: true,
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
