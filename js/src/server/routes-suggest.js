/**
 * Message-to-message autocomplete API (issue #31).
 *
 * Endpoints:
 *   GET /api/suggest?source=&chat=&last=&typed=&limit=
 *       → { stage: reply|word|none, suggestions, lastMessage, backend }
 *       Whole replies we used before for the chat's last incoming
 *       message (or `last`), most used first; word-by-word completion of
 *       `typed` from our own messages when none match.
 *   GET /api/suggest/stats → { prompts, replies, pairs, words, mirror }
 *   GET /api/suggest/model?since=&format=json|lino
 *       → { version, self, windowMs, links } — the reply index as links,
 *       for a browser to suggest from by itself — or, given the version
 *       it holds, { version, changes }: the messages learned since.
 *       `format=lino` gives the links as Links Notation records.
 */

import { promisify } from 'node:util';
import { gzip as gzipAsync } from 'node:zlib';
import { formatLinoRecords } from '../storage/lino-store.js';
import { json } from './util.js';

// The model is megabytes of text: sent compressed when the client takes
// it, compressed off the event loop.
const gzip = promisify(gzipAsync);
const send = async (req, res, type, text) => {
  const zip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const body = zip ? await gzip(text) : text;
  if (res.headersSent || res.writableEnded) {
    return true;
  }
  res.writeHead(200, {
    'content-type': type,
    'cache-control': 'no-store',
    ...(zip ? { 'content-encoding': 'gzip' } : {}),
  });
  res.end(body);
  return true;
};

const sendModel = async (req, res, url, replies) => {
  const q = url.searchParams;
  const model = await replies.model({ since: q.get('since') ?? '' });
  if (q.get('format') === 'lino' && model.links) {
    return send(
      req,
      res,
      'text/plain; charset=utf-8',
      formatLinoRecords(model.links)
    );
  }
  return send(req, res, 'application/json', JSON.stringify(model));
};

export const handleSuggestRoutes = async (req, res, p, url, ctx) => {
  if (req.method !== 'GET' || !ctx.replies) {
    return false;
  }
  if (p === '/api/suggest/model' && ctx.replies.model) {
    return sendModel(req, res, url, ctx.replies);
  }
  if (p === '/api/suggest/stats') {
    return json(res, 200, await ctx.replies.stats()) ?? true;
  }
  if (p !== '/api/suggest') {
    return false;
  }
  const q = url.searchParams;
  const limit = Math.min(Math.max(Number(q.get('limit') ?? 8) || 8, 1), 50);
  return (
    json(
      res,
      200,
      await ctx.replies.autocomplete({
        source: q.get('source') ?? undefined,
        chat: q.get('chat') ?? undefined,
        lastMessage: q.has('last') ? q.get('last') : undefined,
        typed: q.get('typed') ?? '',
        limit,
      })
    ) ?? true
  );
};
