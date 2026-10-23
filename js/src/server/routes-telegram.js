/**
 * The connected Telegram account (see ../sources/telegram-account.js).
 *   GET  /api/telegram/status          -> { connected, kind, account, at, … }
 *   POST /api/telegram/sync    {full?} -> the status after a sync
 *   POST /api/telegram/history {chat, before?, limit?, priority?}
 *                                      -> { written, cached, complete } the
 *                                         chat's newest messages, or the page
 *                                         before message `before`; the store
 *                                         answers what it already holds
 *                            {chat, after} -> { written, cached, newest } the
 *                                         page after message `after` (R-Y106)
 *   POST /api/telegram/history-at {chat, date}
 *                                      -> { ok, id, newest } the first message
 *                                         at or after `date` (unix seconds)
 *                                         and a page around it (R-Y106)
 *                       {chat, id} -> { ok, id, newest } message `id` and a
 *                                         page around it (a jump to a message
 *                                         far back, R-Y107)
 *   POST /api/telegram/dialogs {priority?}
 *                                      -> { written, complete } the next page
 *                                         of the chat list
 *   POST /api/telegram/read {chat, maxId}
 *                                      -> { ok } marks the chat read up to
 *                                         maxId on Telegram (forward only)
 *   POST /api/telegram/draft {chat, text}
 *                                      -> { ok } the chat's cloud draft
 *   POST /api/telegram/refresh {chat, ids, priority?}
 *                                      -> { written, deleted } those messages
 *                                         read again; gone ones marked deleted
 *   POST /api/telegram/forward {fromChat, ids, toChat, dropAuthor?,
 *                       dropMediaCaptions?}
 *                                      -> { ok, forwarded } (the two flags
 *                                         hide the sender's name and the
 *                                         captions, R-Y154)
 *   POST /api/telegram/delete {chat, ids, revoke?}
 *                                      -> { ok, deleted }
 *   POST /api/telegram/pin {chat, id, unpin?, oneSide?, silent?}
 *                                      -> { ok, pinned }
 *   POST /api/telegram/dialog {chat, action, for?}
 *                                      -> { ok } the chat list's menu:
 *                                         pin, unpin, mute (for seconds),
 *                                         unmute, archive, unarchive,
 *                                         read, unread (R-Y97)
 *   POST /api/telegram/search-peers {q}
 *                                      -> { ok, peers } people and chats by
 *                                         name or username (R-Y107)
 *   POST /api/telegram/search-global {q, cursor?}
 *                                      -> { ok, messages, count, more, cursor }
 *                                         messages in every chat (R-Y107)
 *   POST /api/telegram/search {chat, q, offsetId?}
 *                                      -> { ids, count, more } the chat's
 *                                         messages with `q`, newest first,
 *                                         stored (R-Y98)
 *   POST /api/telegram/history {chat, topic, before?, limit?}
 *                                      -> { written, complete } a forum
 *                                         topic's newest messages, or the
 *                                         page before `before` (R-Y122)
 *   POST /api/telegram/forum-topics {chat, fresh?}
 *                                      -> { ok, forum, topics } a forum
 *                                         group's topics (R-Y122)
 *   POST /api/telegram/comments {chat, post, before?, limit?}
 *                                      -> { ok, group, root, messages,
 *                                         complete } a channel post's
 *                                         comments or a message's thread,
 *                                         oldest first (R-Y126)
 *   POST /api/telegram/comments-read {chat, post, max}
 *                                      -> { ok } the comments up to max read
 *   POST /api/telegram/readers {chat, id}
 *                                      -> { ok, readers: [{ id, name, date }] }
 *                                         who read the user's own message
 *                                         in a small group (R-Y127)
 *   POST /api/telegram/translate {chat, ids, to}
 *                                      -> { ok, items: [{ id, text,
 *                                         entities }] } 1..20 messages
 *                                         translated to `to` (R-Y132)
 *   POST /api/telegram/bot-commands {chat}
 *                                      -> { ok, commands: [{ command,
 *                                         description, bot, botName,
 *                                         username }], menu: { kind, text?,
 *                                         url? } } a bot's or a group's
 *                                         bots' commands (R-Y135)
 *   POST /api/telegram/reactors {chat, id, emoji?, offset?}
 *                                      -> { ok, count, items, next } who
 *                                         reacted to a message, by page
 *                                         (R-Y127)
 *   POST /api/telegram/comment-send {chat, post, text, replyTo?, clientId?}
 *                                      -> { ok, chat } a comment sent to
 *                                         the discussion group
 *   POST /api/telegram/shared-counts {chat}
 *                                      -> { ok, counts } how many photos,
 *                                         videos, files… (R-Y111)
 *   POST /api/telegram/shared-media {chat, kind, offsetId?}
 *                                      -> { ok, messages, count, more,
 *                                         last } a kind's, newest first
 *   POST /api/telegram/upload?name=   (application/octet-stream body)
 *                                      -> { token, name, size } one file
 *                                         kept for send-files (R-Y99)
 *   POST /api/telegram/send-files {chat, tokens, caption?, asPhoto?,
 *                                  group?, replyTo?}
 *                                      -> { ok, ids } the files sent:
 *                                         photos, albums, files (R-Y99)
 *   POST /api/telegram/send-voice {chat, token, duration, waveform?,
 *                                  replyTo?}
 *                                      -> { ok, ids } a recorded voice
 *                                         as a voice message (R-Y108)
 *   POST /api/telegram/bot-callback {chat, id, data?, game?}
 *                                      -> { ok, message, alert, url } a
 *                                         bot's button pressed (R-Y110)
 *   POST /api/telegram/sticker-search {q, lang?}
 *                                      -> { ok, stickers, sets } stickers
 *                                         for an emoji or words (R-Y112)
 *   POST /api/telegram/sticker-save {id, action}
 *                                      -> { ok } fave, unfave, unrecent,
 *                                         saveGif or unsaveGif (R-Y115)
 *   POST /api/telegram/sticker-set-install {id, install}
 *                                      -> { ok, installed } a found set
 *                                         added, or one removed (R-Y116)
 *   POST /api/telegram/invite-check {hash}
 *                                      -> { ok, already, chat | invite }
 *                                         what an invite link leads to
 *                                         (R-Y123)
 *   POST /api/telegram/invite-join {hash}
 *                                      -> { ok, chat? } the user joined
 *                                         (or asked to), on their press
 *   POST /api/telegram/chat-contacts   -> { ok, contacts } the contacts to
 *                                         pick a new group's members from
 *                                         (R-Y129)
 *   POST /api/telegram/group-create {title, users}
 *                                      -> { ok, chat, title } a basic group
 *   POST /api/telegram/channel-create {title, about?}
 *                                      -> { ok, chat, title } a channel
 *   POST /api/telegram/chat-edit {chat, title?, about?, photo?}
 *                                      -> { ok } a chat's name, description
 *                                         and photo (an upload's token, or
 *                                         "remove") changed
 *   POST /api/telegram/profile         -> { ok, id, firstName, lastName,
 *                                         about, username, phone, hasPhoto,
 *                                         aboutMax } the user's own profile
 *                                         (R-Y136)
 *   POST /api/telegram/profile-save {firstName?, lastName?, about?}
 *                                      -> { ok } names (1..64, 0..64) and
 *                                         bio (0..140) changed
 *   POST /api/telegram/username-check {username}
 *                                      -> { ok, status: available | taken |
 *                                         invalid }
 *   POST /api/telegram/username-save {username}
 *                                      -> { ok } ("" removes it)
 *   POST /api/telegram/profile-photo {token} | {remove: true}
 *                                      -> { ok } an upload set as the photo,
 *                                         or the photo removed
 *   POST /api/telegram/invite-revoke {chat}
 *                                      -> { ok, link } a chat's primary
 *                                         invite link replaced
 *   POST /api/telegram/peer-block {chat, block} -> { ok, blocked }
 *   POST /api/telegram/peer-contact {chat, add, firstName?, lastName?,
 *                                    share?} -> { ok, contact }
 *   POST /api/telegram/peer-report {chat, option?, message?} -> { ok,
 *                  result: choose{title, options} | comment{optional,
 *                  option} | reported } (R-Y128)
 *   POST /api/telegram/peer-report-spam {chat} -> { ok }
 *   POST /api/telegram/peer-settings {chat} -> { ok, bar: { reportSpam,
 *                                      addContact, blockContact,
 *                                      shareContact, autoarchived,
 *                                      registered, country } } (R-Y137)
 *   POST /api/telegram/peer-hide-bar {chat} -> { ok }
 *   POST /api/telegram/peer-share-contact {chat} -> { ok }
 *   POST /api/telegram/members {chat, q?, offset?, limit?}
 *                                      -> { ok, total, members, canBan,
 *                                         canInvite } a group's members,
 *                                         recent or found by words (R-Y125)
 *   POST /api/telegram/member-remove {chat, user}
 *                                      -> { ok } a member removed from the
 *                                         group; they may come back
 *   POST /api/telegram/sticker-set-box {id, accessHash} | {shortName}
 *                                      -> { ok, set, items } the set a
 *                                         chat's sticker belongs to, for
 *                                         its box (R-Y124)
 *   POST /api/telegram/dice {emoticon}
 *                                      -> { ok, emoticon, items } a die's
 *                                         animations: items[n] rolls to n
 *                                         (R-Y130)
 *   POST /api/telegram/emoji-keywords {lang}
 *                                      -> { ok, lang, keywords } the words
 *                                         emoji are found by (R-Y117)
 *   POST /api/telegram/gif-search {q, offset?}
 *                                      -> { ok, gifs, next } GIFs found
 *                                         by Telegram's @gif bot
 *   POST /api/telegram/remove-chat {chat, action, revoke?}
 *                                      -> { ok, deleted } clear, delete
 *                                         or leave the chat (R-Y100)
 * Responses carry the account's public name and counts, never a secret.
 *
 * Routes of the routes-telegram-*.js tables are documented in those files.
 */

