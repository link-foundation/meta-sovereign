/**
 * Tiny request/response helpers shared by route modules. Keeping these
 * separate lets each route file stay focused and well below the
 * eslint complexity budget.
 */

import { safeMessage } from './redact.js';
import {
  encodeWireResponse,
  decodeWireRequest,
  requestWireType,
} from './wire.js';

// Every error answer has one shape (R-Z1): `{ ok: false, error, code }`.
// `json()` completes whatever a route wrote, so no route can forget it.
const CODE_BY_STATUS = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  405: 'method-not-allowed',
  409: 'conflict',
  413: 'too-large',
  421: 'bad-host',
  429: 'rate-limited',
  500: 'internal',
  501: 'not-available',
  502: 'upstream-failed',
  503: 'unavailable',
};

const errorText = (given, status) =>
  given ? safeMessage(given) : `request failed (${status})`;

const failureBody = (status, body) => ({
  ...body,
  ok: false,
  error: errorText(body.error ?? body.message, status),
  code: body.code ?? CODE_BY_STATUS[status] ?? 'error',
});

const plain = (body) =>
  body !== null && typeof body === 'object' && !Array.isArray(body);

export const json = (res, status, body) => {
  // Never write twice: a slow handler whose client already gave up (or a
  // late error after a response was sent) must not throw ERR_HTTP_HEADERS_
  // SENT, which would otherwise crash the whole server process.
  if (res.headersSent || res.writableEnded) {
    return;
  }
  const out = status >= 400 && plain(body) ? failureBody(status, body) : body;
  const wire = encodeWireResponse(res, status, out);
  res.writeHead(wire.status, {
    'content-type':
      wire.type + (wire.type.startsWith('text/') ? '; charset=utf-8' : ''),
    vary: [res.getHeader?.('vary'), 'Accept'].filter(Boolean).join(', '),
  });
  res.end(wire.body);
};

/** The one helper for an error answer: `{ ok: false, error, code }`. */
export const fail = (res, status, code, error) =>
  json(res, status, { ok: false, error, code });

export const text = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
};

// Ordinary structured request bodies are small; archive/media routes apply
// their own streaming limits (R-Z1). Retain the exported name for callers.
export const MAX_JSON_BODY = 1024 * 1024;

/** A request body that cannot be used: it carries its HTTP answer. */
export class BodyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'BodyError';
    this.status = status;
    this.code = code;
  }
}

/** The `[status, body]` answer for a BodyError, or null for any other error. */
export const bodyFailure = (error) =>
  error instanceof BodyError
    ? [error.status, { ok: false, error: error.message, code: error.code }]
    : null;

const tooLarge = (limit) =>
  new BodyError(413, 'too-large', `request body is over ${limit} bytes`);

const parseObject = (raw, allowEmpty, req) => {
  const kind = requestWireType(req) === 'application/json' ? 'json' : 'lino';
  if (!raw.length) {
    if (allowEmpty) {
      return {};
    }
    throw new BodyError(400, `bad-${kind}`, 'a structured body is needed');
  }
  let value;
  try {
    value = decodeWireRequest(req, raw);
  } catch (error) {
    throw new BodyError(
      error.status ?? 400,
      error.code === 'unsupported-media' ? error.code : `bad-${kind}`,
      error.status === 415
        ? error.message
        : `the request body is not valid ${kind.toUpperCase()}`
    );
  }
  if (!plain(value)) {
    throw new BodyError(400, `bad-${kind}`, 'an object body is needed');
  }
  return value;
};

/**
 * The request's negotiated object body. Rejects with a BodyError (400
 * `bad-lino`, or `bad-json` in compatibility mode; 413 `too-large`) and never turns a broken
 * body into `{}`. An empty body is `{}` unless `allowEmpty: false`.
 * @param {{limit?: number, allowEmpty?: boolean}} options
 */
export const readBody = (
  req,
  { limit = MAX_JSON_BODY, allowEmpty = true } = {}
) =>
  new Promise((resolve, reject) => {
    if (Number(req.headers?.['content-length']) > limit) {
      req.resume();
      reject(tooLarge(limit));
      return;
    }
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        if (!over) {
          over = true;
          chunks.length = 0;
          reject(tooLarge(limit));
        }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (over) {
        return;
      }
      try {
        resolve(parseObject(Buffer.concat(chunks), allowEmpty, req));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
