/**
 * A group's or channel's invite links and join requests, as Telegram
 * Desktop's "Manage" screens have them (R-Y152; learned, never copied):
 * - `inviteLinks({ chat, revoked?, offsetDate?, offsetLink? })` — the
 *   user's own links (messages.getExportedChatInvites, adminId = self),
 *   or the revoked ones → `{ ok, primary, links, count, next }`;
 * - `inviteCreate({ chat, title?, expireDate?, usageLimit?, requestNeeded? })`
 *   — a new link (messages.exportChatInvite) → `{ ok, invite }`;
 * - `inviteEdit({ chat, link, revoked?, title?, expireDate?, usageLimit?,
 *   requestNeeded? })` — a link changed or revoked
 *   (messages.editExportedChatInvite) → `{ ok, invite, replacement? }`;
 * - `inviteDelete({ chat, link })` / `inviteDeleteRevoked({ chat })` — one
 *   revoked link, or all of them, deleted;
 * - `inviteImporters({ chat, link?, requested?, offset? })` — who joined
 *   through a link, or who asks to join (messages.getChatInviteImporters)
 *   → `{ ok, importers, count, next }`;
 * - `joinRequestHide({ chat, user, accessHash?, approved })` and
 *   `joinRequestsHideAll({ chat, approved, link? })` — requests approved
 *   or dismissed (messages.hideChatJoinRequest, hideAllChatJoinRequests).
 * Expire dates sent are unix seconds; dates read are milliseconds.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const INVITE_LINK =
  /^(?:https:\/\/)?t\.me\/(?:\+[A-Za-z0-9_-]{8,64}|joinchat\/[A-Za-z0-9_-]{8,64})$/;
export const TITLE_MAX = 32;
export const LIMIT_MAX = 99999;
const CHAT = /^-\d{1,20}$/;
const USER = /^\d{1,20}$/;
const PAGE = 50;
const TEN_YEARS = 10 * 365 * 86400;

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_ADMIN_INVITE_REQUIRED: 'not-admin',
  USER_NOT_PARTICIPANT: 'not-admin',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  INVITE_HASH_EXPIRED: 'link-gone',
  INVITE_HASH_INVALID: 'link-gone',
  INVITE_REVOKED_MISSING: 'link-gone',
  INVITE_EXPIRE_DATE_INVALID: 'expire-invalid',
  USAGE_LIMIT_INVALID: 'usage-invalid',
  HIDE_REQUESTER_MISSING: 'request-gone',
  USER_ID_INVALID: 'request-gone',
  ADMIN_INVITES_TOO_MUCH: 'too-many',
  INVITES_TOO_MUCH: 'too-many',
};

const failure = failureOf(CODES);
const bad = { ok: false, error: 'bad-request', code: 'bad-request' };

const textOf = (value) => String(value?.value ?? value);
const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';
const secondsOf = (ms) => Math.floor(Number(ms) / 1000);

/** An ExportedChatInvite as the page reads it (dates in ms). */
export const shapeInvite = (invite = {}) => ({
  link: invite.link ?? '',
  title: invite.title ?? '',
  revoked: Boolean(invite.revoked),
  permanent: Boolean(invite.permanent),
  requestNeeded: Boolean(invite.requestNeeded),
  date: Number(invite.date ?? 0) * 1000,
  expireDate: Number(invite.expireDate ?? 0) * 1000,
  usageLimit: Number(invite.usageLimit ?? 0),
  usage: Number(invite.usage ?? 0),
  requested: Number(invite.requested ?? 0),
});

export const validLink = (link) => INVITE_LINK.test(String(link ?? ''));
const validTitle = (title) =>
  title === undefined ||
  (typeof title === 'string' && Array.from(title).length <= TITLE_MAX);
const validExpire = (date, now) =>
  date === undefined ||
  date === 0 ||
  (Number.isInteger(date) && date > now && date < now + TEN_YEARS);
const validLimit = (limit) =>
  limit === undefined ||
  (Number.isInteger(limit) && limit >= 0 && limit <= LIMIT_MAX);