import { classifyOrigin } from './cors.js';
import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { DIALOG_ACTIONS } from '../sources/telegram-dialogs.js';
import { MAX_QUERY } from '../sources/telegram-search.js';
import { SHARED_KINDS } from '../sources/telegram-shared.js';
import { STICKER_SAVES } from '../sources/telegram-stickers.js';
import { DICE } from '../sources/telegram-send.js';
import { GETS } from './routes-telegram-files.js';
import { ADMIN_POSTS } from './routes-telegram-admin.js';
import { COMMON_CHATS_POSTS } from './routes-telegram-common-chats.js';
import { PINNED_ORDER_POSTS } from './routes-telegram-pinned-order.js';
import { TOPIC_ADMIN_POSTS } from './routes-telegram-topic-admin.js';
import { CHAT_REACTIONS_POSTS } from './routes-telegram-chat-reactions.js';
import { INVITE_LINKS_POSTS } from './routes-telegram-invite-links.js';
import { STORY_POST_POSTS } from './routes-telegram-story-post.js';
import {
  WALLPAPER_GETS,
  WALLPAPER_POSTS,
} from './routes-telegram-wallpapers.js';
import { NOTIFY_SETTINGS_POSTS } from './routes-telegram-notify-settings.js';
import { CALLS_POSTS } from './routes-telegram-calls.js';
import { EFFECTS_POSTS, validEffect } from './routes-telegram-effects.js';
import { EMOJI_STATUS_POSTS } from './routes-telegram-emoji-status.js';
import { ROUND_POSTS } from './routes-telegram-round.js';
import { PRIVACY_POSTS } from './routes-telegram-privacy.js';
import { SHARE_POSTS } from './routes-telegram-share.js';
import { INLINE_POSTS } from './routes-telegram-inline.js';
import { MESSAGE_LINK_POSTS } from './routes-telegram-message-links.js';
import { TTL_POSTS } from './routes-telegram-ttl.js';
import { SAVED_TAGS_POSTS } from './routes-telegram-saved-tags.js';
import { SEND_AS_POSTS } from './routes-telegram-send-as.js';
import { validSendAs } from '../sources/telegram-send-as-client.js';
import { STORIES_POSTS } from './routes-telegram-stories.js';
import { STORY_ACTION_POSTS } from './routes-telegram-story-actions.js';
import { LINK_PREVIEW_POSTS } from './routes-telegram-link-preview.js';
import { INVITE_HASH } from '../sources/telegram-invite.js';
import { MAX_GLOBAL_QUERY } from '../sources/telegram-global.js';
import { removalAllowed } from '../sources/telegram-chat-removal.js';
import {
  MAX_CAPTION,
  MAX_FILES,
  MAX_UPLOAD,
  MAX_VOICE_SECONDS,
  WAVEFORM_SIZE,
} from '../sources/telegram-upload.js';
import { validSchedule } from '../sources/telegram-scheduled.js';

export { byteRange, fromApp } from './routes-telegram-files.js';

