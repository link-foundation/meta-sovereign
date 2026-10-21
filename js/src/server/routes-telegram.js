/**
 * The connected Telegram account (see ../sources/telegram-account.js).
 *   GET  /api/telegram/status          -> { connected, kind, account, at, … }
 *   POST /api/telegram/sync    {full?} -> the status after a sync
 *   POST /api/telegram/history {chat, before?, limit?, priority?}
 *                                      -> { written, cached, complete } the
 *                                         chat's newest messages, or the page
 *                                         before message `before`; the store
 *                                         answers what it already holds
 *   POST /api/telegram/dialogs {priority?}
 *                                      -> { written, complete } the next page
 *                                         of the chat list
 *   POST /api/telegram/read {chat, maxId}
 *                                      -> { ok } marks the chat read up to
 *                                         maxId on Telegram (forward only)
 *   POST /api/telegram/draft {chat, text}
 *                                      -> { ok } the chat's cloud draft
 *   POST /api/telegram/refresh {chat, ids, priority?}
 *                                      -> { written, deleted } those messages
 *                                         read again; gone ones marked deleted
 *   POST /api/telegram/forward {fromChat, ids, toChat}
 *                                      -> { ok, forwarded }
 *   POST /api/telegram/delete {chat, ids, revoke?}
 *                                      -> { ok, deleted }
 *   POST /api/telegram/pin {chat, id, unpin?, oneSide?, silent?}
 *                                      -> { ok, pinned }
 *   POST /api/telegram/dialog {chat, action, for?}
 *                                      -> { ok } the chat list's menu:
 *                                         pin, unpin, mute (for seconds),
 *                                         unmute, archive, unarchive,
 *                                         read, unread (R-Y97)
 *   POST /api/telegram/search {chat, q, offsetId?}
 *                                      -> { ids, count, more } the chat's
 *                                         messages with `q`, newest first,
 *                                         stored (R-Y98)
 *   GET  /api/telegram/media?chat=&id=&size=
 *                                      -> a message's picture (s/m/x/y/w),
 *                                         downloaded once, then from disk
 *   GET  /api/telegram/file?chat=&id=  -> a message's video, voice, audio,
 *                                         GIF or sticker (up to 64 MB), by
 *                                         byte range for players to seek
 *   GET  /api/telegram/avatar?peer=&size=s|b&chat=&msg=
 *                                      -> a person's or chat's photo; 404
 *                                         when they have none
 *   GET  /api/telegram/chat-info?chat= -> { kind, title, members, online,
 *                                         username, about, photo, lastSeen? }
 * Responses carry the account's public name and counts, never a secret.
 */

import { classifyOrigin } from './cors.js';
import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { DIALOG_ACTIONS } from '../sources/telegram-dialogs.js';
import { MAX_QUERY } from '../sources/telegram-search.js';

const PREFIX = '/api/telegram/';

const NONE = { connected: false, kind: null, account: null };

// Only the page asks for what the user looks at; anything else waits.
const PRIORITIES = new Set(['view', 'list', 'prefetch']);
const priorityOf = (value) => (PRIORITIES.has(value) ? value : 'prefetch');

// Validate an array of positive integers (message ids).
const validIds = (ids) =>
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.length <= 100 &&
  ids.every((id) => Number.isInteger(id) && id > 0);

// A marked Telegram chat id, as a string.
const validChat = (chat) =>
  typeof chat === 'string' && /^-?\d{1,20}$/.test(chat);

