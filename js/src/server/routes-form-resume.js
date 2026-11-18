import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import {
  configuredResume,
  saveConfiguredResume,
  deleteConfiguredResume,
} from '../forms/configured-resume.js';

export const handleFormResumeRoutes = async (store, req, res, p, ctx) => {
  if (
    ![
      '/api/forms/resume',
      '/api/forms/resume/save',
      '/api/forms/resume/delete',
    ].includes(p)
  ) {
    return false;
  }
  if (p === '/api/forms/resume' && req.method === 'GET') {
    json(res, 200, { ok: true, resume: await configuredResume(store) });
  } else if (req.method !== 'POST' || p === '/api/forms/resume') {
    json(res, 405, {
      ok: false,
      code: 'form-method',
      error: 'Use GET for status or POST for save/delete.',
    });
  } else if (!isTrustedMutation(req, ctx.allowOrigins)) {
    json(res, 403, {
      ok: false,
      code: 'forbidden',
      error: 'untrusted request',
    });
  } else {
    const save = p.endsWith('/save');
    const input = await readBody(req, { limit: save ? 12 * 1024 ** 2 : 8192 });
    json(
      res,
      200,
      await (save ? saveConfiguredResume : deleteConfiguredResume)(store, input)
    );
  }
  return true;
};