const PREFIX = '/api/telegram/';

const NONE = { connected: false, kind: null, account: null };

// Only the page asks for what the user looks at; anything else waits.
const PRIORITIES = new Set(['view', 'list', 'prefetch']);
const priorityOf = (value) => (PRIORITIES.has(value) ? value : 'prefetch');

// The forward options, when given, are booleans (R-Y154).
const validForwardFlags = (body) =>
  ['dropAuthor', 'dropMediaCaptions'].every(
    (key) => body[key] === undefined || typeof body[key] === 'boolean'
  );

// Validate an array of positive integers (message ids).
const validIds = (ids) =>
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.length <= 100 &&
  ids.every((id) => Number.isInteger(id) && id > 0);

// A marked Telegram chat id, as a string.
const validChat = (chat) =>
  typeof chat === 'string' && /^-?\d{1,20}$/.test(chat);

// A group's marked id, and a members page: words and a window (R-Y125).
const GROUP_CHAT = /^-\d{1,20}$/;
const validMembersPage = (body) =>
  (body.q === undefined ||
    (typeof body.q === 'string' && body.q.length <= 64)) &&
  (body.offset === undefined ||
    (Number.isInteger(body.offset) && body.offset >= 0)) &&
  (body.limit === undefined ||
    (Number.isInteger(body.limit) && body.limit >= 1 && body.limit <= 200));

// A peer action: the account's answer, a bad request being a 400 (R-Y128).
const peerAction = async (account, name, body) => {
  if (typeof account[name] !== 'function') {
    return [400, { error: 'chat required', code: 'bad-request' }];
  }
  const answer = await account[name](body);
  return answer?.error === 'bad request'
    ? [400, { error: 'bad request', code: 'bad-request' }]
    : [200, answer];
};

// POST /api/telegram/<name>: [status, answer] for one request body.
// Without sound; at a time (R-Y102).
const whenOf = (body) => ({
  // Sent as another identity in a group (R-Y141).
  ...(body.sendAs === undefined ? {} : { sendAs: body.sendAs }),
  ...(body.silent === true ? { silent: true } : {}),
  ...(body.scheduleDate !== undefined
    ? { scheduleDate: body.scheduleDate }
    : {}),
});

const scheduledChange = async (change, body) => {
  if (
    !validChat(body.chat) ||
    !validIds(body.ids) ||
    typeof change !== 'function'
  ) {
    return [400, { error: 'chat and ids[] required', code: 'bad-request' }];
  }
  return [200, await change({ chat: body.chat, ids: body.ids.map(Number) })];
};

// The user's own profile (R-Y136): names and bio, a username, a photo.
const text = (value, min, max) =>
  typeof value === 'string' &&
  Array.from(value.trim()).length >= min &&
  Array.from(value).length <= max;
const validProfile = (body) =>
  ['firstName', 'lastName', 'about'].some((k) => body[k] !== undefined) &&
  (body.firstName === undefined || text(body.firstName, 1, 64)) &&
  (body.lastName === undefined || text(body.lastName, 0, 64)) &&
  (body.about === undefined || text(body.about, 0, 140));
const USERNAME = /^$|^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const validUsername = (body) =>
  typeof body.username === 'string' && USERNAME.test(body.username);
const validPhoto = (body) =>
  body.remove === true
    ? body.token === undefined
    : typeof body.token === 'string' && /^[a-f0-9]{32}$/.test(body.token);
const profileRoute = (method, valid, ask, message) => async (account, body) =>
  valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](ask(body))]
    : [400, { error: message, code: 'bad-request' }];

// Files and photos to send (R-Y99), with when (R-Y102).
const validFiles = (body) =>
  validChat(body.chat) &&
  Array.isArray(body.tokens) &&
  body.tokens.length > 0 &&
  body.tokens.length <= MAX_FILES &&
  body.tokens.every((t) => typeof t === 'string' && /^[a-f0-9]{32}$/.test(t)) &&
  validSendAs(body.sendAs) &&
  validEffect(body.effect) &&
  (body.caption === undefined || typeof body.caption === 'string') &&
  String(body.caption ?? '').length <= MAX_CAPTION &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate));

// A recorded voice to send (R-Y108): one upload, its length, its
// waveform's values 0..31.
const validVoice = (body) =>
  validChat(body.chat) &&
  typeof body.token === 'string' &&
  /^[a-f0-9]{32}$/.test(body.token) &&
  Number.isFinite(body.duration) &&
  body.duration >= 0 &&
  body.duration <= MAX_VOICE_SECONDS &&
  validSendAs(body.sendAs) &&
  (body.waveform === undefined ||
    (Array.isArray(body.waveform) &&
      body.waveform.length <= WAVEFORM_SIZE &&
      body.waveform.every((v) => Number.isInteger(v) && v >= 0 && v <= 31))) &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate));

// A sticker or GIF to send (R-Y105).
const STICKER_ID = /^\d{1,20}$/;
const validDocument = (body) =>
  validChat(body.chat) &&
  validSendAs(body.sendAs) &&
  STICKER_ID.test(String(body.id ?? '')) &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate));

// A sticker set's id and access hash (signed), or its short name.
const SET_ID = /^-?\d{1,20}$/;
const SHORT_NAME = /^[A-Za-z0-9_]{1,64}$/;
const numeric = (v) => typeof v === 'string' && SET_ID.test(v);
const validSetBox = (body) =>
  (numeric(body.id) && numeric(body.accessHash)) ||
  (typeof body.shortName === 'string' && SHORT_NAME.test(body.shortName));

const positive = (n) => Number.isInteger(n) && n > 0;

// A comment: a post of a chat, words to send, what it answers (R-Y126).
const MAX_COMMENT = 16_384;
const validComment = (body) =>
  validChat(body.chat) &&
  positive(body.post) &&
  typeof body.text === 'string' &&
  body.text.trim().length > 0 &&
  body.text.length <= MAX_COMMENT &&
  (body.replyTo === undefined || positive(body.replyTo)) &&
  (body.clientId === undefined ||
    (typeof body.clientId === 'string' && body.clientId.length <= 64));

// A search across Telegram: a query of a sane length, and the account
// able to run it.
const globalQuery = (body, run) =>
  typeof body.q === 'string' &&
  body.q.trim().length > 0 &&
  body.q.length <= MAX_GLOBAL_QUERY &&
  typeof run === 'function';

