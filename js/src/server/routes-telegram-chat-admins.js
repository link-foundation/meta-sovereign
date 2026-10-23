// Adding members and managing administrators (R-Y204): the routes of the
// POSTS table in routes-telegram.js, each validated strictly before the
// account is asked.
//
// Its routes:
//   POST /api/telegram/chat-add-candidates {chat} -> { ok, people } the
//                       contacts and most-written-to people to pick from
//   POST /api/telegram/members-add {chat, users} -> { ok, added, missing,
//                       failed } up to 200 distinct user ids; `missing` are
//                       those their privacy keeps from being added
//   POST /api/telegram/members-invite-link {chat, users} -> { ok, sent }
//                       the chat's primary invite link sent to those users
//   POST /api/telegram/chat-admins {chat} -> { ok, admins }
//   POST /api/telegram/admin-set {chat, user, rights?, rank?, dismiss?,
//                       broadcast?} -> { ok } rights: known boolean
//                       ChatAdminRights flags; rank up to 16 characters;
//                       a basic group takes neither (code needs-upgrade)
//   POST /api/telegram/history-hidden {chat, hidden} -> { ok, hidden }
//                       a supergroup's or channel's history for new members
//   POST /api/telegram/group-upgrade {chat} -> { ok, chat, title } a basic
//                       group converted to a supergroup (its new id)

import { validUsers } from '../sources/telegram-add-members.js';
import { adminRequest } from '../sources/telegram-admin-manage.js';

const CHAT = /^-\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];
const has = (account, name) => typeof account[name] === 'function';

// Only the known keys are passed on.
const adminBody = (b) => ({
  chat: b.chat,
  user: String(b.user),
  ...(b.rights === undefined ? {} : { rights: b.rights }),
  ...(b.rank === undefined ? {} : { rank: b.rank }),
  ...(b.dismiss === undefined ? {} : { dismiss: b.dismiss }),
  ...(b.broadcast === undefined ? {} : { broadcast: b.broadcast }),
});

const withChat =
  (name, extra = () => true, shape = (body) => body) =>
  async (account, body) =>
    CHAT.test(String(body.chat ?? '')) && extra(body) && has(account, name)
      ? [200, await account[name](shape(body))]
      : bad('chat required');

export const CHAT_ADMINS_POSTS = {
  'chat-add-candidates': withChat(
    'addCandidates',
    () => true,
    (b) => ({
      chat: b.chat,
    })
  ),
  'members-add': withChat(
    'addMembers',
    (b) => validUsers(b.users),
    (b) => ({
      chat: b.chat,
      users: b.users.map(String),
    })
  ),
  'members-invite-link': withChat(
    'sendInviteLink',
    (b) => validUsers(b.users),
    (b) => ({ chat: b.chat, users: b.users.map(String) })
  ),
  'chat-admins': withChat(
    'chatAdmins',
    () => true,
    (b) => ({ chat: b.chat })
  ),
  'admin-set': async (account, body) => {
    // A basic group asked for custom rights is answered, not refused: the
    // page then offers the upgrade.
    const asked = adminRequest(body);
    return (asked.ok || asked.code === 'needs-upgrade') &&
      has(account, 'setAdmin')
      ? [200, await account.setAdmin(adminBody(body))]
      : bad('chat, user and rights required');
  },
  'history-hidden': withChat(
    'setHistoryHidden',
    (b) => typeof b.hidden === 'boolean',
    (b) => ({ chat: b.chat, hidden: b.hidden })
  ),
  'group-upgrade': withChat(
    'upgradeGroup',
    (b) => !String(b.chat).startsWith('-100'),
    (b) => ({ chat: b.chat })
  ),
};
