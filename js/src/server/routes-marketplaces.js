import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { MARKETPLACES } from '../marketplaces/catalogue.js';
import { createMarketplaceSessions } from '../marketplaces/sessions.js';

const reply = (res, status, body) =>
  json(res, status, { ok: status < 400, ...body }) ?? true;

const emptyOptions = (body) =>
  Boolean(
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  );
const serviceFor = (store, ctx) =>
  (ctx.marketplaceSessions ??= createMarketplaceSessions({
    store,
    storeDir: ctx.storeDir,
    ...ctx.marketplaceSessionOptions,
  }));

export const handleMarketplaceRoutes = async (store, req, res, p, ctx) => {
  if (!p.startsWith('/api/marketplaces')) {
    return false;
  }
  if (p === '/api/marketplaces' && req.method === 'GET') {
    return reply(res, 200, { accounts: await serviceFor(store, ctx).list() });
  }
  const match = /^\/api\/marketplaces\/([a-z]+)\/(open|profile|close)$/.exec(p);
  if (!match || req.method !== 'POST') {
    return false;
  }
  if (!Object.hasOwn(MARKETPLACES, match[1])) {
    return reply(res, 404, {
      code: 'unknown-marketplace',
      error: 'Unknown marketplace',
    });
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return reply(res, 403, {
      code: 'forbidden',
      error: 'Use the meta-sovereign app to open a session',
    });
  }
  const body = await readBody(req, { limit: 8192 });
  if (!emptyOptions(body)) {
    return reply(res, 400, {
      code: 'bad-request',
      error: 'No session options or credentials are accepted',
    });
  }
  try {
    const service = serviceFor(store, ctx);
    const operation = { open: 'open', profile: 'capture', close: 'close' }[
      match[2]
    ];
    return reply(res, 200, { account: await service[operation](match[1]) });
  } catch (error) {
    const code = error.code ?? 'marketplace-failed';
    const status =
      code === 'browser-unavailable'
        ? 503
        : ['needs-profile', 'session-closed', 'page-changed'].includes(code)
          ? 409
          : 500;
    ctx.log?.({
      level: status === 409 ? 'info' : 'warn',
      event: 'marketplace_session_failed',
      provider: match[1],
      code,
    });
    return reply(res, status, {
      code,
      error: 'The browser session could not complete this action',
    });
  }
};
