import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { createVacancyService } from '../jobs/service.js';
import { fromApp } from './routes-telegram-files.js';

const bodyLimits = {
  'cv-workplace-plan': 64 * 1024,
  'technology-catalog-save': 256 * 1024,
  'technology-review-save': 32 * 1024,
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
            'jobs-stopped',
            'jobs-technology-conflict',
            'jobs-cv-conflict',
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
const replyVacancy = (res, result, file) => {
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
      'cv-snapshots',
    ].includes(operation) || file;
  if (
    !read &&
    ![
      'search',
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
      'cv-prepare',
      'cv-prepare-cancel',
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
    const service = (ctx.vacancies ??= createVacancyService({
      store,
      storeDir: ctx.storeDir,
      ...ctx.vacancyOptions,
    }));
    const result = await service[operation](input);
    return replyVacancy(res, result, file);
  } catch (error) {
    return json(res, ...failureReply(error)) ?? true;
  }
};
