import {
  followEntity,
  followFailure,
  followKind,
  followPeerChat,
  followText,
} from './telegram-follow-shape.js';

const validOffset = (cursor) =>
  [cursor.date, cursor.id].every(
    (n) => Number.isInteger(n) && n >= 0 && n <= 2147483647
  ) &&
  (cursor.peer === null ||
    (typeof cursor.peer === 'string' && /^-?[1-9]\d{0,23}$/.test(cursor.peer)));
const peerAddress = (peer) => {
  const field = {
    PeerChannel: 'channelId',
    PeerChat: 'chatId',
    PeerUser: 'userId',
    InputPeerChannel: 'channelId',
    InputPeerChat: 'chatId',
    InputPeerUser: 'userId',
  }[followKind(peer)];
  const id = field ? followText(peer[field]) : '';
  return /^[1-9]\d{0,19}$/.test(id)
    ? `${field === 'channelId' ? '-100' : field === 'chatId' ? '-' : ''}${id}`
    : null;
};
const cursorOf = (value, owner) => {
  if (value === undefined || value === '') {
    return null;
  }
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !/^[\w-]+$/.test(value)
  ) {
    throw followFailure('bad-request');
  }
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    throw followFailure('bad-request');
  }
  if (cursor?.owner !== owner) {
    throw followFailure('account-changed');
  }
  if (!validOffset(cursor)) {
    throw followFailure('bad-request');
  }
  return cursor;
};
const dialogItem = (dialog, entities, now) => {
  const chat = followPeerChat(dialog.peer);
  const entity = entities.get(chat);
  if (!entity) {
    return null;
  }
  try {
    const target = followEntity(entity);
    if (entity.left) {
      return null;
    }
    const until = dialog.notifySettings?.muteUntil;
    return {
      ...target,
      member: true,
      muted: Number.isInteger(until) ? until > Math.floor(now() / 1000) : null,
      archived: Number.isInteger(dialog.folderId ?? 0)
        ? dialog.folderId === 1
        : null,
      pinned: dialog.pinned === true,
    };
  } catch {
    return null;
  }
};
const nextCursor = (dialogs, messages, owner) => {
  const last = [...dialogs]
    .reverse()
    .find((d) => followKind(d) === 'Dialog' && !d.pinned);
  if (!last) {
    return Buffer.from(
      JSON.stringify({ owner, peer: null, date: 0, id: 0 })
    ).toString('base64url');
  }
  const marked = peerAddress(last.peer);
  const message = messages.find(
    (m) => m.id === last.topMessage && peerAddress(m.peerId) === marked
  );
  if (
    !marked ||
    !Number.isInteger(last.topMessage) ||
    last.topMessage <= 0 ||
    !Number.isInteger(message?.date)
  ) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({
      owner,
      peer: marked,
      date: message.date,
      id: last.topMessage,
    })
  ).toString('base64url');
};
const validAnswer = (answer, limit) =>
  ['Dialogs', 'DialogsSlice'].includes(followKind(answer)) &&
  ['dialogs', 'chats', 'messages'].every((key) => Array.isArray(answer[key])) &&
  answer.dialogs.length <= limit &&
  (followKind(answer) !== 'DialogsSlice' ||
    (Number.isSafeInteger(answer.count) && answer.count >= 0));
const pageOf = (answer, limit, owner, cursor) => {
  const hasMore = followKind(answer) === 'DialogsSlice' && answer.count > 0;
  const next =
    hasMore && answer.dialogs.length
      ? nextCursor(answer.dialogs, answer.messages, owner)
      : null;
  if (cursor && next === cursor) {
    throw followFailure('pagination-stalled');
  }
  return {
    limit,
    scanned: answer.dialogs.length,
    hasMore,
    next,
    complete: !hasMore,
    partial: hasMore && !next,
    reason: hasMore && !next ? 'cursor-unavailable' : null,
  };
};
const entitiesOf = (chats) => {
  const entities = new Map();
  for (const entity of chats) {
    try {
      entities.set(followEntity(entity).chat, entity);
    } catch {
      /* Unsupported peers remain outside this group/channel list. */
    }
  }
  return entities;
};
const cursorPeer = async (c, cursor) => {
  const offsetPeer = cursor?.peer
    ? await c.client.getInputEntity(c.helpers.returnBigInt(cursor.peer))
    : new c.Api.InputPeerEmpty();
  if (cursor?.peer && peerAddress(offsetPeer) !== cursor.peer) {
    throw followFailure('target-changed');
  }
  return offsetPeer;
};
export const listFollowTelegram = async (
  c,
  owner,
  body = {},
  now = Date.now
) => {
  const limit = Number(body.limit ?? 40);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw followFailure('bad-request');
  }
  const cursor = cursorOf(body.cursor, owner);
  const offsetPeer = await cursorPeer(c, cursor);
  const answer = await c.client.invoke(
    new c.Api.messages.GetDialogs({
      limit,
      offsetId: cursor?.id ?? 0,
      offsetDate: cursor?.date ?? 0,
      offsetPeer,
      excludePinned: Boolean(cursor),
      hash: c.zero,
    })
  );
  if (!validAnswer(answer, limit)) {
    throw followFailure('read-failed');
  }
  const entities = entitiesOf(answer.chats);
  const chats = answer.dialogs
    .map((d) => dialogItem(d, entities, now))
    .filter(Boolean);
  return {
    ok: true,
    owner,
    chats,
    page: pageOf(answer, limit, owner, body.cursor),
  };
};
