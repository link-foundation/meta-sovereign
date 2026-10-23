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
 *   { kind: 'read-inbox', chat, maxId, stillUnread } we read theirs up to
 *                                                 maxId (on any device)
 *   { kind: 'draft', chat, text, date }           the chat's cloud draft
 *                                                 changed (another device)
 *   { kind: 'typing', chat, user, typing }        someone types (or stops)
 *   { kind: 'poll', chat, id, pollId, poll, results }
 *                                                 a poll's results moved
 *   { kind: 'transcript', chat, id, transcriptionId, text, pending }
 *                                                 a voice or video note's
 *                                                 transcription moved
 *                                                 (R-Y175)
 *   { kind: 'requests', chat, pending, recent, entities }
 *                                                 people waiting to join the
 *                                                 chat, how many and the
 *                                                 latest ids (R-Y161)
 *
 *   { kind: 'ephemeral', chat, message, entities }
 *                                                 a bot's message for this
 *                                                 user only, new or edited
 *                                                 (layer 232, R-Y223)
 *   { kind: 'ephemeral-delete', chat, ids }       such messages deleted
 *
 *   { kind: 'group-call', chat, id, call }        a voice chat / live stream
 *                                                 started, changed or ended
 *                                                 (call null; chat may be
 *                                                 null: found by id, R-Y188)
 *   { kind: 'group-call-people', id }             its participants changed
 *   { kind: 'phone-call', phoneCall, entities }   a private call moved: the
 *                                                 raw PhoneCall for the call
 *                                                 machine (R-Y196)
 *
 * Chat ids are GramJS "marked" peer ids, the same ones dialogs use: a
 * user's id, `-<id>` for a basic group, `-100<id>` for a channel or
 * supergroup.
 */

import { rawMessage } from './telegram-history.js';
import { shapeCall } from './telegram-voice-chat.js';

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

/**
 * Who wrote a message. GramJS fills `senderId` only for the messages it
 * builds itself (`getMessages`); a raw one — from an update or a
 * channel's difference — names its author in `fromId` only: a person,
 * or a channel posting. Neither: the private chat's other side (null).
 */
export const messageSenderId = (message) =>
  text(message?.senderId) ?? peerChatId(message?.fromId);

const NEW_MESSAGE = new Set(['UpdateNewMessage', 'UpdateNewChannelMessage']);
const EDIT_MESSAGE = new Set(['UpdateEditMessage', 'UpdateEditChannelMessage']);
const TYPING = new Set([
  'UpdateUserTyping',
  'UpdateChatUserTyping',
  'UpdateChannelUserTyping',
]);

// A chat's message, service messages (joins, pins, calls) included:
// they are stored with their action and shown as a line of their own.
const isChatMessage = (message) =>
  Boolean(message) && message.className !== 'MessageEmpty';

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

/**
 * GramJS's connection state, which it hands to update handlers as an
 * `UpdateConnectionState` (no TL `className`): 1 connected, 0 broken,
 * -1 disconnected; null for anything else.
 */
export const connectionStateOf = (update) =>
  update && !update.className && [-1, 0, 1].includes(update.state)
    ? update.state
    : null;

const ids = (update) => (update.messages ?? []).map(Number);
const channelOf = (update) => `-100${text(update.channelId)}`;

// Deletions and read receipts: one line each.
// How many Telegram says are still unread after a read, when it says.
const stillUnreadOf = (u) =>
  Number.isFinite(u.stillUnreadCount)
    ? { stillUnread: u.stillUnreadCount }
    : {};

// An ephemeral message's chat: its peer, else (a bot's private chat) the
// bot that wrote it.
const ephemeralEffect = (u) => ({
  kind: 'ephemeral',
  chat: peerChatId(u.message?.peerId) ?? peerChatId(u.message?.fromId),
  message: u.message,
  entities: u._entities,
});