// A forum topic's newest page, or the page before message `before`.
const topicPage = async (account, body) =>
  validChat(body.chat) && typeof account.topicHistory === 'function'
    ? [
        200,
        await account.topicHistory({
          chat: body.chat,
          topic: body.topic,
          limit: Math.min(Number(body.limit) || 50, 100),
          before: positive(body.before) ? body.before : null,
          priority: priorityOf(body.priority),
        }),
      ]
    : [400, { error: 'chat and topic required', code: 'bad-request' }];

// A chat's newest page, or the page before message `before`.
const historyPage = async (account, body) => [
  200,
  await account.history({
    chat: body.chat,
    limit: Math.min(Number(body.limit) || 50, 100),
    before:
      Number.isInteger(body.before) && body.before > 0 ? body.before : null,
    priority: priorityOf(body.priority),
  }),
];

// A bot button's data: at most 64 bytes, in base64.
const BOT_DATA = /^[A-Za-z0-9+/]{1,88}={0,2}$/;

// Words to search stickers or GIFs by; a language as two letters.
const searchWords = (q) =>
  typeof q === 'string' && q.trim().length > 0 && q.length <= 64;
const LANG = /^[a-z]{2}$/;

const POSTS = {
  sync: async (account, body) => [
    200,
    await account.sync({ full: Boolean(body.full), reason: 'manual' }),
  ],
  'read-marks': async (account, body) => [
    200,
    (await account.readMarks?.({
      chat: body.chat,
      kind: body.kind,
      ids: body.ids,
      last: Boolean(body.last),
    })) ?? { ok: false, supported: false },
  ],
  read: async (account, body) => [
    200,
    await account.markRead({
      chat: body.chat,
      maxId: body.maxId,
      // A forum topic is read on its own (R-Y122).
      ...(positive(body.topic) ? { topic: body.topic } : {}),
    }),
  ],
  draft: async (account, body) => {
    const text = typeof body.text === 'string' ? body.text : '';
    if (text.length > 20_000) {
      return [400, { error: 'draft too long', code: 'too-long' }];
    }
    return [200, await account.saveDraft({ chat: body.chat, text })];
  },
  history: async (account, body) => {
    if (body.topic !== undefined) {
      return positive(body.topic)
        ? topicPage(account, body)
        : [400, { error: 'bad topic', code: 'bad-request' }];
    }
    if (Number.isInteger(body.after) && body.after > 0) {
      if (typeof account.newer !== 'function') {
        return [400, { error: 'unsupported', code: 'bad-request' }];
      }
      return [
        200,
        await account.newer({
          chat: body.chat,
          after: body.after,
          limit: Math.min(Number(body.limit) || 50, 100),
          priority: priorityOf(body.priority),
        }),
      ];
    }
    return historyPage(account, body);
  },
  // The first message on a date, and a page around it (R-Y106).
  'history-at': async (account, body) => {
    const where = positive(body.id)
      ? { id: body.id, read: account.historyAround }
      : { date: body.date, read: account.historyAt };
    if (
      !validChat(body.chat) ||
      !positive(where.id ?? where.date) ||
      typeof where.read !== 'function'
    ) {
      return [400, { error: 'chat and date required', code: 'bad-request' }];
    }
    return [
      200,
      await where.read({
        chat: body.chat,
        ...(where.id ? { id: where.id } : { date: where.date }),
        priority: priorityOf(body.priority),
      }),
    ];
  },
  dialogs: async (account, body) => [
    200,
    (await account.moreDialogs?.({ priority: priorityOf(body.priority) })) ?? {
      written: 0,
      complete: true,
    },
  ],
  // Read messages again by id: edits stored, deletions marked (R-Y36).
  refresh: async (account, body) => {
    if (
      !body.chat ||
      !validIds(body.ids) ||
      typeof account.refreshMessages !== 'function'
    ) {
      return [400, { error: 'chat and ids[] required', code: 'bad-request' }];
    }
    return [
      200,
      await account.refreshMessages({
        chat: body.chat,
        ids: body.ids,
        priority: priorityOf(body.priority),
      }),
    ];
  },
  // Forward messages to another chat (the user's press in Chat).
  forward: async (account, body) => {
    if (
      !body.fromChat ||
      !body.toChat ||
      !validIds(body.ids) ||
      !validForwardFlags(body) ||
      typeof account.forwardMessages !== 'function'
    ) {
      return [
        400,
        { error: 'fromChat, toChat and ids[] required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.forwardMessages({
        fromChat: body.fromChat,
        toChat: body.toChat,
        ids: body.ids,
        dropAuthor: body.dropAuthor === true,
        dropMediaCaptions: body.dropMediaCaptions === true,
      }),
    ];
  },
  // Pin or unpin one message (R-Y67).
  pin: async (account, body) => {
    if (
      !body.chat ||
      !validIds([body.id]) ||
      typeof account.pinMessage !== 'function'
    ) {
      return [400, { error: 'chat and id required', code: 'bad-request' }];
    }
    return [
      200,
      await account.pinMessage({
        chat: body.chat,
        id: body.id,
        unpin: Boolean(body.unpin),
        oneSide: Boolean(body.oneSide),
        silent: Boolean(body.silent),
      }),
    ];
  },
  // The chat list's menu: pin, mute, archive, mark read (R-Y97).
  dialog: async (account, body) => {
    if (
      !validChat(body.chat) ||
      !DIALOG_ACTIONS.includes(body.action) ||
      typeof account.dialogAction !== 'function'
    ) {
      return [400, { error: 'chat and action required', code: 'bad-request' }];
    }
    return [
      200,
      await account.dialogAction({
        chat: body.chat,
        action: body.action,
        for: Number(body.for) || 0,
      }),
    ];
  },
  // Search in one chat (R-Y98).
  search: async (account, body) => {
    if (
      !validChat(body.chat) ||
      typeof body.q !== 'string' ||
      !body.q.trim() ||
      body.q.length > MAX_QUERY ||
      typeof account.searchChat !== 'function'
    ) {
      return [400, { error: 'chat and q required', code: 'bad-request' }];
    }
    return [
      200,
      await account.searchChat({
        chat: body.chat,
        q: body.q,
        offsetId: Number.isInteger(body.offsetId) ? body.offsetId : 0,
      }),
    ];
  },
  // A post's comments, a message's thread (R-Y126).
  comments: async (account, body) =>
    validChat(body.chat) &&
    positive(body.post) &&
    (body.before === undefined || positive(body.before)) &&
    typeof account.comments === 'function'
      ? [
          200,
          await account.comments({
            chat: body.chat,
            post: body.post,
            before: body.before ?? null,
            limit: Math.min(Number(body.limit) || 50, 100),
          }),
        ]
      : [400, { error: 'chat and post required', code: 'bad-request' }],
  'comments-read': async (account, body) =>
    validChat(body.chat) &&
    positive(body.post) &&
    positive(body.max) &&
    typeof account.readComments === 'function'
      ? [
          200,
          await account.readComments({
            chat: body.chat,
            post: body.post,
            max: body.max,
          }),
        ]
      : [400, { error: 'chat, post and max required', code: 'bad-request' }],
  translate: async (account, body) =>
    validChat(body.chat) &&
    validIds(body.ids) &&
    body.ids.length <= 20 &&
    typeof body.to === 'string' &&
    /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(body.to) &&
    typeof account.translateMessages === 'function'
      ? [200, await account.translateMessages(body)]
      : [400, { error: 'chat, ids and to required', code: 'bad-request' }],
  // A bot's commands, for the "/" list and the Menu button (R-Y135).
  'bot-commands': async (account, body) =>
    validChat(body.chat) && typeof account.botCommands === 'function'
      ? [200, await account.botCommands({ chat: body.chat })]
      : [400, { error: 'chat required', code: 'bad-request' }],
  // Who read a message, who reacted to it (R-Y127).
  readers: async (account, body) =>
    validChat(body.chat) &&
    positive(body.id) &&
    typeof account.messageReaders === 'function'
      ? [200, await account.messageReaders({ chat: body.chat, id: body.id })]
      : [400, { error: 'chat and id required', code: 'bad-request' }],
  reactors: async (account, body) =>
    validChat(body.chat) &&
    positive(body.id) &&
    (body.emoji === undefined ||
      (typeof body.emoji === 'string' && body.emoji.length <= 64)) &&
    (body.offset === undefined ||
      (typeof body.offset === 'string' && body.offset.length <= 256)) &&
    typeof account.messageReactors === 'function'
      ? [
          200,
          await account.messageReactors({
            chat: body.chat,
            id: body.id,
            emoji: body.emoji ?? '',
            offset: body.offset ?? '',
          }),
        ]
      : [400, { error: 'chat and id required', code: 'bad-request' }],
  'comment-send': async (account, body) =>
    validComment(body) && typeof account.sendComment === 'function'
      ? [
          200,
          await account.sendComment({
            chat: body.chat,
            post: body.post,
            text: body.text,
            replyTo: body.replyTo ?? null,
            clientId: body.clientId,
          }),
        ]
      : [400, { error: 'bad comment', code: 'bad-request' }],
  // A forum group's topics (R-Y122).
  'forum-topics': async (account, body) =>
    validChat(body.chat) && typeof account.forumTopics === 'function'
      ? [
          200,
          await account.forumTopics({
            chat: body.chat,
            ...(body.fresh === true ? { fresh: true } : {}),
          }),
        ]
      : [400, { error: 'chat required', code: 'bad-request' }],
  // A chat's shared media (R-Y111): how many of each kind, and a kind's.
  'shared-counts': async (account, body) =>
    validChat(body.chat) && typeof account.sharedCounts === 'function'
      ? [200, await account.sharedCounts({ chat: body.chat })]
      : [400, { error: 'chat required', code: 'bad-request' }],
  'shared-media': async (account, body) => {
    if (
      !validChat(body.chat) ||
      !Object.hasOwn(SHARED_KINDS, String(body.kind)) ||
      (body.offsetId !== undefined &&
        !(Number.isInteger(body.offsetId) && body.offsetId >= 0)) ||
      typeof account.sharedMedia !== 'function'
    ) {
      return [400, { error: 'chat and kind required', code: 'bad-request' }];
    }
    return [
      200,
      await account.sharedMedia({
        chat: body.chat,
        kind: body.kind,
        offsetId: body.offsetId ?? 0,
      }),
    ];
  },
  // Search across Telegram (R-Y107).
  'search-peers': async (account, body) =>
    globalQuery(body, account.searchPeers)
      ? [200, await account.searchPeers({ q: body.q })]
      : [400, { error: 'q required', code: 'bad-request' }],
  'search-global': async (account, body) =>
    globalQuery(body, account.searchGlobal) &&
    (body.cursor === undefined || typeof body.cursor === 'string')
      ? [
          200,
          await account.searchGlobal({
            q: body.q,
            cursor: body.cursor ?? null,
          }),
        ]
      : [400, { error: 'q required', code: 'bad-request' }],
  // Clear, delete or leave a chat (R-Y100).
  'remove-chat': async (account, body) => {
    if (
      !validChat(body.chat) ||
      !removalAllowed(body.chat, body.action) ||
      typeof account.removeChat !== 'function'
    ) {
      return [400, { error: 'chat and action required', code: 'bad-request' }];
    }
    return [
      200,
      await account.removeChat({
        chat: body.chat,
        action: body.action,
        revoke: body.revoke === true,
      }),
    ];
  },
  // Files and photos uploaded before (R-Y99).
  'send-files': async (account, body) => {
    const tokens = body.tokens;
    const replyTo = Number(body.replyTo);
    if (!validFiles(body) || typeof account.sendFiles !== 'function') {
      return [
        400,
        { error: 'chat and tokens[] required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.sendFiles({
        chat: body.chat,
        tokens,
        caption: body.caption ?? '',
        asPhoto: body.asPhoto !== false,
        group: body.group !== false,
        replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
        // A message effect, for a private chat (R-Y161).
        ...(body.effect === undefined ? {} : { effect: body.effect }),
        ...whenOf(body),
      }),
    ];
  },
  // A voice message recorded in the page (R-Y108).
  'send-voice': async (account, body) => {
    const replyTo = Number(body.replyTo);
    if (!validVoice(body) || typeof account.sendVoice !== 'function') {
      return [
        400,
        { error: 'chat, token and duration required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.sendVoice({
        chat: body.chat,
        token: body.token,
        duration: body.duration,
        waveform: body.waveform ?? [],
        replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
        ...whenOf(body),
      }),
    ];
  },
  // A bot's button under its message pressed (R-Y110): its data, base64
  // (Telegram allows 64 bytes), or a game's.
  'bot-callback': async (account, body) => {
    const data = body.data ?? null;
    if (
      !body.chat ||
      !validIds([body.id]) ||
      (data !== null && !BOT_DATA.test(String(data))) ||
      (data === null && body.game !== true) ||
      typeof account.botCallback !== 'function'
    ) {
      return [
        400,
        { error: 'chat, id and data required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.botCallback({
        chat: body.chat,
        id: body.id,
        data,
        game: body.game === true,
      }),
    ];
  },
  // Stickers and saved GIFs (R-Y105): the panel's lists, a set's
  // stickers, one sent as it is.
  stickers: async (account, body) =>
    typeof account.stickerPanel === 'function'
      ? [200, await account.stickerPanel({ fresh: body.fresh === true })]
      : [200, { ok: false, supported: false }],
  'sticker-set': async (account, body) =>
    SET_ID.test(String(body.id ?? '')) &&
    typeof account.stickerSet === 'function'
      ? [200, await account.stickerSet({ id: String(body.id) })]
      : [400, { error: 'id required', code: 'bad-request' }],
  // The words emoji are found by, in a language (R-Y117).
  'emoji-keywords': async (account, body) =>
    LANG.test(String(body.lang ?? '')) &&
    typeof account.emojiKeywords === 'function'
      ? [200, await account.emojiKeywords({ lang: body.lang })]
      : [400, { error: 'lang required', code: 'bad-request' }],
  // Stickers and GIFs searched (R-Y112).
  'sticker-search': async (account, body) =>
    searchWords(body.q) &&
    (body.lang === undefined || LANG.test(String(body.lang))) &&
    typeof account.stickerSearch === 'function'
      ? [
          200,
          await account.stickerSearch({
            q: body.q.trim(),
            lang: body.lang ?? 'en',
          }),
        ]
      : [400, { error: 'words required', code: 'bad-request' }],
  // The panel's menu (R-Y115): favourites, recent stickers, saved GIFs.
  'sticker-save': async (account, body) =>
    STICKER_ID.test(String(body.id ?? '')) &&
    STICKER_SAVES.includes(body.action) &&
    typeof account.stickerSave === 'function'
      ? [
          200,
          await account.stickerSave({
            id: String(body.id),
            action: body.action,
          }),
        ]
      : [400, { error: 'id and action required', code: 'bad-request' }],
  // A found sticker set added to the user's, or removed (R-Y116).
  'sticker-set-install': async (account, body) =>
    SET_ID.test(String(body.id ?? '')) &&
    typeof body.install === 'boolean' &&
    typeof account.stickerSetInstall === 'function'
      ? [
          200,
          await account.stickerSetInstall({
            id: String(body.id),
            install: body.install,
          }),
        ]
      : [400, { error: 'id and install required', code: 'bad-request' }],
  // Invite links (R-Y123).
  'invite-check': async (account, body) =>
    INVITE_HASH.test(String(body.hash ?? '')) &&
    typeof account.checkChatInvite === 'function'
      ? [200, await account.checkChatInvite({ hash: body.hash })]
      : [400, { error: 'hash required', code: 'bad-request' }],
  'invite-join': async (account, body) =>
    INVITE_HASH.test(String(body.hash ?? '')) &&
    typeof account.joinChatInvite === 'function'
      ? [200, await account.joinChatInvite({ hash: body.hash })]
      : [400, { error: 'hash required', code: 'bad-request' }],
  'invite-revoke': async (account, body) =>
    /^-\d{1,20}$/.test(String(body.chat ?? '')) &&
    typeof account.revokeChatInvite === 'function'
      ? [200, await account.revokeChatInvite({ chat: String(body.chat) })]
      : [400, { error: 'chat required', code: 'bad-request' }],
  // New groups and channels, a chat's info edited (R-Y129).
  'chat-contacts': async (account) =>
    typeof account.chatContacts === 'function'
      ? [200, await account.chatContacts()]
      : [400, { error: 'not available', code: 'bad-request' }],
  'group-create': async (account, body) =>
    typeof body.title === 'string' &&
    Array.isArray(body.users) &&
    body.users.every((u) => /^\d{1,20}$/.test(String(u))) &&
    typeof account.createGroup === 'function'
      ? [
          200,
          await account.createGroup({
            title: body.title,
            users: body.users.map(String),
          }),
        ]
      : [400, { error: 'title and users required', code: 'bad-request' }],
  'channel-create': async (account, body) =>
    typeof body.title === 'string' &&
    (body.about === undefined || typeof body.about === 'string') &&
    typeof account.createChannel === 'function'
      ? [
          200,
          await account.createChannel({ title: body.title, about: body.about }),
        ]
      : [400, { error: 'title required', code: 'bad-request' }],
  'chat-edit': async (account, body) =>
    /^-\d{1,20}$/.test(String(body.chat ?? '')) &&
    ['title', 'about', 'photo'].every(
      (k) => body[k] === undefined || typeof body[k] === 'string'
    ) &&
    ['title', 'about', 'photo'].some((k) => body[k] !== undefined) &&
    typeof account.editChatInfo === 'function'
      ? [
          200,
          await account.editChatInfo({
            chat: body.chat,
            title: body.title,
            about: body.about,
            photo: body.photo,
          }),
        ]
      : [400, { error: 'chat and a change required', code: 'bad-request' }],
  ...ADMIN_POSTS,
  ...COMMON_CHATS_POSTS,
  ...PINNED_ORDER_POSTS,
  ...TOPIC_ADMIN_POSTS,
  ...CHAT_REACTIONS_POSTS,
  ...INVITE_LINKS_POSTS,
  ...STORY_POST_POSTS,
  ...WALLPAPER_POSTS,
  ...NOTIFY_SETTINGS_POSTS,
  ...CALLS_POSTS,
  ...EFFECTS_POSTS,
  ...EMOJI_STATUS_POSTS,
  ...ROUND_POSTS,
  ...PRIVACY_POSTS,
  ...SHARE_POSTS,
  ...INLINE_POSTS,
  ...TTL_POSTS,
  ...SAVED_TAGS_POSTS,
  ...SEND_AS_POSTS,
  ...MESSAGE_LINK_POSTS,
  ...STORIES_POSTS,
  ...STORY_ACTION_POSTS,
  ...LINK_PREVIEW_POSTS,
  // The user's own profile (R-Y136).
  profile: profileRoute(
    'myProfile',
    () => true,
    () => ({}),
    'no profile'
  ),
  'profile-save': profileRoute(
    'saveProfile',
    validProfile,
    (b) => ({ firstName: b.firstName, lastName: b.lastName, about: b.about }),
    'a valid name or bio required'
  ),
  'username-check': profileRoute(
    'checkUsername',
    validUsername,
    (b) => ({ username: b.username }),
    'username required'
  ),
  'username-save': profileRoute(
    'saveUsername',
    validUsername,
    (b) => ({ username: b.username }),
    'username required'
  ),
  'profile-photo': async (account, body) => {
    if (!validPhoto(body)) {
      return [400, { error: 'token or remove required', code: 'bad-request' }];
    }
    const method = body.remove ? 'removeProfilePhoto' : 'setProfilePhoto';
    return typeof account[method] === 'function'
      ? [200, await account[method]({ token: body.token })]
      : [400, { error: 'not supported', code: 'bad-request' }];
  },
  // A group's members and removing one (R-Y125).
  members: async (account, body) =>
    GROUP_CHAT.test(String(body.chat ?? '')) &&
    validMembersPage(body) &&
    typeof account.chatMembers === 'function'
      ? [
          200,
          await account.chatMembers({
            chat: body.chat,
            q: body.q ?? '',
            offset: body.offset ?? 0,
            limit: body.limit ?? 50,
          }),
        ]
      : [400, { error: 'chat required', code: 'bad-request' }],
  'member-remove': async (account, body) =>
    GROUP_CHAT.test(String(body.chat ?? '')) &&
    /^\d{1,20}$/.test(String(body.user ?? '')) &&
    typeof account.removeMember === 'function'
      ? [
          200,
          await account.removeMember({
            chat: body.chat,
            user: String(body.user),
          }),
        ]
      : [400, { error: 'chat and user required', code: 'bad-request' }],
  // A die's animations (R-Y130).
  dice: async (account, body) =>
    DICE.includes(body.emoticon) && typeof account.stickerDice === 'function'
      ? [200, await account.stickerDice({ emoticon: body.emoticon })]
      : [400, { error: 'a die emoji required', code: 'bad-request' }],
  // Block, contacts and report (R-Y128); the account checks each request.
  'peer-block': (account, body) => peerAction(account, 'peerBlock', body),
  'peer-contact': (account, body) => peerAction(account, 'peerContact', body),
  'peer-report': (account, body) => peerAction(account, 'peerReport', body),
  'peer-report-spam': (account, body) =>
    peerAction(account, 'peerReportSpam', body),
  'peer-settings': (account, body) => peerAction(account, 'peerSettings', body),
  'peer-hide-bar': (account, body) => peerAction(account, 'peerHideBar', body),
  'peer-share-contact': (account, body) =>
    peerAction(account, 'peerShareContact', body),
  // The set of a sticker in a chat, for its box (R-Y124).
  'sticker-set-box': async (account, body) =>
    validSetBox(body) && typeof account.stickerSetBox === 'function'
      ? [
          200,
          await account.stickerSetBox(
            numeric(body.id)
              ? { id: body.id, accessHash: body.accessHash }
              : { shortName: String(body.shortName) }
          ),
        ]
      : [400, { error: 'id and accessHash required', code: 'bad-request' }],
  'gif-search': async (account, body) =>
    searchWords(body.q) &&
    (body.offset === undefined ||
      (typeof body.offset === 'string' && body.offset.length <= 64)) &&
    typeof account.gifSearch === 'function'
      ? [
          200,
          await account.gifSearch({
            q: body.q.trim(),
            offset: body.offset ?? '',
          }),
        ]
      : [400, { error: 'words required', code: 'bad-request' }],
  gifs: async (account, body) =>
    typeof account.savedGifs === 'function'
      ? [200, await account.savedGifs({ fresh: body.fresh === true })]
      : [200, { ok: false, supported: false }],
  'send-document': async (account, body) => {
    const replyTo = Number(body.replyTo);
    if (!validDocument(body) || typeof account.sendDocument !== 'function') {
      return [400, { error: 'chat and id required', code: 'bad-request' }];
    }
    return [
      200,
      await account.sendDocument({
        chat: body.chat,
        id: String(body.id),
        replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
        clientId: typeof body.clientId === 'string' ? body.clientId : null,
        ...whenOf(body),
      }),
    ];
  },
  // Telegram's chat folders (R-Y103).
  folders: async (account, body) =>
    typeof account.folderList === 'function'
      ? [200, await account.folderList({ fresh: body.fresh === true })]
      : [200, { ok: false, supported: false }],
  // A chat's scheduled messages (R-Y102): listed, sent now, deleted,
  // moved to another time.
  scheduled: async (account, body) =>
    validChat(body.chat) && typeof account.scheduledList === 'function'
      ? [200, await account.scheduledList({ chat: body.chat })]
      : [400, { error: 'chat required', code: 'bad-request' }],
  'scheduled-send': async (account, body) =>
    scheduledChange(account.scheduledSendNow, body),
  'scheduled-delete': async (account, body) =>
    scheduledChange(account.scheduledDelete, body),
  'scheduled-reschedule': async (account, body) => {
    const id = Number(body.id);
    if (
      !validChat(body.chat) ||
      !(Number.isInteger(id) && id > 0) ||
      !validSchedule(body.date) ||
      typeof account.scheduledReschedule !== 'function'
    ) {
      return [
        400,
        { error: 'chat, id and date required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.scheduledReschedule({
        chat: body.chat,
        id,
        date: body.date,
      }),
    ];
  },
  // Delete messages; revoke deletes them for everyone too.
  delete: async (account, body) => {
    if (
      !body.chat ||
      !validIds(body.ids) ||
      typeof account.deleteMessages !== 'function'
    ) {
      return [400, { error: 'chat and ids[] required', code: 'bad-request' }];
    }
    return [
      200,
      await account.deleteMessages({
        chat: body.chat,
        ids: body.ids,
        revoke: Boolean(body.revoke),
      }),
    ];
  },
};

