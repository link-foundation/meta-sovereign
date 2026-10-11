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
 */

import { json } from './util.js';

export const handleSuggestRoutes = async (req, res, p, url, ctx) => {
  if (req.method !== 'GET' || !ctx.replies) {
    return false;
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
