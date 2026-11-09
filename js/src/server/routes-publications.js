import { bodyFailure, json, readBody } from './util.js';
import { confirmed } from './confirmations.js';
import { safeMessage } from './redact.js';
import { codedError } from '../sources/http.js';
import { createPublicationService } from '../broadcast/service.js';
import { saveTarget, removeTarget } from '../broadcast/targets.js';
import {
  credentialStatus,
  saveBroadcastCredentials,
} from '../broadcast/credentials.js';

const serviceOf = (store, ctx) => {
  if (ctx.publicationsClosing) {
    throw codedError('Publication service is closing', 'publication-closed');
  }
  ctx.publications ??= createPublicationService({
    store,
    telegramAccount: ctx.telegramAccount,
    ...ctx.broadcasting,
    log: (event) => ctx.log?.(event),
  });
  return ctx.publications;
};
const objectBody = async (req) => {
  const body = await readBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw codedError(
      'Publication request must be an object',
      'bad-publication'
    );
  }
  return body;
};
const statusFor = (code) => {
  if (code === 'not-found') {
    return 404;
  }
  if (
    [
      'stale-preview',
      'request-conflict',
      'publication-running',
      'publication-closed',
    ].includes(code)
  ) {
    return 409;
  }
  return [
    'bad-target',
    'bad-config',
    'bad-publication',
    'auth-required',
    'read-only-auth',
  ].includes(code)
    ? 400
    : 500;
};
const failure = (res, error) => {
  const body = bodyFailure(error);
  if (body) {
    return json(res, ...body) ?? true;
  }
  const status = statusFor(error?.code);
  return (
    json(res, status, {
      code: status === 500 ? 'internal' : error.code,
      error:
        status === 500
          ? 'Publication storage or service is unavailable; check history before sending again'
          : safeMessage(error),
    }) ?? true
  );
};
const publish = async (store, res, ctx, body) => {
  const service = serviceOf(store, ctx);
  const accepted = await confirmed(ctx, res, {
    action: 'broadcast.publish',
    body,
    prepare: () => service.prepare(body),
  });
  return accepted
    ? (json(res, 200, await service.publish(accepted.data)) ?? true)
    : true;
};

/** The existing POST /api/broadcast also accepts saved destination IDs. */
export const handleSavedBroadcast = async (store, res, ctx, body) => {
  try {
    return await publish(store, res, ctx, body);
  } catch (error) {
    return failure(res, error);
  }
};

const targets = async (store, req, res, url, service) => {
  if (req.method === 'GET') {
    return json(res, 200, { targets: await service.targets() }) ?? true;
  }
  if (req.method === 'PUT') {
    return (
      json(res, 200, {
        target: await saveTarget(store, (await objectBody(req)).target),
      }) ?? true
    );
  }
  if (req.method === 'DELETE') {
    return (
      json(res, 200, await removeTarget(store, url.searchParams.get('id'))) ??
      true
    );
  }
  return false;
};
const credentials = async (store, req, res, url) => {
  if (req.method === 'GET') {
    return (
      json(
        res,
        200,
        await credentialStatus(store, url.searchParams.get('network'))
      ) ?? true
    );
  }
  if (req.method === 'PUT') {
    const body = await objectBody(req);
    return (
      json(
        res,
        200,
        await saveBroadcastCredentials(store, body.network, body.credentials)
      ) ?? true
    );
  }
  return false;
};
const post = async (store, req, res, path, ctx, service) => {
  if (req.method !== 'POST') {
    return false;
  }
  const body = await objectBody(req);
  if (path === 'test') {
    return json(res, 200, await service.test(body.targetId)) ?? true;
  }
  if (path === 'preview') {
    return json(res, 200, (await service.prepare(body)).preview) ?? true;
  }
  if (path === 'publish') {
    return publish(store, res, ctx, body);
  }
  if (path === 'delete') {
    const accepted = await confirmed(ctx, res, {
      action: 'broadcast.delete',
      body,
      prepare: () => service.prepareDelete(body),
    });
    return accepted
      ? (json(res, 200, await service.deletePublished(accepted.data)) ?? true)
      : true;
  }
  return false;
};

export const handlePublicationRoutes = async (store, req, res, p, url, ctx) => {
  const path = p.replace('/api/broadcast/', '');
  if (
    !p.startsWith('/api/broadcast/') ||
    ![
      'targets',
      'credentials',
      'test',
      'preview',
      'publish',
      'delete',
      'history',
    ].includes(path)
  ) {
    return false;
  }
  try {
    const service = serviceOf(store, ctx);
    if (path === 'targets') {
      return await targets(store, req, res, url, service);
    }
    if (path === 'credentials') {
      return await credentials(store, req, res, url);
    }
    if (path === 'history' && req.method === 'GET') {
      const id = url.searchParams.get('id');
      return (
        json(
          res,
          200,
          id
            ? await service.get(id)
            : {
                history: await service.history(
                  Number(url.searchParams.get('limit') ?? 50)
                ),
              }
        ) ?? true
      );
    }
    return await post(store, req, res, path, ctx, service);
  } catch (error) {
    return failure(res, error);
  }
};
