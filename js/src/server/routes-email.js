/**
 * Email routes (issue #3; R-Z5).
 *
 * Its routes:
 *   POST /api/email/pull   { protocol?, limit?, offset?, … } -> { imported,
 *                          rawCount, nextOffset, skipped? }; the saved
 *                          connection (token, host, login, password) is
 *                          used unless the body names another server;
 *                          once every 15 s at most (429 `rate-limited`)
 *   POST /api/email/send   { message: { to, subject, text, … } } -> after
 *                          the user's confirmation (./confirmations.js)
 *   GET  /api/email/attachment?id=&n=|cid=&inline=1
 *                          -> an attachment's bytes, from the media folder
 *                          (fetched from the provider the first time when
 *                          it was not kept); only the app's pages may ask;
 *                          saved as a download, except a picture shown in a
 *                          mail (`inline=1`, never an SVG)
 *
 * A failure answers `{ ok: false, error, code }`; nothing is reported as
 * done that was not. Another server named in the body never receives the
 * password or token saved for the first one.
 */

import { json, readBody } from './util.js';
import { fromApp } from './routes-telegram-files.js';
import { emailSource } from '../sources/email.js';
import '../sources/email-node-transport.js';
import { liveOptionsFrom, stampSourceLink } from '../sources/index.js';
import { protocolFor } from '../sources/email-live.js';

const PULL_EVERY_MS = 15_000;

const SAVED_CREDENTIALS = ['token', 'username', 'password'];

const OPTION_ALIASES = {
  protocol: ['protocol'],
  provider: ['provider'],
  token: ['token'],
  baseUrl: ['baseUrl'],
  accountId: ['accountId'],
  userId: ['userId'],
  host: ['host'],
  port: ['port'],
  secure: ['secure'],
  security: ['security'],
  username: ['username', 'user'],
  password: ['password'],
  mailbox: ['mailbox'],
};

// What the body says (or its `config`), under every name it may use.
const givenOptions = (body) => {
  const config = body.config ?? {};
  const out = { ...config };
  for (const [key, names] of Object.entries(OPTION_ALIASES)) {
    for (const name of names) {
      const value = body[name] ?? config[name];
      if (value !== undefined) {
        out[key] = value;
        break;
      }
    }
  }
  return out;
};

const readEmailToken = async (store, { protocol, provider, secretId }) => {
  const ids = [
    secretId,
    provider ? `secret:email:${provider}:token` : null,
    protocol ? `secret:email:${protocol}:token` : null,
    'secret:email:token',
  ].filter(Boolean);
  for (const id of ids) {
    const link = await store.get(id);
    const token = link?.token ?? link?.value ?? link?.body ?? link?.text;
    if (token) {
      return token;
    }
  }
  return null;
};

/**
 * The options of one email request: the saved connection, then what the
 * body names. Credentials saved for one server are not used for another.
 */
export const emailConfig = async (store, body, sending = false) => {
  const saved = await liveOptionsFrom(store, 'email');
  const given = givenOptions(body);
  const moved =
    (given.host && given.host !== saved.host) ||
    (given.baseUrl && given.baseUrl !== saved.baseUrl);
  if (moved) {
    for (const key of SAVED_CREDENTIALS) {
      delete saved[key];
    }
  }
  const merged = { ...saved, ...given };
  const protocol = given.protocol ?? protocolFor(merged, sending);
  const provider = given.provider ?? protocol;
  const token =
    given.token ??
    (moved
      ? null
      : await readEmailToken(store, {
          protocol,
          provider,
          secretId: body.secretId ?? body.config?.secretId,
        })) ??
    merged.token ??
    null;
  return { ...merged, protocol, provider, token };
};

const liveOf = (config, ctx) => {
  if (ctx?.emailLiveFactory) {
    return ctx.emailLiveFactory(config);
  }
  return {
    pullMessages: (o) => emailSource.live.pullMessages({ ...config, ...o }),
    post: (c, o) => emailSource.live.post(c, { ...config, ...o }),
  };
};

export const pullEmail = async (store, body, ctx) => {
  const config = await emailConfig(store, body, false);
  const live = liveOf(config, ctx);
  const result = await live.pullMessages({
    ...(body.options ?? {}),
    token: config.token,
    limit: body.limit ?? body.options?.limit,
    offset: body.offset ?? body.options?.offset,
  });
  const links = result.links ?? [];
  for (const link of links) {
    await store.put(stampSourceLink(link, 'email'));
  }
  // What the pull remembers is written once the mail is stored.
  await result.afterStore?.();
  return {
    source: 'email',
    protocol: config.protocol,
    provider: config.provider,
    imported: links.length,
    rawCount: result.rawCount ?? links.length,
    nextOffset: result.nextOffset ?? null,
    ...(result.skipped ? { skipped: result.skipped } : {}),
  };
};