// POST /api/telegram/<name>: [status, answer] for one request body.
const POSTS = {
  sync: async (account, body) => [
    200,
    await account.sync({ full: Boolean(body.full), reason: 'manual' }),
  ],
  'read-marks': async (account, body) => [
    200,
    (await account.readMarks?.({
      chat: body.chat,
      kind: body.kind,
      ids: body.ids,
      last: Boolean(body.last),
    })) ?? { ok: false, supported: false },
  ],
  read: async (account, body) => [
    200,
    await account.markRead({ chat: body.chat, maxId: body.maxId }),
  ],
  draft: async (account, body) => {
    const text = typeof body.text === 'string' ? body.text : '';
    if (text.length > 20_000) {
      return [400, { error: 'draft too long', code: 'too-long' }];
    }
    return [200, await account.saveDraft({ chat: body.chat, text })];
  },
  history: async (account, body) => [
    200,
    await account.history({
      chat: body.chat,
      limit: Math.min(Number(body.limit) || 50, 100),
      before:
        Number.isInteger(body.before) && body.before > 0 ? body.before : null,
      priority: priorityOf(body.priority),
    }),
  ],
  dialogs: async (account, body) => [
    200,
    (await account.moreDialogs?.({ priority: priorityOf(body.priority) })) ?? {
      written: 0,
      complete: true,
    },
  ],
  // Read messages again by id: edits stored, deletions marked (R-Y36).
  refresh: async (account, body) => {
    if (
      !body.chat ||
      !validIds(body.ids) ||
      typeof account.refreshMessages !== 'function'
    ) {
      return [400, { error: 'chat and ids[] required', code: 'bad-request' }];
    }
    return [
      200,
      await account.refreshMessages({
        chat: body.chat,
        ids: body.ids,
        priority: priorityOf(body.priority),
      }),
    ];
  },
  // Forward messages to another chat (the user's press in Chat).
  forward: async (account, body) => {
    if (
      !body.fromChat ||
      !body.toChat ||
      !validIds(body.ids) ||
      typeof account.forwardMessages !== 'function'
    ) {
      return [
        400,
        { error: 'fromChat, toChat and ids[] required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.forwardMessages({
        fromChat: body.fromChat,
        toChat: body.toChat,
        ids: body.ids,
      }),
    ];
  },
  // Pin or unpin one message (R-Y67).
  pin: async (account, body) => {
    if (
      !body.chat ||
      !validIds([body.id]) ||
      typeof account.pinMessage !== 'function'
    ) {
      return [400, { error: 'chat and id required', code: 'bad-request' }];
    }
    return [
      200,
      await account.pinMessage({
        chat: body.chat,
        id: body.id,
        unpin: Boolean(body.unpin),
        oneSide: Boolean(body.oneSide),
        silent: Boolean(body.silent),
      }),
    ];
  },
  // The chat list's menu: pin, mute, archive, mark read (R-Y97).
  dialog: async (account, body) => {
    if (
      !validChat(body.chat) ||
      !DIALOG_ACTIONS.includes(body.action) ||
      typeof account.dialogAction !== 'function'
    ) {
      return [400, { error: 'chat and action required', code: 'bad-request' }];
    }
    return [
      200,
      await account.dialogAction({
        chat: body.chat,
        action: body.action,
        for: Number(body.for) || 0,
      }),
    ];
  },
  // Search in one chat (R-Y98).
  search: async (account, body) => {
    if (
      !validChat(body.chat) ||
      typeof body.q !== 'string' ||
      !body.q.trim() ||
      body.q.length > MAX_QUERY ||
      typeof account.searchChat !== 'function'
    ) {
      return [400, { error: 'chat and q required', code: 'bad-request' }];
    }
    return [
      200,
      await account.searchChat({
        chat: body.chat,
        q: body.q,
        offsetId: Number.isInteger(body.offsetId) ? body.offsetId : 0,
      }),
    ];
  },
  // Delete messages; revoke deletes them for everyone too.
  delete: async (account, body) => {
    if (
      !body.chat ||
      !validIds(body.ids) ||
      typeof account.deleteMessages !== 'function'
    ) {
      return [400, { error: 'chat and ids[] required', code: 'bad-request' }];
    }
    return [
      200,
      await account.deleteMessages({
        chat: body.chat,
        ids: body.ids,
        revoke: Boolean(body.revoke),
      }),
    ];
  },
};

// Polls and checklists (R-Y74): each acts on one message.
const B64 = /^[A-Za-z0-9+/]{1,64}={0,2}$/;
const validOptions = (options, { empty = false } = {}) =>
  Array.isArray(options) &&
  (empty || options.length > 0) &&
  options.length <= 20 &&
  options.every((o) => typeof o === 'string' && B64.test(o));
const smallIds = (ids) =>
  Array.isArray(ids) &&
  ids.length <= 100 &&
  ids.every((id) => Number.isInteger(id) && id > 0);

