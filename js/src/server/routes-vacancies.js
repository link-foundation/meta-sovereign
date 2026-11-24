import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { createVacancyService } from '../jobs/service.js';
import { fromApp } from './routes-telegram-files.js';

export const workspaceVacancies = (store, ctx) => {
  if (!ctx.vacancies && ctx.vacanciesClosing) {
    throw Object.assign(new Error('Vacancy reading has stopped.'), {
      code: 'jobs-stopped',
      status: 503,
    });
  }
  return (ctx.vacancies ??= createVacancyService({
    store,
    storeDir: ctx.storeDir,
    ...ctx.vacancyOptions,
    application: {
      prefillLinkedForm: ctx.prefillLinkedForm,
      chatRunner: ctx.answerModel?.draft,
      ...ctx.vacancyOptions?.application,
    },
  }));
};

const bodyLimits = {
  'application-open': 128 * 1024,
  'application-batch-start': 256 * 1024,
  'choice-save': 128 * 1024,
  'cv-workplace-plan': 64 * 1024,
  'technology-catalog-save': 256 * 1024,
  'technology-review-save': 32 * 1024,
  'cv-translate': 80 * 1024,
};

const refused = (req, ctx, read) => {
  if (req.method !== (read ? 'GET' : 'POST')) {
    return [405, 'method-not-allowed'];
  }
  if (!read && !isTrustedMutation(req, ctx.allowOrigins)) {
    return [403, 'forbidden'];
  }
  if (ctx.vacanciesClosing) {
    return [503, 'jobs-stopped'];
  }
  return null;
};
const failureReply = (error) => {
  const code = error.code ?? 'jobs-unavailable';
  const status =
    error.status ??
    (code === 'browser-unavailable'
      ? 503
      : [
            'jobs-busy',
            'jobs-login-conflict',
            'jobs-login-close',
            'jobs-stopped',
            'jobs-technology-conflict',
            'jobs-cv-conflict',
            'jobs-choice-conflict',
            'jobs-skip-conflict',
            'jobs-application-busy',
            'jobs-application-conflict',
            'jobs-application-changed',
            'jobs-application-already-attempted',
            'jobs-application-skipped',
            'jobs-question-deferral-conflict',
            'jobs-application-question-deferred',
          ].includes(code)
        ? 409
        : 400);
  return [
    status,
    {
      code,
      error:
        'The vacancy operation did not complete. Cached snapshots are preserved.',
    },
  ];
};
const replyVacancy = (res, result, file, operation) => {
  if (file) {
    res.writeHead(200, {
      'content-type': result.type,
      'content-length': result.size,
      'content-disposition': `attachment; filename="${result.name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(result.bytes);
    return true;
  }
  if (
    ['login-attention', 'application-attention'].includes(operation) ||
    operation.startsWith('cv-workplace-')
  ) {
    res.setHeader('cache-control', 'no-store');
  }
  return json(res, 200, result) ?? true;
};
export const handleVacancyRoutes = async (store, req, res, path, ctx) => {
  if (!path.startsWith('/api/vacancies/')) {
    return false;
  }
  const operation = path.slice('/api/vacancies/'.length);
  const file = operation === 'resume-export-file';
  const read =
    [
      'capabilities',
      'login-status',
      'login-attention',
      'application-status',
      'application-attention',
      'application-batch-status',
      'discovery-status',
      'application-queue',
      'choices-stored',
      'skips-stored',
      'questions-stored',
      'stored',
      'resumes-stored',
      'resume-export-status',
      'resume-exports-stored',
      'technology-catalog',
      'technology-analysis-stored',
      'technology-review-stored',
      'cv-workplace-plan-stored',
      'cv-workplace-source',
      'cv-watch-status',
      'cv-prepare-status',
      'cv-translation-status',
      'cv-snapshots',
      'cv-publish-status',
    ].includes(operation) || file;
  if (
    !read &&
    ![
      'search',
      'login-open',
      'login-close',
      'login-attention-focus',
      'discovery-start',
      'discovery-stop',
      'application-open',
      'application-attention-focus',
      'application-batch-start',
      'application-batch-stop',
      'application-batch-mode',
      'application-batch-chat-skip',
      'application-read',
      'application-wait',
      'application-prefill',
      'application-resume',
      'application-backup',
      'application-restore',
      'application-defer',
      'application-defer-questions',
      'application-retry',
      'application-advance',
      'application-continue',
      'application-mode',
      'application-close',
      'choice-save',
      'choice-clear',
      'skip-clear',
      'question-change',
      'collect',
      'cancel',
      'resumes',
      'resume-export',
      'resume-export-cancel',
      'technology-catalog-save',
      'technology-analyze',
      'technology-review',
      'technology-review-save',
      'cv-watch',
      'cv-publish-plan',
      'cv-publish',
      'cv-prepare',
      'cv-prepare-cancel',
      'cv-translate',
      'cv-translation-cancel',
      'cv-workplace-membership',
      'cv-workplace-dictionaries',
      'cv-workplace-plan',
      'cv-workplace-review',
      'cv-watch-stop',
    ].includes(operation)
  ) {
    return false;
  }
  const refusal = refused(req, ctx, read);
  if (refusal) {
    return json(res, refusal[0], { code: refusal[1] }) ?? true;
  }
  if (file && !fromApp(req, ctx.allowOrigins)) {
    return json(res, 403, { code: 'forbidden' }) ?? true;
  }
  try {
    const input = read
      ? Object.fromEntries(new URL(req.url, 'http://local').searchParams)
      : await readBody(req, {
          limit: bodyLimits[operation] ?? 8192,
        });
    const service = workspaceVacancies(store, ctx);
    const result = await service[operation](input);
    return replyVacancy(res, result, file, operation);
  } catch (error) {
    return json(res, ...failureReply(error)) ?? true;
  }
};
