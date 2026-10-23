/**
 * The chat screen's reads, from the store (see ./chat-index.js):
 *   GET /api/chat/heads                         -> the newest message of
 *                                                  every chat
 *   GET /api/chat/messages?key=&before=&limit=  -> { messages, more, newer }
 *                                                  a page of one chat, oldest
 *                                                  first, older than message
 *                                                  `before` (or newer than
 *                                                  `after`, or around the
 *                                                  ISO time `at`: R-Y106)
 * Other links reach the page through `GET /links?except=msg:`.
 */

import { json } from './util.js';

const MAX_PAGE = 200;

// The page asked for: its size, and where it is.
const rangeOf = (params) => ({
  limit: Math.min(Number(params.get('limit')) || 50, MAX_PAGE),
  before: params.get('before') || null,
  after: params.get('after') || null,
  at: params.get('at') || null,
  around: params.get('around') || null,
});

export const handleChatRoutes = async (req, res, p, url, ctx) => {
  const index = ctx.chatIndex;
  if (!index || req.method !== 'GET' || !p.startsWith('/api/chat/')) {
    return false;
  }
  if (p === '/api/chat/heads') {
    return json(res, 200, await index.heads()) ?? true;
  }
  if (p === '/api/chat/messages') {
    const key = url.searchParams.get('key');
    if (!key) {
      return json(res, 400, { error: 'key is required' }) ?? true;
    }
    const range = rangeOf(url.searchParams);
    if (range.at && Number.isNaN(Date.parse(range.at))) {
      return json(res, 400, { error: 'at must be a time' }) ?? true;
    }
    return json(res, 200, await index.page(key, range)) ?? true;
  }
  return false;
};
