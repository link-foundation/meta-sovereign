/**
 * Where each Telegram chat is, kept in the store (R-Y34): the input peer
 * Telegram needs to be asked about a chat (its id and access hash), and
 * what kind of chat it is, as `peer:telegram:<chat>` links.
 *
 * GramJS knows a chat only after it has seen it in an answer; after a
 * restart, asking for a chat by its bare id made it look the chat up
 * (`getEntity`) or list the dialogs again — a request more for every
 * chat read. With the peer stored, reading a chat is one request, and
 * the chat list is asked for only to read the chat list.
 */

import { importTelegram } from './telegram-layer.js';

const SOURCE = 'telegram';

export const peerLinkId = (chat) => `peer:${SOURCE}:${chat}`;

const text = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

// An input peer or an entity as `{ kind, id, accessHash }`; null for a
// "min" entity, whose access hash does not work for asking.
const KINDS = {
  InputPeerUser: (p) => ({ kind: 'user', id: p.userId, hash: p.accessHash }),
  InputPeerChat: (p) => ({ kind: 'chat', id: p.chatId, hash: null }),
  InputPeerChannel: (p) => ({
    kind: 'channel',
    id: p.channelId,
    hash: p.accessHash,
  }),
  User: (e) => ({ kind: 'user', id: e.id, hash: e.accessHash }),
  Chat: (e) => ({ kind: 'chat', id: e.id, hash: null }),
  Channel: (e) => ({ kind: 'channel', id: e.id, hash: e.accessHash }),
};

/** The stored form of an input peer or entity, or null. */
export const peerRecord = (value) => {
  const make = KINDS[value?.className];
  if (!make || value.min) {
    return null;
  }
  const { kind, id, hash } = make(value);
  if (id === undefined || (kind !== 'chat' && !text(hash))) {
    return null;
  }
  return { kind, peerId: text(id), accessHash: text(hash) };
};

/** What the chat is, for the links its messages become. */
const infoOf = (dialog = {}) => ({
  title: dialog.title ?? dialog.name ?? null,
  isUser: Boolean(dialog.isUser),
  isGroup: Boolean(dialog.isGroup),
  isChannel: Boolean(dialog.isChannel),
});

const sameRecord = (a, b) =>
  Boolean(a) &&
  ['kind', 'peerId', 'accessHash', 'title', 'isGroup', 'isChannel'].every(
    (f) => (a[f] ?? null) === (b[f] ?? null)
  );

/**
 * `remember(chat, inputPeer, dialog)` stores a chat's peer (only when it
 * changed); `input(chat)` rebuilds the GramJS input peer, or null when
 * the chat was never listed; `dialog(chat)` the chat's kind and name.
 */
export const createPeers = ({ store, importer = importTelegram }) => {
  const known = new Map(); // chat -> stored record (or null)

  const read = async (chat) => {
    if (!known.has(chat)) {
      known.set(chat, (await store.get(peerLinkId(chat))) ?? null);
    }
    return known.get(chat);
  };

  const remember = async (chat, value, dialog) => {
    const record = peerRecord(value);
    if (!chat || !record) {
      return false;
    }
    const link = {
      id: peerLinkId(chat),
      tokens: ['peer', SOURCE, String(chat)],
      kind: 'peer',
      source: SOURCE,
      chat: String(chat),
      ...record,
      ...infoOf(dialog),
    };
    // An entity seen in an update has no dialog: keep the listed name.
    const before = await read(String(chat));
    const next = dialog ? link : { ...link, ...(before ? infoOf(before) : {}) };
    if (sameRecord(before, next)) {
      return false;
    }
    known.set(String(chat), next);
    await store.put({ ...(before ?? {}), ...next });
    return true;
  };

  const input = async (chat) => {
    const record = await read(String(chat));
    if (!record?.peerId) {
      return null;
    }
    const { Api, helpers } = await importer();
    const big = (value) => helpers.returnBigInt(String(value));
    if (record.kind === 'user') {
      return new Api.InputPeerUser({
        userId: big(record.peerId),
        accessHash: big(record.accessHash),
      });
    }
    if (record.kind === 'chat') {
      return new Api.InputPeerChat({ chatId: big(record.peerId) });
    }
    return new Api.InputPeerChannel({
      channelId: big(record.peerId),
      accessHash: big(record.accessHash),
    });
  };

  const dialog = async (chat) => {
    const record = await read(String(chat));
    return record ? { id: String(chat), ...infoOf(record) } : null;
  };

  return { remember, input, dialog };
};