// [account method, whether the body's extra fields are valid, the fields]
const POLL_POSTS = {
  // No options retracts the vote.
  'poll-vote': [
    'votePoll',
    (b) => validOptions(b.options, { empty: true }),
    (b) => ({ options: b.options }),
  ],
  'poll-stop': ['stopPoll', () => true, () => ({})],
  'poll-results': ['pollResults', () => true, () => ({})],
  'poll-votes': [
    'pollVotes',
    (b) =>
      (b.option === undefined || validOptions([b.option])) &&
      (b.offset === undefined || typeof b.offset === 'string'),
    (b) => ({ option: b.option, offset: b.offset, limit: b.limit }),
  ],
  'todo-toggle': [
    'toggleTodo',
    (b) =>
      smallIds(b.completed ?? []) &&
      smallIds(b.incompleted ?? []) &&
      (b.completed?.length ?? 0) + (b.incompleted?.length ?? 0) > 0,
    (b) => ({ completed: b.completed ?? [], incompleted: b.incompleted ?? [] }),
  ],
};
for (const [name, [method, valid, fields]] of Object.entries(POLL_POSTS)) {
  POSTS[name] = async (account, body) => {
    if (
      !body.chat ||
      !validIds([body.id]) ||
      !valid(body) ||
      typeof account[method] !== 'function'
    ) {
      return [
        400,
        { error: 'chat, id and fields required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account[method]({ chat: body.chat, id: body.id, ...fields(body) }),
    ];
  };
}

// Pictures are the user's own: only the app's pages may load them, so
// another site open in the browser can neither see them nor make
// Telegram download them. The server's own page: browsers say where an
// <img> load comes from. The app on its other origins (the hosted app,
// the mobile WebViews): it loads them as CORS requests
// (../web/media-src.js), whose Origin no other site can fake.
export const fromApp = (req, allowed = []) => {
  const site = req.headers['sec-fetch-site'];
  return (
    !site ||
    site === 'same-origin' ||
    site === 'none' ||
    classifyOrigin(req, allowed) === 'allowed'
  );
};

// A refused load, in the log once per route, site and origin (a page
// asks for hundreds of pictures): which page asked and how, never what.
const refusals = new Set();
const refuse = (req, res, ctx, route, error) => {
  const origin = req.headers.origin ?? null;
  const key = `${route}|${req.headers['sec-fetch-site']}|${origin}`;
  if (!refusals.has(key) && refusals.size < 100) {
    refusals.add(key);
    ctx?.log?.({
      level: 'warn',
      event: 'telegram_media_refused',
      route,
      site: req.headers['sec-fetch-site'] ?? null,
      mode: req.headers['sec-fetch-mode'] ?? null,
      origin,
      verdict: classifyOrigin(req, ctx?.allowOrigins ?? []),
    });
  }
  return json(res, 403, { error }) ?? true;
};

// GET /api/telegram/media?chat=&id=&size= -> the picture's bytes.
const handleMedia = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'media', 'pictures load only in the app');
  }
  if (typeof account.media !== 'function') {
    return json(res, 501, { error: 'media not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.media({
    chat: query.get('chat'),
    id: Number(query.get('id')),
    size: query.get('size') || 'm',
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    // A message's picture never changes; kept by this browser only.
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// `bytes=a-b` of a file of `size` bytes: [start, end], or null.
export const byteRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? [start, end] : null;
};

// The bytes of a file, whole or the range the player asked for.
const sendBytes = (req, res, { buffer, mimeType }) => {
  const size = buffer.length;
  const head = {
    'content-type': mimeType || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  if (req.headers.range) {
    const range = byteRange(req.headers.range, size);
    if (!range) {
      res.writeHead(416, { ...head, 'content-range': `bytes */${size}` });
      res.end();
      return true;
    }
    const [start, end] = range;
    res.writeHead(206, {
      ...head,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    });
    res.end(buffer.subarray(start, end + 1));
    return true;
  }
  res.writeHead(200, { ...head, 'content-length': size });
  res.end(buffer);
  return true;
};

// GET /api/telegram/file?chat=&id= -> the message's file, by range.
const handleFile = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'file', 'files load only in the app');
  }
  if (typeof account.file !== 'function') {
    return json(res, 501, { error: 'files not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.file({
    chat: query.get('chat'),
    id: Number(query.get('id')),
  });
  if (result?.error === 'too-large') {
    return json(res, 413, { error: 'too-large', size: result.size }) ?? true;
  }
  if (!result?.buffer) {
    return json(res, 404, { error: 'no file' }) ?? true;
  }
  return sendBytes(req, res, result);
};

// A photo not on disk yet is waited for this long, then asked again: a
// photo on disk answers in a few ms, and a longer wait held one of the
// browser's six connections for each photo still downloading (R-Y85).
const AVATAR_WAIT_MS = 250;
const LATER = Symbol('later');

// `promise`'s value, or LATER when it takes longer than `ms` (it goes
// on by itself).
const answerSoon = (promise, ms) => {
  let timer = null;
  const later = new Promise((resolve) => {
    timer = globalThis.setTimeout(() => resolve(LATER), ms);
  });
  return Promise.race([promise.catch(() => null), later]).finally(() =>
    globalThis.clearTimeout(timer)
  );
};

// GET /api/telegram/avatar?peer=&size= -> the peer's photo.
const handleAvatar = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'avatar', 'pictures load only in the app');
  }
  if (typeof account.avatar !== 'function') {
    return json(res, 501, { error: 'avatars not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const reading = Promise.resolve().then(() =>
    account.avatar({
      peer: query.get('peer'),
      size: query.get('size') === 'b' ? 'b' : 's',
      chat: query.get('chat'),
      msg: query.get('msg'),
    })
  );
  const result = await answerSoon(reading, AVATAR_WAIT_MS);
  if (result === LATER) {
    // Still downloading: the browser's few connections are not held
    // for it (they would hold up the chat); the page asks again soon.
    res.setHeader('retry-after', '3');
    res.setHeader('cache-control', 'no-store');
    return json(res, 503, { error: 'loading' }) ?? true;
  }
  if (!result?.buffer) {
    // No photo: the page shows initials, and asks again tomorrow.
    res.setHeader('cache-control', 'private, max-age=3600');
    return json(res, 404, { error: 'no photo' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    // A new photo shows within a day (the server re-reads it daily).
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/chat-info?chat= -> members, online, last seen.
const handleChatInfo = async (account, req, res) => {
  if (typeof account.chatInfo !== 'function') {
    return json(res, 501, { error: 'chat info not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const info = await account.chatInfo({ chat: query.get('chat') });
  return info
    ? (json(res, 200, info) ?? true)
    : (json(res, 404, { error: 'no chat info' }) ?? true);
};

// GET /api/telegram/unread-marks?chat=&kind=mentions|reactions -> ids.
const handleUnreadMarks = async (account, req, res) => {
  if (typeof account.unreadMarks !== 'function') {
    return json(res, 501, { error: 'unread marks not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  return (
    json(
      res,
      200,
      await account.unreadMarks({
        chat: query.get('chat'),
        kind: query.get('kind'),
      })
    ) ?? true
  );
};

const GETS = {
  media: handleMedia,
  file: handleFile,
  avatar: handleAvatar,
  'chat-info': handleChatInfo,
  'unread-marks': handleUnreadMarks,
};

const dispatch = async (account, req, res, p, ctx) => {
  if (p === `${PREFIX}status` && req.method === 'GET') {
    const status = await account.status();
    // Connected but never synced (a key pasted by hand, a restart before
    // the first poll): start the first sync now; the UI polls the status.
    if (status.auto && !status.at && !status.syncing) {
      account.sync({ full: true, reason: 'status' }).catch(() => {});
      return json(res, 200, { ...status, syncing: true }) ?? true;
    }
    return json(res, 200, status) ?? true;
  }
  const name = p.slice(PREFIX.length);
  if (req.method === 'GET' && Object.hasOwn(GETS, name)) {
    return GETS[name](account, req, res, ctx);
  }
  if (req.method !== 'POST' || !Object.hasOwn(POSTS, name)) {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  const [status, answer] = await POSTS[name](account, body);
  return json(res, status, answer) ?? true;
};

export const handleTelegramRoutes = async (req, res, p, ctx) => {
  if (!p.startsWith(PREFIX)) {
    return false;
  }
  const account = ctx.telegramAccount;
  if (!account) {
    return p === `${PREFIX}status` ? (json(res, 200, NONE) ?? true) : false;
  }
  if (req.method === 'POST' && !isTrustedMutation(req, ctx.allowOrigins)) {
    return (
      json(res, 403, {
        error: 'telegram sync must be started from the meta-sovereign app',
      }) ?? true
    );
  }
  try {
    return await dispatch(account, req, res, p, ctx);
  } catch (error) {
    ctx.log?.({
      level: 'error',
      event: 'telegram_route_failed',
      path: p,
      error: error.message,
    });
    return (
      json(res, 502, {
        error: error.message,
        code: error.code,
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      }) ?? true
    );
  }
};