// Polls and checklists (R-Y74): each acts on one message.
const B64 = /^[A-Za-z0-9+/]{1,64}={0,2}$/;
const validOptions = (options, { empty = false } = {}) =>
  Array.isArray(options) &&
  (empty || options.length > 0) &&
  options.length <= 20 &&
  options.every((o) => typeof o === 'string' && B64.test(o));
const smallIds = (ids) =>
  Array.isArray(ids) &&
  ids.length <= 100 &&
  ids.every((id) => Number.isInteger(id) && id > 0);

// [account method, whether the body's extra fields are valid, the fields]
const POLL_POSTS = {
  // No options retracts the vote.
  'poll-vote': [
    'votePoll',
    (b) => validOptions(b.options, { empty: true }),
    (b) => ({ options: b.options }),
  ],
  'poll-stop': ['stopPoll', () => true, () => ({})],
  'poll-results': ['pollResults', () => true, () => ({})],
  'poll-votes': [
    'pollVotes',
    (b) =>
      (b.option === undefined || validOptions([b.option])) &&
      (b.offset === undefined || typeof b.offset === 'string'),
    (b) => ({ option: b.option, offset: b.offset, limit: b.limit }),
  ],
  'todo-toggle': [
    'toggleTodo',
    (b) =>
      smallIds(b.completed ?? []) &&
      smallIds(b.incompleted ?? []) &&
      (b.completed?.length ?? 0) + (b.incompleted?.length ?? 0) > 0,
    (b) => ({ completed: b.completed ?? [], incompleted: b.incompleted ?? [] }),
  ],
};
for (const [name, [method, valid, fields]] of Object.entries(POLL_POSTS)) {
  POSTS[name] = async (account, body) => {
    if (
      !body.chat ||
      !validIds([body.id]) ||
      !valid(body) ||
      typeof account[method] !== 'function'
    ) {
      return [
        400,
        { error: 'chat, id and fields required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account[method]({ chat: body.chat, id: body.id, ...fields(body) }),
    ];
  };
}

// A new poll (R-Y121): strict limits, as Telegram's.
const POLL_LIMITS = { question: 255, option: 100, solution: 200 };
const textOf = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const validOptionList = (options) =>
  Array.isArray(options) &&
  options.length >= 2 &&
  options.length <= 10 &&
  options.every((o) => textOf(o, POLL_LIMITS.option));
// A quiz names its one right answer (and may explain it); it takes no
// multiple answers. Anything else names none.
const validQuiz = (b) =>
  !(b.quiz && b.multiple) &&
  (b.quiz
    ? Number.isInteger(b.correct) &&
      b.correct >= 0 &&
      b.correct < b.options.length
    : b.correct === undefined && b.solution === undefined) &&
  (b.solution === undefined ||
    (typeof b.solution === 'string' &&
      b.solution.length <= POLL_LIMITS.solution));
const validPoll = (b) =>
  validChat(b.chat) &&
  textOf(b.question, POLL_LIMITS.question) &&
  validOptionList(b.options) &&
  ['anonymous', 'multiple', 'quiz'].every((k) => typeof b[k] === 'boolean') &&
  validQuiz(b) &&
  validSendAs(b.sendAs) &&
  (b.silent === undefined || typeof b.silent === 'boolean') &&
  (b.scheduleDate === undefined || validSchedule(b.scheduleDate));
POSTS['send-poll'] = async (account, body) => {
  if (!validPoll(body) || typeof account.sendPoll !== 'function') {
    return [400, { error: 'a valid poll required', code: 'bad-request' }];
  }
  const replyTo = Number(body.replyTo);
  return [
    200,
    await account.sendPoll({
      chat: body.chat,
      question: body.question.trim(),
      options: body.options.map((o) => o.trim()),
      anonymous: body.anonymous,
      multiple: body.multiple,
      quiz: body.quiz,
      ...(body.quiz ? { correct: body.correct } : {}),
      ...(body.solution?.trim() ? { solution: body.solution.trim() } : {}),
      replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
      clientId: typeof body.clientId === 'string' ? body.clientId : null,
      ...whenOf(body),
    }),
  ];
};

const ALL_GETS = { ...GETS, ...WALLPAPER_GETS };

const dispatch = async (account, req, res, p, ctx) => {
  if (p === `${PREFIX}status` && req.method === 'GET') {
    const status = await account.status();
    // Connected but never synced (a key pasted by hand, a restart before
    // the first poll): start the first sync now; the UI polls the status.
    if (status.auto && !status.at && !status.syncing) {
      account.sync({ full: true, reason: 'status' }).catch(() => {});
      return json(res, 200, { ...status, syncing: true }) ?? true;
    }
    return json(res, 200, status) ?? true;
  }
  const name = p.slice(PREFIX.length);
  if (req.method === 'GET' && Object.hasOwn(ALL_GETS, name)) {
    return ALL_GETS[name](account, req, res, ctx);
  }
  if (req.method !== 'POST' || !Object.hasOwn(POSTS, name)) {
    return false;
  }
  const body = await readBody(req).catch(() => ({}));
  const [status, answer] = await POSTS[name](account, body);
  return json(res, status, answer) ?? true;
};

// POST /api/telegram/upload?name= with the file's bytes (R-Y99). Not
// JSON, so not isTrustedMutation's check: its own — the bytes' type is
// not one a form on another site can send without asking first (CORS),
// and another site's page is refused.
const handleUpload = async (account, req, res, ctx) => {
  const type = String(req.headers['content-type'] ?? '').toLowerCase();
  if (
    !type.startsWith('application/octet-stream') ||
    classifyOrigin(req, ctx.allowOrigins) === 'denied'
  ) {
    return (
      json(res, 403, { error: 'files are sent from the app only' }) ?? true
    );
  }
  if (typeof account.receiveUpload !== 'function') {
    return json(res, 501, { error: 'sending files not available' }) ?? true;
  }
  if (Number(req.headers['content-length']) > MAX_UPLOAD) {
    return (
      json(res, 413, { error: 'file too large', code: 'too-large' }) ?? true
    );
  }
  const name = new URL(req.url, 'http://local').searchParams.get('name');
  try {
    return json(res, 200, await account.receiveUpload(req, { name })) ?? true;
  } catch (error) {
    const large = error.code === 'too-large';
    return (
      json(res, large ? 413 : 400, {
        error: large ? 'file too large' : 'upload failed',
        code: large ? 'too-large' : 'upload-failed',
      }) ?? true
    );
  }
};

export const handleTelegramRoutes = async (req, res, p, ctx) => {
  if (!p.startsWith(PREFIX)) {
    return false;
  }
  const account = ctx.telegramAccount;
  if (!account) {
    return p === `${PREFIX}status` ? (json(res, 200, NONE) ?? true) : false;
  }
  if (req.method === 'POST' && p === `${PREFIX}upload`) {
    return handleUpload(account, req, res, ctx);
  }
  if (req.method === 'POST' && !isTrustedMutation(req, ctx.allowOrigins)) {
    return (
      json(res, 403, {
        error: 'telegram sync must be started from the meta-sovereign app',
      }) ?? true
    );
  }
  try {
    return await dispatch(account, req, res, p, ctx);
  } catch (error) {
    ctx.log?.({
      level: 'error',
      event: 'telegram_route_failed',
      path: p,
      error: error.message,
    });
    return (
      json(res, 502, {
        error: error.message,
        code: error.code,
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      }) ?? true
    );
  }
};
