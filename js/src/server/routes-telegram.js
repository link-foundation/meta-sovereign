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
 *   POST /api/telegram/forward {fromChat, ids, toChat}
 *                                      -> { ok, forwarded }
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
 *   POST /api/telegram/emoji-keywords {lang}
 *                                      -> { ok, lang, keywords } the words
 *                                         emoji are found by (R-Y117)
 *   POST /api/telegram/gif-search {q, offset?}
 *                                      -> { ok, gifs, next } GIFs found
 *                                         by Telegram's @gif bot
 *   POST /api/telegram/remove-chat {chat, action, revoke?}
 *                                      -> { ok, deleted } clear, delete
 *                                         or leave the chat (R-Y100)
 *   GET  /api/telegram/media?chat=&id=&size=
 *                                      -> a message's picture (s/m/x/y/w),
 *                                         downloaded once, then from disk
 *   GET  /api/telegram/custom-emoji?id=&full=1
 *                                      -> a custom emoji's picture, or
 *                                         (full) its animation or video
 *                                         (R-Y120)
 *   GET  /api/telegram/file?chat=&id=  -> a message's video, voice, audio,
 *                                         GIF or sticker (up to 64 MB), by
 *                                         byte range for players to seek
 *   GET  /api/telegram/avatar?peer=&size=s|b&chat=&msg=
 *                                      -> a person's or chat's photo; 404
 *                                         when they have none
 *   GET  /api/telegram/chat-info?chat= -> { kind, title, members, online,
 *                                         username, about, photo, lastSeen? }
 * Responses carry the account's public name and counts, never a secret.
 */

import { classifyOrigin } from './cors.js';
import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { DIALOG_ACTIONS } from '../sources/telegram-dialogs.js';
import { MAX_QUERY } from '../sources/telegram-search.js';
import { SHARED_KINDS } from '../sources/telegram-shared.js';
import { STICKER_SAVES } from '../sources/telegram-stickers.js';
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

const PREFIX = '/api/telegram/';

const NONE = { connected: false, kind: null, account: null };

// Only the page asks for what the user looks at; anything else waits.
const PRIORITIES = new Set(['view', 'list', 'prefetch']);
const priorityOf = (value) => (PRIORITIES.has(value) ? value : 'prefetch');

// Validate an array of positive integers (message ids).
const validIds = (ids) =>
  Array.isArray(ids) &&
  ids.length > 0 &&
  ids.length <= 100 &&
  ids.every((id) => Number.isInteger(id) && id > 0);

// A marked Telegram chat id, as a string.
const validChat = (chat) =>
  typeof chat === 'string' && /^-?\d{1,20}$/.test(chat);

// POST /api/telegram/<name>: [status, answer] for one request body.
// Without sound; at a time (R-Y102).
const whenOf = (body) => ({
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

// Files and photos to send (R-Y99), with when (R-Y102).
const validFiles = (body) =>
  validChat(body.chat) &&
  Array.isArray(body.tokens) &&
  body.tokens.length > 0 &&
  body.tokens.length <= MAX_FILES &&
  body.tokens.every((t) => typeof t === 'string' && /^[a-f0-9]{32}$/.test(t)) &&
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
  (body.waveform === undefined ||
    (Array.isArray(body.waveform) &&
      body.waveform.length <= WAVEFORM_SIZE &&
      body.waveform.every((v) => Number.isInteger(v) && v >= 0 && v <= 31))) &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate));

// A sticker or GIF to send (R-Y105).
const STICKER_ID = /^\d{1,20}$/;
const validDocument = (body) =>
  validChat(body.chat) &&
  STICKER_ID.test(String(body.id ?? '')) &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate));

const positive = (n) => Number.isInteger(n) && n > 0;

