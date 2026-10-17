/**
 * Live Telegram updates (MTProto), as plain effects.
 *
 * GramJS hands a raw-update handler one update at a time (containers are
 * already unpacked, each update carrying `_entities`: the users and chats
 * it mentions, keyed by their marked peer id). This module turns one
 * update into what the app should do about it, without touching the
 * store, so it is tested with plain objects:
 *
 *   { kind: 'message', chat, message, entities }  a new message
 *   { kind: 'edit', chat, message, entities }     an edited message
 *   { kind: 'delete', chat, ids }                 deleted (chat null: a
 *                                                 user/basic-group delete,
 *                                                 whose ids are account-wide)
 *   { kind: 'read', chat, maxId }                 the other side read our
 *                                                 messages up to maxId
 *   { kind: 'typing', chat, user, typing }        someone types (or stops)
 *
 * Chat ids are GramJS "marked" peer ids, the same ones dialogs use: a
 * user's id, `-<id>` for a basic group, `-100<id>` for a channel or
 * supergroup.
 */

const text = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

/** The marked chat id of a Peer (PeerUser / PeerChat / PeerChannel). */
export const peerChatId = (peer) => {
  if (!peer) {
    return null;
  }
  if (peer.userId !== undefined) {
    return text(peer.userId);
  }
  if (peer.chatId !== undefined) {
    return `-${text(peer.chatId)}`;
  }
  if (peer.channelId !== undefined) {
    return `-100${text(peer.channelId)}`;
  }
  return null;
};

const NEW_MESSAGE = new Set(['UpdateNewMessage', 'UpdateNewChannelMessage']);
const EDIT_MESSAGE = new Set(['UpdateEditMessage', 'UpdateEditChannelMessage']);
const TYPING = new Set([
  'UpdateUserTyping',
  'UpdateChatUserTyping',
  'UpdateChannelUserTyping',
]);

// Service messages (joins, pins, calls) have `action` and no text.
const isChatMessage = (message) =>
  message && message.className !== 'MessageService' && !message.action;

// The short forms Telegram uses for a private / basic-group message
// carry the fields of a message without the Message object around them.
const shortMessage = (update) => {
  const isUser = update.className === 'UpdateShortMessage';
  const chat = isUser ? text(update.userId) : `-${text(update.chatId)}`;
  const message = {
    id: update.id,
    message: update.message,
    date: update.date,
    out: Boolean(update.out),
    senderId: isUser
      ? update.out
        ? null
        : update.userId
      : (update.fromId ?? null),
    replyTo: update.replyTo,
    media: update.media,
    editDate: null,
  };
  return { kind: 'message', chat, message, entities: update._entities };
};

const typingEffect = (update) => {
  const typing = update.action?.className !== 'SendMessageCancelAction';
  if (update.className === 'UpdateUserTyping') {
    const user = text(update.userId);
    return { kind: 'typing', chat: user, user, typing };
  }
  const chat =
    update.className === 'UpdateChatUserTyping'
      ? `-${text(update.chatId)}`
      : `-100${text(update.channelId)}`;
  const user = peerChatId(update.fromId) ?? text(update.userId);
  return { kind: 'typing', chat, user, typing };
};

const ids = (update) => (update.messages ?? []).map(Number);
const channelOf = (update) => `-100${text(update.channelId)}`;

// Deletions and read receipts: one line each.
const SIMPLE_EFFECTS = {
  UpdateDeleteMessages: (u) => ({ kind: 'delete', chat: null, ids: ids(u) }),
  UpdateDeleteChannelMessages: (u) => ({
    kind: 'delete',
    chat: channelOf(u),
    ids: ids(u),
  }),
  UpdateReadHistoryOutbox: (u) => ({
    kind: 'read',
    chat: peerChatId(u.peer),
    maxId: Number(u.maxId),
  }),
  UpdateReadChannelOutbox: (u) => ({
    kind: 'read',
    chat: channelOf(u),
    maxId: Number(u.maxId),
  }),
};

/** What one raw update means for the app, or null when nothing. */
export const updateEffect = (update) => {
  const name = update?.className;
  if (!name) {
    return null;
  }
  if (NEW_MESSAGE.has(name) || EDIT_MESSAGE.has(name)) {
    const message = update.message;
    if (!isChatMessage(message)) {
      return null;
    }
    return {
      kind: NEW_MESSAGE.has(name) ? 'message' : 'edit',
      chat: peerChatId(message.peerId),
      message,
      entities: update._entities,
    };
  }
  if (name === 'UpdateShortMessage' || name === 'UpdateShortChatMessage') {
    return shortMessage(update);
  }
  const simple = SIMPLE_EFFECTS[name];
  if (simple) {
    return simple(update);
  }
  if (TYPING.has(name)) {
    return typingEffect(update);
  }
  return null;
};

/** The kind of chat a marked id names, for chat links. */
export const chatKindOf = (chat) => {
  const id = String(chat ?? '');
  if (id.startsWith('-100')) {
    return 'channel';
  }
  return id.startsWith('-') ? 'group' : 'user';
};
