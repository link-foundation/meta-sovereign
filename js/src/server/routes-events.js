/**
 * GET /api/events — a Server-Sent Events stream of link changes, so the
 * chat shows a new message, a read receipt or typing the moment the
 * server learns about it (instead of on the next poll).
 *
 *   event: link    data: { type: 'put', link }  |  { type: 'delete', id }
 *   event: ready   once, when the stream is open
 *   : ping         a comment every 25 s keeps proxies from closing it
 *
 * Only what the chat shows is streamed — messages, read markers, typing,
 * people, chat history marks and the Telegram sync status — never
 * `secret:` links, and no history read ahead of the user. Other
 * sites' pages may not listen (an Origin outside the allow-list is
 * refused).
 */

import { classifyOrigin } from './cors.js';
import { json } from './util.js';

export const EVENT_PREFIXES = Object.freeze([
  'msg:',
  'read:',
  'typing:',
  'person:',
  'history:',
  'sync:telegram',
]);

export const isStreamedId = (id) =>
  typeof id === 'string' && EVENT_PREFIXES.some((p) => id.startsWith(p));

const HEARTBEAT_MS = 25_000;

const frame = (event, data) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export const handleEventRoutes = (store, req, res, p, ctx) => {
  if (p !== '/api/events' || req.method !== 'GET') {
    return false;
  }
  if (classifyOrigin(req, ctx.allowOrigins ?? []) === 'denied') {
    return json(res, 403, { error: 'origin not allowed' }) ?? true;
  }
  if (typeof store.subscribe !== 'function') {
    return json(res, 501, { error: 'this store has no change feed' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  // Reconnect quickly after the server restarts.
  res.write('retry: 2000\n\n');
  res.write(frame('ready', { at: new Date().toISOString() }));
  // History read ahead (older than its chat's newest message) is left
  // out: the page asks for it by page (./chat-index.js).
  const feed = ctx.chatIndex ?? store;
  const unsubscribe = feed.subscribe((event) => {
    const id = event?.link?.id;
    if (!isStreamedId(id) || event.quiet) {
      return;
    }
    sent += 1;
    res.write(
      frame(
        'link',
        event.type === 'delete'
          ? { type: 'delete', id }
          : { type: 'put', link: event.link }
      )
    );
  });
  const heartbeat = globalThis.setInterval(
    () => res.write(': ping\n\n'),
    HEARTBEAT_MS
  );
  heartbeat.unref?.();
  const opened = Date.now();
  let sent = 0;
  ctx.log?.({ level: 'debug', event: 'events_open' });
  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    globalThis.clearInterval(heartbeat);
    unsubscribe?.();
    ctx.log?.({
      level: 'debug',
      event: 'events_close',
      sent,
      duration_ms: Date.now() - opened,
    });
  };
  req.on('close', close);
  res.on('error', close);
  return true;
};
