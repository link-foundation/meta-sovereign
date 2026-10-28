// All history is read locally. A service connection is never required here.
import { json, fail } from './util.js';
import { messageVersions } from '../storage/message-versions.js';

const listEdited = async (store, res, params, ctx) => {
  const key = params.get('key');
  if (!key || !ctx.chatIndex) {
    return fail(res, 400, 'bad-request', 'key is required') ?? true;
  }
  const ids = await ctx.chatIndex.edited(key);
  if (params.get('count') === '1') {
    return json(res, 200, { count: ids.length }) ?? true;
  }
  const before = params.get('before');
  if (before && !ids.includes(before)) {
    return (
      fail(res, 400, 'bad-request', 'unknown edited-message cursor') ?? true
    );
  }
  const start = before ? ids.indexOf(before) + 1 : 0;
  const selected = ids.slice(start, start + 50);
  const messages = (
    await Promise.all(selected.map((id) => store.get(id)))
  ).filter(Boolean);
  return (
    json(res, 200, {
      messages,
      count: ids.length,
      next: start + selected.length < ids.length ? selected.at(-1) : null,
    }) ?? true
  );
};
export const handleVersionRoutes = async (store, req, res, p, url, ctx) => {
  if (req.method !== 'GET') {
    return false;
  }
  const params = url.searchParams;
  if (p === '/api/chat/edited') {
    return listEdited(store, res, params, ctx);
  }
  if (p !== '/api/chat/versions') {
    return false;
  }
  const id = params.get('id');
  if (!id?.startsWith('msg:')) {
    return fail(res, 400, 'bad-request', 'a message id is required') ?? true;
  }
  const result = await messageVersions(store, id, {
    before: params.get('before') || undefined,
  });
  if (!result.message) {
    return fail(res, 404, 'not-found', 'message not found') ?? true;
  }
  return (
    json(res, 200, {
      ...result,
      count: result.message.versionCount ?? 1,
      partial:
        !result.message.versionHead || Boolean(result.message.versionPartial),
    }) ?? true
  );
};