/** Whether `body` holds well-formed link settings (expire date in seconds). */
export const validSettings = (body, now = Math.floor(Date.now() / 1000)) =>
  validTitle(body.title) &&
  validExpire(body.expireDate, now) &&
  validLimit(body.usageLimit) &&
  (body.requestNeeded === undefined ||
    typeof body.requestNeeded === 'boolean') &&
  !(body.requestNeeded === true && body.usageLimit > 0);

// The settings Telegram's calls take; `keepZero` sends explicit zeros so an
// edit can clear what a link had.
const settingsOf = (body, keepZero) => ({
  ...(body.title === undefined ? {} : { title: body.title }),
  ...(body.expireDate === undefined || (!keepZero && !body.expireDate)
    ? {}
    : { expireDate: body.expireDate }),
  ...(body.usageLimit === undefined || (!keepZero && !body.usageLimit)
    ? {}
    : { usageLimit: body.usageLimit }),
});

const createList =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const { offsetLink } = body;
    if (
      !CHAT.test(chat) ||
      (offsetLink !== undefined && !validLink(offsetLink)) ||
      (body.offsetDate !== undefined && !Number.isInteger(body.offsetDate))
    ) {
      return bad;
    }
    const revoked = body.revoked === true;
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `links:list:${chat}:${revoked}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.GetExportedChatInvites({
              peer,
              adminId: new c.Api.InputUserSelf(),
              limit: PAGE,
              ...(revoked ? { revoked: true } : {}),
              ...(offsetLink
                ? {
                    offsetDate: secondsOf(body.offsetDate ?? 0),
                    offsetLink,
                  }
                : {}),
            })
          )
        )
      );
      const all = (answer?.invites ?? []).map(shapeInvite);
      const primary = revoked ? null : all.find((i) => i.permanent);
      const last = all.at(-1);
      return {
        ok: true,
        primary: primary?.link ?? null,
        links: all.filter((i) => i !== primary),
        count: Number(answer?.count ?? all.length),
        next:
          all.length >= PAGE && last
            ? { offsetDate: last.date, offsetLink: last.link }
            : null,
      };
    });
  };

const inviteOf = (answer) =>
  answer?.newInvite
    ? {
        invite: shapeInvite(answer.invite),
        replacement: shapeInvite(answer.newInvite),
      }
    : { invite: shapeInvite(answer?.invite ?? answer) };

// One call on the chat's peer, run in its own queue slot.
const onPeer = (env, c, key, chat, make) =>
  runIn(env, key, () =>
    env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(make(peer))
    )
  );

const createCreate =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHAT.test(chat) || !validSettings(body)) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await onPeer(
        env,
        c,
        `links:create:${chat}`,
        chat,
        (peer) =>
          new c.Api.messages.ExportChatInvite({
            peer,
            ...settingsOf(body, false),
            ...(body.requestNeeded ? { requestNeeded: true } : {}),
          })
      );
      return { ok: true, ...inviteOf(answer) };
    });
  };

const createEdit =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (
      !CHAT.test(chat) ||
      !validLink(body.link) ||
      !validSettings(body) ||
      (body.revoked !== undefined && body.revoked !== true)
    ) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await onPeer(
        env,
        c,
        `links:edit:${chat}`,
        chat,
        (peer) =>
          new c.Api.messages.EditExportedChatInvite({
            peer,
            link: body.link,
            ...(body.revoked ? { revoked: true } : settingsOf(body, true)),
            ...(!body.revoked && body.requestNeeded !== undefined
              ? { requestNeeded: body.requestNeeded }
              : {}),
          })
      );
      return { ok: true, ...inviteOf(answer) };
    });
  };

const createDelete =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHAT.test(chat) || !validLink(body.link)) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      await onPeer(
        env,
        c,
        `links:delete:${chat}`,
        chat,
        (peer) =>
          new c.Api.messages.DeleteExportedChatInvite({
            peer,
            link: body.link,
          })
      );
      return { ok: true };
    });
  };

const createDeleteRevoked =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHAT.test(chat)) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      await onPeer(
        env,
        c,
        `links:delete-revoked:${chat}`,
        chat,
        (peer) =>
          new c.Api.messages.DeleteRevokedExportedChatInvites({
            peer,
            adminId: new c.Api.InputUserSelf(),
          })
      );
      return { ok: true };
    });
  };

export const validOffset = (offset) =>
  offset === undefined ||
  (Number.isInteger(offset?.date) &&
    USER.test(String(offset.user ?? '')) &&
    (offset.accessHash === undefined || USER.test(String(offset.accessHash))));

// A person as an input user: by the hash the list gave, else as known.
const inputUser = async (c, id, accessHash) =>
  accessHash === undefined
    ? c.client.getInputEntity(c.helpers.returnBigInt(id))
    : new c.Api.InputUser({
        userId: c.helpers.returnBigInt(id),
        accessHash: c.helpers.returnBigInt(String(accessHash)),
      });

const importerOf = (importer, users) => {
  const id = textOf(importer.userId);
  const user = users.get(id);
  return {
    id,
    ...(user?.accessHash === undefined
      ? {}
      : { accessHash: textOf(user.accessHash) }),
    name: nameOf(user) || id,
    ...(user?.username ? { username: user.username } : {}),
    date: Number(importer.date) * 1000,
    ...(importer.about ? { about: importer.about } : {}),
    requested: Boolean(importer.requested),
  };
};

const createImporters =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (
      !CHAT.test(chat) ||
      (body.link !== undefined && !validLink(body.link)) ||
      (body.requested !== undefined && typeof body.requested !== 'boolean') ||
      !validOffset(body.offset) ||
      (body.link === undefined && body.requested !== true)
    ) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      const { offset } = body;
      const offsetUser = offset
        ? await inputUser(c, String(offset.user), offset.accessHash)
        : new c.Api.InputUserEmpty();
      const answer = await onPeer(
        env,
        c,
        `links:importers:${chat}`,
        chat,
        (peer) =>
          new c.Api.messages.GetChatInviteImporters({
            peer,
            offsetDate: offset ? secondsOf(offset.date) : 0,
            offsetUser,
            limit: PAGE,
            ...(body.link ? { link: body.link } : {}),
            ...(body.requested ? { requested: true } : {}),
          })
      );
      const users = new Map(
        (answer?.users ?? []).map((u) => [textOf(u.id), u])
      );
      const importers = (answer?.importers ?? []).map((i) =>
        importerOf(i, users)
      );
      const last = importers.at(-1);
      return {
        ok: true,
        importers,
        count: Number(answer?.count ?? importers.length),
        next:
          importers.length >= PAGE && last
            ? {
                date: last.date,
                user: last.id,
                ...(last.accessHash === undefined
                  ? {}
                  : { accessHash: last.accessHash }),
              }
            : null,
      };
    });
  };

const createHide =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const user = String(body.user ?? '');
    if (
      !CHAT.test(chat) ||
      !USER.test(user) ||
      typeof body.approved !== 'boolean' ||
      (body.accessHash !== undefined && !USER.test(String(body.accessHash)))
    ) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      const userId = await inputUser(c, user, body.accessHash);
      await onPeer(
        env,
        c,
        `links:hide:${chat}:${user}`,
        chat,
        (peer) =>
          new c.Api.messages.HideChatJoinRequest({
            peer,
            userId,
            ...(body.approved ? { approved: true } : {}),
          })
      );
      return { ok: true };
    });
  };

const createHideAll =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (
      !CHAT.test(chat) ||
      typeof body.approved !== 'boolean' ||
      (body.link !== undefined && !validLink(body.link))
    ) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      await onPeer(
        env,
        c,
        `links:hide-all:${chat}`,
        chat,
        (peer) =>
          new c.Api.messages.HideAllChatJoinRequests({
            peer,
            ...(body.approved ? { approved: true } : {}),
            ...(body.link ? { link: body.link } : {}),
          })
      );
      return { ok: true };
    });
  };

export const createInviteLinks = (env, context) => ({
  inviteLinks: createList(env, context.userClient),
  inviteCreate: createCreate(env, context.userClient),
  inviteEdit: createEdit(env, context.userClient),
  inviteDelete: createDelete(env, context.userClient),
  inviteDeleteRevoked: createDeleteRevoked(env, context.userClient),
  inviteImporters: createImporters(env, context.userClient),
  joinRequestHide: createHide(env, context.userClient),
  joinRequestsHideAll: createHideAll(env, context.userClient),
});
