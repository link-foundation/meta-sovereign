// Quick replies and the greeting and away messages of Telegram Business
// (R-Y179): the routes of the POSTS table in routes-telegram.js, each
// validated strictly before the account is asked. The source modules check
// the details again; a write is only ever the page's explicit Save.
//
// Its routes:
//   POST /api/telegram/quick-replies {} -> { ok, replies: [{ id, name,
//                       count, preview }] } the user's shortcuts
//   POST /api/telegram/quick-reply-messages {shortcutId} -> { ok, messages }
//   POST /api/telegram/quick-reply-create {name, text} -> { ok } a shortcut
//                       made by its first message
//   POST /api/telegram/quick-reply-add {shortcutId, text} -> { ok }
//   POST /api/telegram/quick-reply-edit {shortcutId, id, text} -> { ok }
//   POST /api/telegram/quick-reply-delete-messages {shortcutId, ids} ->
//                       { ok }
//   POST /api/telegram/quick-reply-rename {shortcutId, name} -> { ok }
//   POST /api/telegram/quick-reply-delete {shortcutId} -> { ok }
//   POST /api/telegram/quick-reply-reorder {order} -> { ok } shortcut ids
//   POST /api/telegram/quick-reply-send {chat, shortcutId} -> { ok, sent }
//                       the shortcut's messages sent to a person's chat
//   POST /api/telegram/business-messages {} -> { ok, greeting, away,
//                       shortcuts, people } what the account has set
//   POST /api/telegram/business-greeting-save {enabled, shortcutId,
//                       recipients, noActivityDays} -> { ok }
//   POST /api/telegram/business-away-save {enabled, shortcutId,
//                       recipients, offlineOnly, schedule} -> { ok }

const bad = [400, { error: 'bad request', code: 'bad-request' }];

// A route that passes the body to the account's action when `valid`.
const route = (action, valid) => async (account, body) =>
  typeof account[action] === 'function' && valid(body)
    ? [200, await account[action](body)]
    : bad;

const id = (v) => /^\d{1,10}$/.test(String(v ?? ''));
const text = (v) => typeof v === 'string' && v.length <= 20_000;
const name = (v) => typeof v === 'string' && v.length <= 200;
const list = (v) => Array.isArray(v) && v.length <= 100;
const person = (v) => /^\d{1,20}$/.test(String(v ?? ''));
const yes = () => true;

export const QUICK_REPLY_POSTS = {
  'quick-replies': route('quickReplies', yes),
  'quick-reply-messages': route('quickReplyMessages', (b) => id(b.shortcutId)),
  'quick-reply-create': route(
    'quickReplyCreate',
    (b) => name(b.name) && text(b.text)
  ),
  'quick-reply-add': route(
    'quickReplyAdd',
    (b) => id(b.shortcutId) && text(b.text)
  ),
  'quick-reply-edit': route(
    'quickReplyEdit',
    (b) => id(b.shortcutId) && id(b.id) && text(b.text)
  ),
  'quick-reply-delete-messages': route(
    'quickReplyDeleteMessages',
    (b) => id(b.shortcutId) && list(b.ids)
  ),
  'quick-reply-rename': route(
    'quickReplyRename',
    (b) => id(b.shortcutId) && name(b.name)
  ),
  'quick-reply-delete': route('quickReplyDelete', (b) => id(b.shortcutId)),
  'quick-reply-reorder': route('quickReplyReorder', (b) => list(b.order)),
  'quick-reply-send': route(
    'quickReplySend',
    (b) => person(b.chat) && id(b.shortcutId)
  ),
  'business-messages': route('businessMessages', yes),
  'business-greeting-save': route(
    'businessGreetingSave',
    (b) => typeof b.enabled === 'boolean'
  ),
  'business-away-save': route(
    'businessAwaySave',
    (b) => typeof b.enabled === 'boolean'
  ),
};
