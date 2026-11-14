import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { handleFormReviewRoutes } from './routes-form-reviews.js';
import { handleFormResumeRoutes } from './routes-form-resume.js';
import { handleAssignmentPublicationRoutes } from './routes-assignment-publication.js';

const isFormPath = (path) =>
  path.startsWith('/api/forms/sessions') ||
  path.startsWith('/api/forms/resume') ||
  path.startsWith('/api/forms/assignment/') ||
  ['/api/forms/capabilities', '/api/forms/read', '/api/forms/plan'].includes(
    path
  );

const handleSpecializedRoutes = async (store, req, res, path, ctx) =>
  (await handleAssignmentPublicationRoutes(req, res, path, ctx)) ||
  (await handleFormResumeRoutes(store, req, res, path, ctx)) ||
  (await handleFormReviewRoutes(req, res, path, ctx));

export const handleFormRoutes = async (store, req, res, p, ctx) => {
  if (!isFormPath(p)) {
    return false;
  }
  try {
    if (await handleSpecializedRoutes(store, req, res, p, ctx)) {
      return true;
    }
    if (p.endsWith('/capabilities') && req.method === 'GET') {
      json(res, 200, await ctx.forms.capabilities());
    } else if (
      [
        '/api/forms/read',
        '/api/forms/plan',
        '/api/forms/assignment/repository',
      ].includes(p) &&
      req.method === 'POST'
    ) {
      if (!isTrustedMutation(req, ctx.allowOrigins)) {
        json(res, 403, { error: 'untrusted request', code: 'forbidden' });
        return true;
      }
      const body = await readBody(req, { limit: 3 * 1024 ** 2 });
      json(
        res,
        200,
        p.endsWith('/repository')
          ? await ctx.forms.registerAssignmentRepository({
              inspection: body.inspection,
              revision: body.revision,
              repository: body.repository,
            })
          : p.endsWith('/plan')
            ? await ctx.forms.plan({
                inspection: body.inspection,
                profileId: body.profileId,
                profile: body.profile,
                approximate: body.approximate,
                matching: body.matching,
                source: body.source,
                chat: body.chat,
                ruleIds: body.ruleIds,
                contexts: body.contexts,
                salary: body.salary,
                vacancy: body.vacancy,
                recent: body.recent,
                modelDraft: body.modelDraft,
              })
            : await ctx.forms.read({
                url: body.url,
                browserSlot: body.browserSlot,
                headless: body.headless,
              })
      );
    } else {
      json(res, 405, {
        error:
          'Use GET for capabilities or POST for a form read or answer plan.',
      });
    }
  } catch (error) {
    const status =
      error.code === 'browser-unavailable'
        ? 503
        : [
              'form-busy',
              'form-slot-in-use',
              'form-session-limit',
              'form-capacity-changed',
              'form-capacity-in-use',
            ].includes(error.code)
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
