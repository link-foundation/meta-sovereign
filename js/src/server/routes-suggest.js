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
import { requestedConversationSettings } from '../crm/conversation-policy.js';
import { mergeSuggestions } from '../replies/reply-cache.js';

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

const suggestionOptions = (params, limit) => ({
  source: params.get('source') ?? undefined,
  chat: params.get('chat') ?? undefined,
  replyTo: params.get('replyTo'),
  locale: params.get('locale') ?? 'en',
  lastMessage: params.has('last') ? params.get('last') : undefined,
  typed: params.get('typed') ?? '',
  limit,
  settings: requestedConversationSettings(params),
});
const contextualSuggestions = (ctx, options) =>
  options.source &&
  options.chat &&
  ctx.knowledge &&
  options.lastMessage === undefined
    ? ctx.knowledge.suggest(`${options.source}:${options.chat}`, options)
    : { suggestions: [], context: null };
const suggestions = async (ctx, options) => {
  const contextual = await contextualSuggestions(ctx, options);
  if (options.replyTo && ctx.knowledge && !contextual.context?.anchorId) {
    return {
      stage: 'none',
      suggestions: [],
      context: contextual.context,
      backend: 'memory',
    };
  }
  const prompt = options.replyTo
    ? contextual.context?.anchorText
    : options.lastMessage;
  const base =
    contextual.suggestions.length && !options.typed.trim()
      ? { stage: 'none', suggestions: [], backend: 'memory' }
      : await ctx.replies.autocomplete({ ...options, lastMessage: prompt });
  return {
    ...base,
    lastMessage: contextual.context?.anchorText ?? base.lastMessage ?? '',
    ...mergeSuggestions(
      base,
      { suggestions: contextual.suggestions },
      { limit: options.limit }
    ),
    context: contextual.context,
  };
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
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? 8) || 8, 1),
    50
  );
  return (
    json(
      res,
      200,
      await suggestions(ctx, suggestionOptions(url.searchParams, limit))
    ) ?? true
  );
};