export const sendEmail = async (store, body, ctx) => {
  const config = await emailConfig(store, body, true);
  const live = liveOf(config, ctx);
  const result = await live.post(body.message ?? body.content ?? body, {
    ...(body.options ?? {}),
    token: config.token,
  });
  return {
    source: 'email',
    protocol: config.protocol,
    provider: config.provider,
    result,
  };
};

const STATUS = {
  'rate-limited': 429,
  'no-token': 400,
  'not-configured': 400,
  'no-recipient': 400,
  'bad-address': 400,
  'insecure-refused': 400,
  'send-unknown': 502,
  STORE_WRITE_FAILED: 507,
};

/** A failed email request, loudly, with a code the page can show. */
export const emailFailure = (res, error, ctx) => {
  ctx?.log?.({
    level: 'warn',
    event: 'email_failed',
    code: error.code ?? null,
  });
  return (
    json(res, STATUS[error.code] ?? 502, {
      ok: false,
      error: error.message,
      code: error.code ?? 'email-failed',
    }) ?? true
  );
};

/** Pull, at most once every 15 s (the page's button, a click storm). */
export const handleEmailPull = async (store, req, res, ctx) => {
  const body = await readBody(req);
  const now = Date.now();
  const wait = (ctx.emailPullAt ?? 0) + PULL_EVERY_MS - now;
  if (wait > 0) {
    return json(res, 429, {
      ok: false,
      error: 'mail was pulled a moment ago; try again shortly',
      code: 'rate-limited',
      retryAfter: Math.ceil(wait / 1000),
    });
  }
  ctx.emailPullAt = now;
  try {
    return json(res, 200, { ok: true, ...(await pullEmail(store, body, ctx)) });
  } catch (error) {
    return emailFailure(res, error, ctx);
  }
};

// ---- Attachments ------------------------------------------------------------

const SHOWN_INLINE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);

const safeMime = (mime) =>
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(
    String(mime ?? '')
  )
    ? String(mime).toLowerCase()
    : 'application/octet-stream';

const fileName = (name) =>
  [...String(name || 'attachment')]
    .map((c) => (c.charCodeAt(0) < 32 || '\\/"'.includes(c) ? '_' : c))
    .join('')
    .slice(0, 200);

const attachmentIndex = (link, query) => {
  const list = link.attachments ?? [];
  const cid = query.get('cid');
  const index = cid
    ? list.findIndex((a) => a.cid === cid)
    : Number.parseInt(query.get('n') ?? '', 10);
  return index >= 0 && index < list.length ? index : -1;
};

// The bytes: from the media folder, else once from the provider.
const bytesOf = async (store, link, index, ctx) => {
  const attachment = link.attachments[index];
  const kept = ctx.emailFiles?.read(attachment.file);
  if (kept) {
    return kept;
  }
  if (!attachment.remote || !ctx.emailFiles) {
    return null;
  }
  const options = await liveOptionsFrom(store, 'email');
  const bytes = await emailSource.live.fetchAttachment(
    { link, attachment },
    options
  );
  const hash = ctx.emailFiles.save(bytes);
  if (hash) {
    await store.put({
      ...link,
      attachments: link.attachments.map((a, i) =>
        i === index ? { ...a, file: hash } : a
      ),
    });
  }
  return Buffer.from(bytes);
};

const sendAttachment = (res, attachment, bytes, inline) => {
  const mime = safeMime(attachment.mime);
  const shown = inline && SHOWN_INLINE.has(mime);
  res.writeHead(200, {
    'content-type': mime,
    'content-length': bytes.length,
    'content-disposition': `${shown ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName(attachment.name))}`,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
  });
  res.end(bytes);
  return true;
};

const missing = (res, status, error, code) =>
  json(res, status, { ok: false, error, code }) ?? true;

/** GET /api/email/attachment (see the header). */
export const handleEmailGets = async (store, req, res, p, url, ctx) => {
  if (p !== '/api/email/attachment' || req.method !== 'GET') {
    return false;
  }
  if (!fromApp(req, ctx?.allowOrigins)) {
    return missing(res, 403, 'attachments load only in the app', 'forbidden');
  }
  const id = url.searchParams.get('id') ?? '';
  const link = id.startsWith('msg:email:') ? await store.get(id) : null;
  const index = link ? attachmentIndex(link, url.searchParams) : -1;
  if (index < 0) {
    return missing(res, 404, 'no such attachment', 'not-found');
  }
  const attachment = link.attachments[index];
  try {
    const bytes = await bytesOf(store, link, index, ctx);
    return bytes
      ? sendAttachment(
          res,
          attachment,
          bytes,
          url.searchParams.get('inline') === '1'
        )
      : missing(res, 404, 'the attachment was not kept', 'not-kept');
  } catch (error) {
    return emailFailure(res, error, ctx);
  }
};
