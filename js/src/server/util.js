/**
 * Tiny request/response helpers shared by route modules. Keeping these
 * separate lets each route file stay focused and well below the
 * eslint complexity budget.
 */

// JSON.stringify throws on a BigInt ("Do not know how to serialize a
// BigInt"), which some upstream libraries (GramJS account ids) hand us —
// render those as strings so one stray BigInt can never fail a response.
const jsonSafe = (_key, value) =>
  typeof value === 'bigint' ? value.toString() : value;

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

const errorText = (given, status) => {
  if (typeof given === 'string' && given) {
    return given;
  }
  return given ? String(given) : `request failed (${status})`;
};

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
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(out, jsonSafe));
};

/** The one helper for an error answer: `{ ok: false, error, code }`. */
export const fail = (res, status, code, error) =>
  json(res, status, { ok: false, error, code });

export const text = (res, status, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
};

// A JSON request body is small; the one big body, a file upload, is
// streamed by its own route with its own limit (R-Z1).
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

const parseObject = (raw, allowEmpty) => {
  if (!raw) {
    if (allowEmpty) {
      return {};
    }
    throw new BodyError(400, 'bad-json', 'a JSON body is needed');
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BodyError(400, 'bad-json', 'the request body is not valid JSON');
  }
  if (!plain(value)) {
    throw new BodyError(400, 'bad-json', 'a JSON object is needed');
  }
  return value;
};

/**
 * The request's JSON object body. Rejects with a BodyError (the server
 * answers it: 400 `bad-json`, 413 `too-large`) and never turns a broken
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
        resolve(
          parseObject(Buffer.concat(chunks).toString('utf8'), allowEmpty)
        );
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
