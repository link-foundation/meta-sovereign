import { json, readBody, bodyFailure } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { feedbackServiceFor } from './feedback-service.js';

const messageId = (id) =>
  typeof id === 'string' && /^msg:[a-z0-9-]+:.{1,250}$/.test(id);
const pageNumber = (params, key, fallback, max = 1_000_000) => {
  const value = params.get(key);
  const n = value === null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new Error(`bad ${key}`);
  }
  return n;
};

const readFeedbackList = async ({
  service,
  index,
  params,
  pagination,
  res,
}) => {
  const scope = params.get('scope') ?? 'all';
  const sort = params.get('sort') ?? 'score';
  if (
    !['all', 'shared'].includes(scope) ||
    !['score', 'recent'].includes(sort)
  ) {
    throw new Error('bad filter');
  }
  const since = params.get('since') ?? '';
  if (since && Number.isNaN(Date.parse(since))) {
    throw new Error('bad since');
  }
  return (
    json(res, 200, {
      ...(await index.list({
        ...pagination,
        source: params.get('source') ?? '',
        mine: params.get('mine') !== '0',
        scope,
        sort,
        since,
      })),
      settings: await service.settings(),
    }) ?? true
  );
};

const readFeedbackRoute = async ({ service, index, params, p, res }) => {
  const pagination = {
    offset: pageNumber(params, 'offset', 0),
    limit: Math.max(1, pageNumber(params, 'limit', 25, 100)),
  };
  if (p === '/api/feedback/settings') {
    return json(res, 200, await service.settings()) ?? true;
  }
  if (p === '/api/feedback') {
    return readFeedbackList({ service, index, params, pagination, res });
  }
  if (p === '/api/feedback/person') {
    if (!(await service.settings()).profiles) {
      return json(res, 200, { items: [], total: 0, disabled: true }) ?? true;
    }
    const source = params.get('source');
    const peer = params.get('peer');
    if (!source || !peer) {
      throw new Error('source and peer required');
    }
    return json(res, 200, await index.person(source, peer, pagination)) ?? true;
  }
  if (p === '/api/feedback/actors') {
    const id = params.get('id');
    if (!messageId(id)) {
      throw new Error('message id required');
    }
    const result = await service.actors(id, pagination);
    return json(res, result.ok ? 200 : 404, result) ?? true;
  }
  return json(res, 404, { error: 'unknown feedback route' }) ?? true;
};

const writeFeedbackRoute = async ({ service, req, res, p, ctx }) => {
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return json(res, 403, { error: 'app origin required' }) ?? true;
  }
  const body = await readBody(req, { allowEmpty: false });
  if (p === '/api/feedback/settings') {
    if (
      !Object.entries(body).every(
        ([key, value]) =>
          ['enabled', 'profiles'].includes(key) && typeof value === 'boolean'
      )
    ) {
      throw new Error('settings must be booleans');
    }
    return json(res, 200, await service.saveSettings(body)) ?? true;
  }
  if (p === '/api/feedback/collect') {
    if (
      !messageId(body.id) ||
      (body.offset !== undefined &&
        (typeof body.offset !== 'string' || body.offset.length > 2048))
    ) {
      throw new Error('message id and a valid offset required');
    }
    return (
      json(res, 200, await service.collect(body.id, { offset: body.offset })) ??
      true
    );
  }
  return json(res, 404, { error: 'unknown feedback route' }) ?? true;
};

export const handleFeedbackRoutes = async (store, req, res, p, url, ctx) => {
  if (!p.startsWith('/api/feedback')) {
    return false;
  }
  if (!ctx.chatIndex?.feedback) {
    return (
      json(res, 503, {
        error: 'feedback is starting',
        code: 'server-starting',
      }) ?? true
    );
  }
  const service = feedbackServiceFor(store, ctx);
  const params = url.searchParams;
  try {
    await ctx.chatIndex.ready();
    if (req.method === 'GET') {
      return await readFeedbackRoute({
        service,
        index: ctx.chatIndex.feedback,
        params,
        p,
        res,
      });
    }
    if (req.method === 'POST') {
      return await writeFeedbackRoute({ service, req, res, p, ctx });
    }
    return json(res, 404, { error: 'unknown feedback route' }) ?? true;
  } catch (error) {
    const failure = bodyFailure(error);
    if (failure) {
      return json(res, ...failure) ?? true;
    }
    if (
      /^bad |required|must be|valid offset/.test(error.message) ||
      error.message.endsWith('required')
    ) {
      return json(res, 400, { error: error.message }) ?? true;
    }
    throw error;
  }
};
