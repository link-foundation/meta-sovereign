// A group's or channel's invite links and join requests (R-Y152): the
// routes of the POSTS table in routes-telegram.js, each validated
// strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/invite-links {chat, revoked?, offsetLink?,
//                  offsetDate?} -> { ok, primary, links, count, next }
//                                         the user's invite links (R-Y152)
//   POST /api/telegram/invite-create {chat, title?, expireDate?, usageLimit?,
//                  requestNeeded?} -> { ok, invite } (expireDate: unix s)
//   POST /api/telegram/invite-edit {chat, link, revoked?, title?, expireDate?,
//                  usageLimit?, requestNeeded?} -> { ok, invite }
//   POST /api/telegram/invite-delete {chat, link} -> { ok } a revoked link
//   POST /api/telegram/invite-delete-revoked {chat} -> { ok } all of them
//   POST /api/telegram/invite-importers {chat, link? | requested: true,
//                  offset?} -> { ok, importers, count, next } who joined
//                                         through a link, or who asks to join
//   POST /api/telegram/join-request-hide {chat, user, accessHash?, approved}
//                                      -> { ok } one request decided
//   POST /api/telegram/join-requests-hide-all {chat, approved, link?}
//                                      -> { ok } every request decided

import {
  validLink,
  validOffset,
  validSettings,
} from '../sources/telegram-invite-links.js';

const GROUP_CHAT = /^-\d{1,20}$/;
const USER = /^\d{1,20}$/;
const BAD = [400, { error: 'bad request', code: 'bad-request' }];

const chatOk = (body) => GROUP_CHAT.test(String(body.chat ?? ''));
const optional = (value, test) => value === undefined || test(value);
const isBool = (value) => typeof value === 'boolean';

// Runs `method` of the account on `args` when `ok`, else answers 400.
const route = (method, ok, args) => async (account, body) =>
  ok(body) && typeof account[method] === 'function'
    ? [200, await account[method](args(body))]
    : BAD;

// The link settings a body carries, as given.
const settings = (body) =>
  Object.fromEntries(
    ['title', 'expireDate', 'usageLimit', 'requestNeeded']
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]])
  );

export const INVITE_LINKS_POSTS = {
  'invite-links': route(
    'inviteLinks',
    (b) =>
      chatOk(b) &&
      optional(b.revoked, isBool) &&
      optional(b.offsetLink, validLink) &&
      optional(b.offsetDate, Number.isInteger),
    (b) => ({
      chat: b.chat,
      ...(b.revoked ? { revoked: true } : {}),
      ...(b.offsetLink === undefined
        ? {}
        : { offsetLink: b.offsetLink, offsetDate: b.offsetDate ?? 0 }),
    })
  ),
  'invite-create': route(
    'inviteCreate',
    (b) => chatOk(b) && validSettings(b),
    (b) => ({ chat: b.chat, ...settings(b) })
  ),
  'invite-edit': route(
    'inviteEdit',
    (b) =>
      chatOk(b) &&
      validLink(b.link) &&
      validSettings(b) &&
      optional(b.revoked, (v) => v === true),
    (b) => ({
      chat: b.chat,
      link: b.link,
      ...(b.revoked ? { revoked: true } : settings(b)),
    })
  ),
  'invite-delete': route(
    'inviteDelete',
    (b) => chatOk(b) && validLink(b.link),
    (b) => ({ chat: b.chat, link: b.link })
  ),
  'invite-delete-revoked': route('inviteDeleteRevoked', chatOk, (b) => ({
    chat: b.chat,
  })),
  'invite-importers': route(
    'inviteImporters',
    (b) =>
      chatOk(b) &&
      optional(b.link, validLink) &&
      optional(b.requested, isBool) &&
      (b.link !== undefined || b.requested === true) &&
      validOffset(b.offset),
    (b) => ({
      chat: b.chat,
      ...(b.link === undefined ? {} : { link: b.link }),
      ...(b.requested ? { requested: true } : {}),
      ...(b.offset === undefined ? {} : { offset: b.offset }),
    })
  ),
  'join-request-hide': route(
    'joinRequestHide',
    (b) =>
      chatOk(b) &&
      USER.test(String(b.user ?? '')) &&
      isBool(b.approved) &&
      optional(b.accessHash, (v) => USER.test(String(v))),
    (b) => ({
      chat: b.chat,
      user: String(b.user),
      approved: b.approved,
      ...(b.accessHash === undefined
        ? {}
        : { accessHash: String(b.accessHash) }),
    })
  ),
  'join-requests-hide-all': route(
    'joinRequestsHideAll',
    (b) => chatOk(b) && isBool(b.approved) && optional(b.link, validLink),
    (b) => ({
      chat: b.chat,
      approved: b.approved,
      ...(b.link === undefined ? {} : { link: b.link }),
    })
  ),
};
