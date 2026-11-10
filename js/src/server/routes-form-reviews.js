import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

const actions = {
  open: (forms, body) =>
    forms.openReview({
      url: body.url,
      browserSlot: body.browserSlot,
      headless: body.headless,
    }),
  read: (forms, body) => forms.readReview(body.id),
  focus: (forms, body) => forms.focusReview(body.id),
  close: (forms, body) => forms.closeReview(body.id),
};
export const handleFormReviewRoutes = async (req, res, p, ctx) => {
  if (p === '/api/forms/sessions' && req.method === 'GET') {
    json(res, 200, ctx.forms.listReviews());
    return true;
  }
  const action = p.startsWith('/api/forms/sessions/')
    ? p.slice('/api/forms/sessions/'.length)
    : '';
  if (!Object.hasOwn(actions, action)) {
    return false;
  }
  if (req.method !== 'POST') {
    json(res, 405, {
      ok: false,
      code: 'form-method',
      error: 'Use POST for review session controls.',
    });
  } else if (!isTrustedMutation(req, ctx.allowOrigins)) {
    json(res, 403, {
      ok: false,
      code: 'forbidden',
      error: 'untrusted request',
    });
  } else {
    json(
      res,
      200,
      await actions[action](ctx.forms, await readBody(req, { limit: 8192 }))
    );
  }
  return true;
};
