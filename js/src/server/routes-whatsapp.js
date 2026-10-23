/**
 * WhatsApp routes (R-Z9).
 *
 *   GET  /api/whatsapp/web             -> { ok, state, open, signedIn, signedInAt, terms }
 *   POST /api/whatsapp/web/sign-in     -> opens the visible WhatsApp Web window
 *   POST /api/whatsapp/web/close       -> closes it
 *   POST /api/whatsapp/archive {name, data(base64)}
 *                                      -> imports an "Export chat" .txt or .zip
 *
 * The sign-in window is for the person to scan the QR code themselves
 * (see ../sources/whatsapp-web-signin.js); these routes never touch it.
 */

import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { safeMessage } from './redact.js';
import { createWhatsAppWebSignIn } from '../sources/whatsapp-web-signin.js';
import { importWhatsAppFile } from '../sources/whatsapp-file.js';

const PREFIX = '/api/whatsapp/';

// What the page must tell the person (also in the docs, four languages).
export const WHATSAPP_TERMS = Object.freeze({
  automation: false,
  note: "WhatsApp's terms do not allow automated or bulk use of WhatsApp Web. Meta Sovereign only types and sends a message you confirm yourself.",
});

const signInFor = (ctx) => {
  ctx.whatsappSignIn ??= createWhatsAppWebSignIn({
    storeDir: ctx.storeDir,
    ...(ctx.whatsappSignInOptions ?? {}),
    log: ctx.log,
  });
  return ctx.whatsappSignIn;
};

const reply = (res, status, body) =>
  json(res, status, { ok: status < 400, ...body }) ?? true;

const failure = (res, error) =>
  reply(res, error.code === 'browser-unavailable' ? 503 : 500, {
    error: safeMessage(error),
    code: error.code ?? 'internal',
  });

const archiveRoute = async (store, req, res) => {
  const body = await readBody(req, { limit: 64 * 1024 * 1024 });
  const bytes = Buffer.from(String(body.data ?? ''), 'base64');
  if (bytes.length === 0 || typeof body.name !== 'string') {
    return reply(res, 400, {
      error: 'name and data (base64) are required',
      code: 'bad-request',
    });
  }
  try {
    return reply(res, 200, await importWhatsAppFile(store, body.name, bytes));
  } catch (error) {
    return reply(res, 400, { error: safeMessage(error), code: 'bad-archive' });
  }
};

const webRoute = async (req, res, ctx, action) => {
  const signIn = signInFor(ctx);
  if (req.method === 'GET') {
    return reply(res, 200, {
      ...(await signIn.status()),
      terms: WHATSAPP_TERMS,
    });
  }
  try {
    const status =
      action === 'sign-in' ? await signIn.start() : await signIn.stop();
    return reply(res, 200, { ...status, terms: WHATSAPP_TERMS });
  } catch (error) {
    return failure(res, error);
  }
};

export const handleWhatsAppRoutes = async (store, req, res, p, ctx) => {
  if (!p.startsWith(PREFIX)) {
    return false;
  }
  const route = p.slice(PREFIX.length);
  const isWeb =
    route === 'web' || route === 'web/sign-in' || route === 'web/close';
  const isArchive = route === 'archive';
  if (!isWeb && !isArchive) {
    return false;
  }
  if (req.method === 'POST' && !isTrustedMutation(req, ctx.allowOrigins)) {
    return reply(res, 403, {
      error: 'this must be started from the meta-sovereign app',
      code: 'forbidden',
    });
  }
  if (isArchive) {
    return req.method === 'POST' ? archiveRoute(store, req, res) : false;
  }
  const expected = route === 'web' ? 'GET' : 'POST';
  return req.method === expected
    ? webRoute(req, res, ctx, route.split('/')[1])
    : false;
};
