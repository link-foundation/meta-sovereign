import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

const actions = {
  capacity: (forms, body) =>
    forms.configureReviewCapacity({
      maxSessions: body.maxSessions,
      revision: body.revision,
    }),
  open: (forms, body) =>
    forms.openReview({
      url: body.url,
      browserSlot: body.browserSlot,
      headless: body.headless,
      autoCapture: body.autoCapture,
      learn: body.learn,
    }),
  read: (forms, body) => forms.readReview(body.id),
  history: (forms, body) => forms.historyReview(body.id),
  focus: (forms, body) => forms.focusReview(body.id),
  close: (forms, body) => forms.closeReview(body.id),
  plan: (forms, body) =>
    forms.planReview({
      id: body.id,
      profileId: body.profileId,
      approximate: body.approximate,
      modelDraft: body.modelDraft,
      salary: body.salary,
      vacancy: body.vacancy,
    }),
  apply: (forms, body) =>
    forms.applyReview({
      id: body.id,
      planId: body.planId,
      fields: body.fields,
      replaceExisting: body.replaceExisting,
    }),
  attach: (forms, body) =>
    forms.attachReview({
      id: body.id,
      planId: body.planId,
      fieldId: body.fieldId,
      file: body.file,
      resumeRevision: body.resumeRevision,
      replaceExisting: body.replaceExisting,
    }),
  disclose: (forms, body) =>
    forms.discloseReview({
      id: body.id,
      planId: body.planId,
      fieldId: body.fieldId,
    }),
};
export const handleFormReviewRoutes = async (req, res, p, ctx) => {
  if (p === '/api/forms/sessions' && req.method === 'GET') {
    await ctx.forms.reviewCapacity();
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
      await actions[action](
        ctx.forms,
        await readBody(req, {
          limit: action === 'attach' ? 12 * 1024 ** 2 : 8192,
        })
      )
    );
  }
  return true;
};
