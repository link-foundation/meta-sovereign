/**
 * The chat screen's reads, from the store (see ./chat-index.js):
 *   GET /api/chat/heads                         -> the newest message of
 *                                                  every chat
 *   GET /api/chat/messages?key=&before=&limit=  -> { messages, more } a
 *                                                  page of one chat, oldest
 *                                                  first, older than message
 *                                                  `before`
 * Other links reach the page through `GET /links?except=msg:`.
 */

import { json } from './util.js';

const MAX_PAGE = 200;

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
    const limit = Math.min(
      Number(url.searchParams.get('limit')) || 50,
      MAX_PAGE
    );
    const before = url.searchParams.get('before') || null;
    return json(res, 200, await index.page(key, { before, limit })) ?? true;
  }
  return false;
};