const SIMPLE_EFFECTS = {
  // Ephemeral messages (R-Y223): shown to one user, never in the history.
  UpdateNewEphemeralMessage: ephemeralEffect,
  UpdateEditEphemeralMessage: ephemeralEffect,
  UpdateDeleteEphemeralMessages: (u) => ({
    kind: 'ephemeral-delete',
    chat: peerChatId(u.peer),
    ids: ids({ messages: u.ids }),
  }),
  // A poll's results moved (anyone's vote, ours too), R-Y74: which poll
  // (by message when Telegram says, else by poll id), its new results
  // and, when it changed (closed), the poll.
  UpdateMessagePoll: (u) => ({
    kind: 'poll',
    chat: u.peer ? peerChatId(u.peer) : null,
    id: Number(u.msgId) || null,
    pollId: u.pollId === undefined ? null : String(u.pollId),
    poll: u.poll ? rawMessage(u.poll) : null,
    results: rawMessage(u.results ?? null),
  }),
  // A voice or video note's transcription, partial or final (R-Y175).
  UpdateTranscribedAudio: (u) => ({
    kind: 'transcript',
    chat: peerChatId(u.peer),
    id: Number(u.msgId) || null,
    transcriptionId: String(u.transcriptionId),
    text: String(u.text ?? ''),
    pending: Boolean(u.pending),
  }),
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
  UpdateReadHistoryInbox: (u) => ({
    kind: 'read-inbox',
    chat: peerChatId(u.peer),
    maxId: Number(u.maxId),
    ...stillUnreadOf(u),
  }),
  UpdateReadChannelInbox: (u) => ({
    kind: 'read-inbox',
    chat: channelOf(u),
    maxId: Number(u.maxId),
    ...stillUnreadOf(u),
  }),
  // Pinned or unpinned: the chat's pinned bar follows.
  UpdatePinnedMessages: (u) => ({
    kind: 'pin',
    chat: peerChatId(u.peer),
    ids: ids(u),
    pinned: Boolean(u.pinned),
  }),
  UpdatePinnedChannelMessages: (u) => ({
    kind: 'pin',
    chat: channelOf(u),
    ids: ids(u),
    pinned: Boolean(u.pinned),
  }),
  // A voice chat or live stream began, changed or ended (R-Y188).
  UpdateGroupCall: (u) => ({
    kind: 'group-call',
    chat: peerChatId(u.peer),
    id: text(u.call?.id),
    call: shapeCall(u.call),
  }),
  // A private call's state moved (R-Y196); the machine reads the raw
  // PhoneCall. Its signalling data is not used (no media in a browser).
  UpdatePhoneCall: (u) =>
    u.phoneCall
      ? { kind: 'phone-call', phoneCall: u.phoneCall, entities: u._entities }
      : null,
  UpdateGroupCallParticipants: (u) => ({
    kind: 'group-call-people',
    id: text(u.call?.id),
  }),
  // The join requests waiting changed (R-Y161): their count and the
  // latest requesters (the "N requested to join" bar follows).
  UpdatePendingJoinRequests: (u) => ({
    kind: 'requests',
    chat: peerChatId(u.peer),
    pending: Math.max(0, Number(u.requestsPending) || 0),
    recent: (u.recentRequesters ?? []).map((id) => text(id)),
    entities: u._entities,
  }),
  // How the chat is listed: muted, pinned, archived (R-Y68).
  UpdateNotifySettings: (u) =>
    u.peer?.className === 'NotifyPeer'
      ? {
          kind: 'listing',
          chat: peerChatId(u.peer.peer),
          muteUntil: Number(u.notifySettings?.muteUntil ?? 0) || 0,
        }
      : null,
  UpdateDialogPinned: (u) =>
    u.peer?.className === 'DialogPeer'
      ? {
          kind: 'listing',
          chat: peerChatId(u.peer.peer),
          pinned: Boolean(u.pinned),
          folder: Number(u.folderId ?? 0) === 1 ? 1 : 0,
        }
      : null,
  UpdatePinnedDialogs: (u) =>
    Array.isArray(u.order)
      ? {
          kind: 'pinned-order',
          folder: Number(u.folderId ?? 0) === 1 ? 1 : 0,
          chats: u.order
            .filter((p) => p?.className === 'DialogPeer')
            .map((p) => peerChatId(p.peer))
            .filter(Boolean),
        }
      : null,
  UpdateFolderPeers: (u) => ({
    kind: 'folders',
    peers: (u.folderPeers ?? [])
      .map((f) => ({
        chat: peerChatId(f.peer),
        folder: Number(f.folderId) === 1 ? 1 : 0,
      }))
      .filter((f) => f.chat),
  }),
  // The folders changed on another device (R-Y172): one folder, all of
  // them, or their order. The page asks Telegram for the list again.
  UpdateDialogFilter: (u) => ({
    kind: 'folders-live',
    change: 'filter',
    id: Number(u.id) || 0,
  }),
  UpdateDialogFilters: () => ({ kind: 'folders-live', change: 'all', id: 0 }),
  UpdateDialogFilterOrder: (u) => ({
    kind: 'folders-live',
    change: 'order',
    id: 0,
    order: (u.order ?? []).map(Number),
  }),
  // Marked unread, or the mark taken off, on any device (R-Y97).
  UpdateDialogUnreadMark: (u) =>
    u.peer?.className === 'DialogPeer'
      ? {
          kind: 'listing',
          chat: peerChatId(u.peer.peer),
          unreadMark: Boolean(u.unread),
        }
      : null,
  // A forum topic's draft (topMsgId) is not the chat's own.
  UpdateDraftMessage: (u) =>
    u.topMsgId
      ? null
      : {
          kind: 'draft',
          chat: peerChatId(u.peer),
          text: u.draft?.message ?? '',
          date: Number(u.draft?.date) || null,
        },
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
