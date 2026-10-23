// Shared folders, chat lists (R-Y172): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/chatlist-invites {id} -> { ok, invites, chats } the
//                       folder's links `{ slug, title, url, chats }`
//   POST /api/telegram/chatlist-export {id, title?, chats} -> { ok, invite }
//                       a link made for the chosen groups and channels
//   POST /api/telegram/chatlist-invite-edit {id, slug, title?, chats?}
//                       -> { ok, invite } a link renamed or its chats changed
//   POST /api/telegram/chatlist-invite-delete {id, slug} -> { ok }
//   POST /api/telegram/chatlist-check {slug} -> { ok, already, folderId?,
//                       title, emoticon, chats } what an addlist link leads
//                       to; nothing is joined
//   POST /api/telegram/chatlist-join {slug, chats} -> { ok } only on the
//                       user's press: the chosen chats joined
//   POST /api/telegram/chatlist-leave-suggestions {id} -> { ok, chats }
//   POST /api/telegram/chatlist-leave {id, chats} -> { ok } the shared
//                       folder left, with the chats named

import {
  SLUG,
  validChats,
  validFolderId,
  validLinkTitle,
} from '../sources/telegram-chatlists.js';

const bad = (error) => [400, { error, code: 'bad-request' }];
const answer = async (account, name, args) =>
  typeof account[name] === 'function'
    ? [200, await account[name](args)]
    : bad('not supported');

const slugOk = (slug) => typeof slug === 'string' && SLUG.test(slug);

// A route: `valid(body)` before `name` is asked with `pick(body)`.
const route = (name, valid, pick, what) => async (account, body) =>
  valid(body) ? answer(account, name, pick(body)) : bad(what);

const ofFolder = (b) => ({ id: b.id });

export const CHATLIST_POSTS = {
  'chatlist-invites': route(
    'chatlistInvites',
    (b) => validFolderId(b.id),
    ofFolder,
    'id required'
  ),
  'chatlist-export': route(
    'chatlistExport',
    (b) =>
      validFolderId(b.id) &&
      validLinkTitle(b.title) &&
      validChats(b.chats, { min: 1 }),
    (b) => ({ id: b.id, title: b.title, chats: b.chats }),
    'id and chats required'
  ),
  'chatlist-invite-edit': route(
    'chatlistInviteEdit',
    (b) =>
      validFolderId(b.id) &&
      slugOk(b.slug) &&
      validLinkTitle(b.title) &&
      (b.chats === undefined || validChats(b.chats, { min: 1 })) &&
      (b.title !== undefined || b.chats !== undefined),
    (b) => ({ id: b.id, slug: b.slug, title: b.title, chats: b.chats }),
    'id, slug and a change required'
  ),
  'chatlist-invite-delete': route(
    'chatlistInviteDelete',
    (b) => validFolderId(b.id) && slugOk(b.slug),
    (b) => ({ id: b.id, slug: b.slug }),
    'id and slug required'
  ),
  'chatlist-check': route(
    'chatlistCheck',
    (b) => slugOk(b.slug),
    (b) => ({ slug: b.slug }),
    'slug required'
  ),
  'chatlist-join': route(
    'chatlistJoin',
    (b) => slugOk(b.slug) && validChats(b.chats, { min: 1 }),
    (b) => ({ slug: b.slug, chats: b.chats }),
    'slug and chats required'
  ),
  'chatlist-leave-suggestions': route(
    'chatlistLeaveSuggestions',
    (b) => validFolderId(b.id),
    ofFolder,
    'id required'
  ),
  'chatlist-leave': route(
    'chatlistLeave',
    (b) => validFolderId(b.id) && validChats(b.chats),
    (b) => ({ id: b.id, chats: b.chats }),
    'id and chats required'
  ),
};
