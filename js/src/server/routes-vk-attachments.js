import {
  listVkAttachments,
  saveVkAttachmentSettings,
} from '../sources/vk-attachment-metadata.js';
import { bodyFailure, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';

export const handleVkAttachments = async (store, req, res, p, url, ctx) => {
  if (p !== '/api/vk/attachments') {
    return false;
  }
  try {
    if (req.method === 'GET') {
      return (
        json(
          res,
          200,
          await listVkAttachments(store, {
            after: url.searchParams.get('after') ?? '',
            limit: Number(url.searchParams.get('limit') ?? 50),
          })
        ) ?? true
      );
    }
    if (req.method === 'POST') {
      if (!isTrustedMutation(req, ctx.allowOrigins)) {
        return (
          json(res, 403, { ok: false, error: 'app origin required' }) ?? true
        );
      }
      return (
        json(
          res,
          200,
          await saveVkAttachmentSettings(store, await readBody(req))
        ) ?? true
      );
    }
    return json(res, 405, { ok: false, error: 'method not supported' }) ?? true;
  } catch (error) {
    const [status, body] = bodyFailure(error) ?? [
      400,
      { ok: false, error: error.message },
    ];
    return json(res, status, body) ?? true;
  }
};
