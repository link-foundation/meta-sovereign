import { evidenceHash } from '../automation/vk-reengage-evidence.js';

export const invalidCacheEvidence = () => {
  throw Object.assign(new Error('Incomplete or changed VK cache evidence'), {
    code: 'incomplete',
  });
};
const integer = (n) => Number.isSafeInteger(n) && n >= 0;
const FIELDS =
  'first_name,last_name,online,last_seen,can_write_private_message,sex,bdate,deactivated,contacts';
const METHODS = {
  history: 'messages.getHistory',
  friends: 'friends.get',
  conversation: 'messages.getConversationsById',
  profile: 'users.get',
  'friend-count': 'friends.get',
};
const paramsFor = (request, offset) => {
  const { kind, peerId } = request;
  if (kind === 'profile') {
    return { user_ids: peerId, fields: FIELDS };
  }
  if (kind === 'conversation') {
    return { peer_ids: peerId, extended: 1 };
  }
  if (kind === 'friend-count') {
    return { user_id: peerId, count: 1 };
  }
  return kind === 'history'
    ? { peer_id: peerId, offset, count: 200 }
    : { offset, count: 200, fields: FIELDS };
};
const checkedHistory = (request, rows) => {
  if (
    rows.some(
      (m) =>
        (m.peer_id !== undefined && m.peer_id !== request.peerId) ||
        !Number.isSafeInteger(m.from_id) ||
        m.from_id === 0 ||
        !integer(m.date) ||
        m.date > 8640000000000 ||
        typeof m.text !== 'string'
    )
  ) {
    invalidCacheEvidence();
  }
  if (rows.some((m, i) => i > 0 && m.id >= rows[i - 1].id)) {
    invalidCacheEvidence();
  }
};
const checkedSingle = (kind, peerId, rows) => {
  const id = kind === 'profile' ? rows[0]?.id : rows[0]?.peer?.id;
  if (rows.length > 1 || (rows.length && id !== peerId)) {
    invalidCacheEvidence();
  }
  return { items: rows, total: rows.length, complete: true };
};
const checkedRows = (request, raw, offset) => {
  const { kind, peerId } = request;
  const rows = kind === 'profile' ? raw : raw?.items;
  if (kind === 'friend-count') {
    if (!integer(raw?.count)) {
      invalidCacheEvidence();
    }
    return { items: [{ count: raw.count }], total: 1, complete: true };
  }
  if (!Array.isArray(rows) || rows.length > 200) {
    invalidCacheEvidence();
  }
  if (kind === 'profile' || kind === 'conversation') {
    return checkedSingle(kind, peerId, rows);
  }
  return checkedPage(request, raw, rows, offset);
};
const checkedPage = (request, raw, rows, offset) => {
  const { kind } = request;
  if (!integer(raw.count) || raw.count < offset + rows.length) {
    invalidCacheEvidence();
  }
  const ids = rows.map((row) => row?.id);
  if (
    new Set(ids).size !== ids.length ||
    !ids.every((id) => integer(id) && id > 0)
  ) {
    invalidCacheEvidence();
  }
  if (kind === 'history') {
    checkedHistory(request, rows);
  }
  if (!rows.length && offset < raw.count) {
    invalidCacheEvidence();
  }
  return {
    items: rows,
    total: raw.count,
    complete: offset + rows.length >= raw.count,
  };
};
export const readVkCachePage = async (live, options, request, offset) => {
  const raw = await live.call(
    METHODS[request.kind],
    paramsFor(request, offset),
    options.token
  );
  return checkedRows(request, raw, offset);
};
export const cachePageHash = (page) => evidenceHash(page);
export const verifyCachePage = async (page, ref) => {
  if (!page || (await cachePageHash(page.items)) !== ref.hash) {
    invalidCacheEvidence();
  }
  return page.items;
};

export const ownedCachePage = async (store, request, ref) => {
  const page = await store.get(ref.id);
  if (
    page?.accountId !== request.accountId ||
    page.peerId !== request.peerId ||
    page.id !== ref.id ||
    page.kind !== 'vk-cache-page'
  ) {
    invalidCacheEvidence();
  }
  return verifyCachePage(page, ref);
};
