/**
 * The deleted messages of a chat: kept, never lost, and the user's to
 * bring back or to remove (R-K1, R-K2, R-K4; wired to a page by R-Z7).
 * These are local actions only: nothing is sent to any network.
 *
 *   GET  /api/chat/deleted?key=<chat key>   -> { messages }  the chat's
 *                                              tombstoned messages, oldest
 *                                              first (at most 500)
 *   POST /api/chat/deleted/recover { ids }  -> { ok, recovered }  the
 *                                              messages show in the chat
 *                                              again
 *   POST /api/chat/deleted/purge { ids, confirm: true }
 *                                           -> { ok, purged }  erased from
 *                                              this device for good
 *
 * Only a message that is already deleted can be recovered or purged; a live
 * one is never touched, whatever ids a request names.
 */

import { fail as failWith, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { isTombstone, unmarkDeleted } from '../storage/soft-delete.js';
import { byTime } from '../web/chat-model.js';

const fail = (res, status, code, error) =>
  failWith(res, status, code, error) ?? true;

const PREFIX = '/api/chat/deleted';
const MAX_LIST = 500;
const MAX_IDS = 500;

const idsOf = (body) =>
  Array.isArray(body.ids) &&
  body.ids.length > 0 &&
  body.ids.length <= MAX_IDS &&
  body.ids.every((id) => typeof id === 'string' && id.startsWith('msg:'))
    ? body.ids
    : null;

// The tombstoned message links among `ids`.
const deletedAmong = async (store, ids) => {
  const found = [];
  for (const id of ids) {
    const link = await store.get(id);
    if (link && isTombstone(link)) {
      found.push(link);
    }
  }
  return found;
};

const list = async (store, res, url, ctx) => {
  const key = url.searchParams.get('key');
  if (!key || !ctx.chatIndex) {
    return fail(res, 400, 'bad-request', 'key is required');
  }
  const ids = await ctx.chatIndex.deleted(key);
  const links = await deletedAmong(store, ids.slice(0, MAX_LIST));
  return json(res, 200, { messages: links.sort(byTime) }) ?? true;
};

const recover = async (store, res, ids) => {
  const links = await deletedAmong(store, ids);
  for (const link of links) {
    await store.put(unmarkDeleted(link));
  }
  return (
    json(res, 200, { ok: true, recovered: links.map((l) => l.id) }) ?? true
  );
};

const purge = async (store, res, ids) => {
  const purged = [];
  for (const link of await deletedAmong(store, ids)) {
    if (await store.delete(link.id)) {
      purged.push(link.id);
    }
  }
  return json(res, 200, { ok: true, purged }) ?? true;
};

export const handleDeletedRoutes = async (store, req, res, p, url, ctx) => {
  if (!p.startsWith(PREFIX)) {
    return false;
  }
  if (p === PREFIX && req.method === 'GET') {
    return list(store, res, url, ctx);
  }
  const action = p.slice(PREFIX.length + 1);
  if (req.method !== 'POST' || !['recover', 'purge'].includes(action)) {
    return false;
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return fail(res, 403, 'forbidden', 'must come from the meta-sovereign app');
  }
  const body = await readBody(req, { allowEmpty: false });
  const ids = idsOf(body);
  if (!ids) {
    return fail(res, 400, 'bad-request', 'ids: message ids are needed');
  }
  if (action === 'purge') {
    if (body.confirm !== true) {
      return fail(res, 400, 'confirm-required', 'purging needs confirm: true');
    }
    return purge(store, res, ids);
  }
  return recover(store, res, ids);
};
