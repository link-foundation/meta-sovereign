import {
  loadStickerCollections,
  saveStickerCollections,
} from '../greetings/collections.js';
import { bodyFailure, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

export const handleStickerCollections = async (
  store,
  req,
  res,
  p,
  _url,
  ctx
) => {
  if (p !== '/api/sticker-collections') {
    return false;
  }
  try {
    if (req.method === 'GET') {
      return json(res, 200, await loadStickerCollections(store)) ?? true;
    }
    if (req.method === 'POST') {
      if (!isTrustedMutation(req, ctx.allowOrigins)) {
        return json(res, 403, { error: 'app origin required' }) ?? true;
      }
      const body = await readBody(req);
      return (
        json(
          res,
          200,
          await saveStickerCollections(store, body?.collections)
        ) ?? true
      );
    }
    return json(res, 405, { error: 'method not supported' }) ?? true;
  } catch (error) {
    const [status, body] = bodyFailure(error) ?? [
      400,
      { error: error.message },
    ];
    return json(res, status, body) ?? true;
  }
};
