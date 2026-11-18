import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

export const handleAssignmentPublicationRoutes = async (
  req,
  res,
  path,
  ctx
) => {
  const actions = {
    '/api/forms/assignment/draft': 'draftAssignment',
    '/api/forms/assignment/restore': 'restoreAssignment',
    '/api/forms/assignment/publish': 'publishAssignment',
  };
  const action = actions[path];
  if (!action) {
    return false;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, code: 'method-not-allowed' });
  } else if (!isTrustedMutation(req, ctx.allowOrigins)) {
    json(res, 403, { ok: false, code: 'forbidden' });
  } else if (typeof ctx.forms?.[action] !== 'function') {
    json(res, 503, { ok: false, code: 'assignment-unavailable' });
  } else {
    const body = await readBody(req, { limit: 3 * 1024 ** 2 });
    json(res, 200, await ctx.forms[action](body));
  }
  return true;
};