// A search across Telegram: a query of a sane length, and the account
// able to run it.
const globalQuery = (body, run) =>
  typeof body.q === 'string' &&
  body.q.trim().length > 0 &&
  body.q.length <= MAX_GLOBAL_QUERY &&
  typeof run === 'function';

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
    await account.markRead({ chat: body.chat, maxId: body.maxId }),
  ],
  draft: async (account, body) => {
    const text = typeof body.text === 'string' ? body.text : '';
    if (text.length > 20_000) {
      return [400, { error: 'draft too long', code: 'too-long' }];
    }
    return [200, await account.saveDraft({ chat: body.chat, text })];
  },
  history: async (account, body) => {
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
    STICKER_ID.test(String(body.id ?? '')) &&
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
    STICKER_ID.test(String(body.id ?? '')) &&
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

// Pictures are the user's own: only the app's pages may load them, so
// another site open in the browser can neither see them nor make
// Telegram download them. The server's own page: browsers say where an
// <img> load comes from. The app on its other origins (the hosted app,
// the mobile WebViews): it loads them as CORS requests
// (../web/media-src.js), whose Origin no other site can fake.
export const fromApp = (req, allowed = []) => {
  const site = req.headers['sec-fetch-site'];
  return (
    !site ||
    site === 'same-origin' ||
    site === 'none' ||
    classifyOrigin(req, allowed) === 'allowed'
  );
};

// A refused load, in the log once per route, site and origin (a page
// asks for hundreds of pictures): which page asked and how, never what.
const refusals = new Set();
const refuse = (req, res, ctx, route, error) => {
  const origin = req.headers.origin ?? null;
  const key = `${route}|${req.headers['sec-fetch-site']}|${origin}`;
  if (!refusals.has(key) && refusals.size < 100) {
    refusals.add(key);
    ctx?.log?.({
      level: 'warn',
      event: 'telegram_media_refused',
      route,
      site: req.headers['sec-fetch-site'] ?? null,
      mode: req.headers['sec-fetch-mode'] ?? null,
      origin,
      verdict: classifyOrigin(req, ctx?.allowOrigins ?? []),
    });
  }
  return json(res, 403, { error }) ?? true;
};

// GET /api/telegram/media?chat=&id=&size= -> the picture's bytes.
const handleMedia = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'media', 'pictures load only in the app');
  }
  if (typeof account.media !== 'function') {
    return json(res, 501, { error: 'media not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.media({
    chat: query.get('chat'),
    id: Number(query.get('id')),
    size: query.get('size') || 'm',
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    // A message's picture never changes; kept by this browser only.
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/sticker?id=|set=&full=1 -> a sticker's or GIF's
// picture, a set's, or (full) a video sticker's or GIF's video (R-Y105).
const handleSticker = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'sticker', 'stickers load only in the app');
  }
  if (typeof account.stickerPicture !== 'function') {
    return json(res, 501, { error: 'stickers not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.stickerPicture({
    id: query.get('id'),
    set: query.get('set'),
    full: query.get('full') === '1',
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'application/octet-stream',
    'content-length': result.buffer.length,
    // A sticker never changes; a set's picture may, so an hour.
    'cache-control': query.get('set')
      ? 'private, max-age=3600'
      : 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/custom-emoji?id=&full=1 -> a custom emoji's picture,
// or (full) its animation or video; the id only digits (R-Y120).
const handleCustomEmoji = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'custom-emoji', 'emoji load only in the app');
  }
  if (typeof account.customEmojiPicture !== 'function') {
    return json(res, 501, { error: 'custom emoji not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  if (!/^\d{1,20}$/.test(query.get('id') ?? '')) {
    return json(res, 400, { error: 'bad id' }) ?? true;
  }
  const result = await account.customEmojiPicture({
    id: query.get('id'),
    full: query.get('full') === '1',
  });
  if (!result?.buffer) {
    return json(res, 404, { error: 'no picture' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'application/octet-stream',
    'content-length': result.buffer.length,
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// `bytes=a-b` of a file of `size` bytes: [start, end], or null.
export const byteRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? '').trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? [start, end] : null;
};

// The bytes of a file, whole or the range the player asked for.
const sendBytes = (req, res, { buffer, mimeType }) => {
  const size = buffer.length;
  const head = {
    'content-type': mimeType || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  if (req.headers.range) {
    const range = byteRange(req.headers.range, size);
    if (!range) {
      res.writeHead(416, { ...head, 'content-range': `bytes */${size}` });
      res.end();
      return true;
    }
    const [start, end] = range;
    res.writeHead(206, {
      ...head,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    });
    res.end(buffer.subarray(start, end + 1));
    return true;
  }
  res.writeHead(200, { ...head, 'content-length': size });
  res.end(buffer);
  return true;
};

// GET /api/telegram/file?chat=&id= -> the message's file, by range.
const handleFile = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'file', 'files load only in the app');
  }
  if (typeof account.file !== 'function') {
    return json(res, 501, { error: 'files not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const result = await account.file({
    chat: query.get('chat'),
    id: Number(query.get('id')),
  });
  if (result?.error === 'too-large') {
    return json(res, 413, { error: 'too-large', size: result.size }) ?? true;
  }
  if (!result?.buffer) {
    return json(res, 404, { error: 'no file' }) ?? true;
  }
  return sendBytes(req, res, result);
};

// A photo not on disk yet is waited for this long, then asked again: a
// photo on disk answers in a few ms, and a longer wait held one of the
// browser's six connections for each photo still downloading (R-Y85).
const AVATAR_WAIT_MS = 250;
const LATER = Symbol('later');

// `promise`'s value, or LATER when it takes longer than `ms` (it goes
// on by itself).
const answerSoon = (promise, ms) => {
  let timer = null;
  const later = new Promise((resolve) => {
    timer = globalThis.setTimeout(() => resolve(LATER), ms);
  });
  return Promise.race([promise.catch(() => null), later]).finally(() =>
    globalThis.clearTimeout(timer)
  );
};

// GET /api/telegram/avatar?peer=&size= -> the peer's photo.
const handleAvatar = async (account, req, res, ctx) => {
  if (!fromApp(req, ctx?.allowOrigins)) {
    return refuse(req, res, ctx, 'avatar', 'pictures load only in the app');
  }
  if (typeof account.avatar !== 'function') {
    return json(res, 501, { error: 'avatars not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const reading = Promise.resolve().then(() =>
    account.avatar({
      peer: query.get('peer'),
      size: query.get('size') === 'b' ? 'b' : 's',
      chat: query.get('chat'),
      msg: query.get('msg'),
    })
  );
  const result = await answerSoon(reading, AVATAR_WAIT_MS);
  if (result === LATER) {
    // Still downloading: the browser's few connections are not held
    // for it (they would hold up the chat); the page asks again soon.
    res.setHeader('retry-after', '3');
    res.setHeader('cache-control', 'no-store');
    return json(res, 503, { error: 'loading' }) ?? true;
  }
  if (!result?.buffer) {
    // No photo: the page shows initials, and asks again tomorrow.
    res.setHeader('cache-control', 'private, max-age=3600');
    return json(res, 404, { error: 'no photo' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': result.mimeType || 'image/jpeg',
    'content-length': result.buffer.length,
    // A new photo shows within a day (the server re-reads it daily).
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
  res.end(result.buffer);
  return true;
};

// GET /api/telegram/chat-info?chat= -> members, online, last seen.
const handleChatInfo = async (account, req, res) => {
  if (typeof account.chatInfo !== 'function') {
    return json(res, 501, { error: 'chat info not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  const info = await account.chatInfo({ chat: query.get('chat') });
  return info
    ? (json(res, 200, info) ?? true)
    : (json(res, 404, { error: 'no chat info' }) ?? true);
};

// GET /api/telegram/unread-marks?chat=&kind=mentions|reactions -> ids.
const handleUnreadMarks = async (account, req, res) => {
  if (typeof account.unreadMarks !== 'function') {
    return json(res, 501, { error: 'unread marks not available' }) ?? true;
  }
  const query = new URL(req.url, 'http://local').searchParams;
  return (
    json(
      res,
      200,
      await account.unreadMarks({
        chat: query.get('chat'),
        kind: query.get('kind'),
      })
    ) ?? true
  );
};

const GETS = {
  media: handleMedia,
  sticker: handleSticker,
  'custom-emoji': handleCustomEmoji,
  file: handleFile,
  avatar: handleAvatar,
  'chat-info': handleChatInfo,
  'unread-marks': handleUnreadMarks,
};

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
  if (req.method === 'GET' && Object.hasOwn(GETS, name)) {
    return GETS[name](account, req, res, ctx);
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
