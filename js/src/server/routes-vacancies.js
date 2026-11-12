import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { createVacancyService } from '../jobs/service.js';

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
      : ['jobs-busy', 'jobs-stopped'].includes(code)
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
export const handleVacancyRoutes = async (store, req, res, path, ctx) => {
  if (!path.startsWith('/api/vacancies/')) {
    return false;
  }
  const operation = path.slice('/api/vacancies/'.length);
  const read = ['capabilities', 'stored'].includes(operation);
  if (!read && !['search', 'collect', 'cancel'].includes(operation)) {
    return false;
  }
  const refusal = refused(req, ctx, read);
  if (refusal) {
    return json(res, refusal[0], { code: refusal[1] }) ?? true;
  }
  try {
    const input = read ? undefined : await readBody(req, { limit: 8192 });
    const service = (ctx.vacancies ??= createVacancyService({
      store,
      ...ctx.vacancyOptions,
    }));
    return json(res, 200, await service[operation](input)) ?? true;
  } catch (error) {
    return json(res, ...failureReply(error)) ?? true;
  }
};
