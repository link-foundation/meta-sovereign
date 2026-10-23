/**
 * Adding members to a group or channel, as Telegram Desktop does
 * (R-Y204; learned, never copied):
 * - `addCandidates({ chat })` — the people to pick from: contacts and the
 *   people written to most (contacts.getContacts, contacts.getTopPeers)
 *   → `{ ok, people: [{ id, name, username, contact }] }`;
 * - `addMembers({ chat, users })` — channels.inviteToChannel (a supergroup
 *   or channel) or messages.addChatUser (a basic group, one by one, fwd
 *   limit 100) → `{ ok, added: [id], missing: [{ id, name }], failed:
 *   [{ id, code }] }`; `missing` are those their privacy keeps from being
 *   added (layer 225's missing_invitees), to whom the page may offer the
 *   chat's invite link;
 * - `sendInviteLink({ chat, users })` — the chat's primary link sent as a
 *   message to each of them (messages.exportChatInvite, sendMessage), only
 *   when the user asked for it → `{ ok, sent: [id], failed: [id] }`.
 * Telegram's errors become codes the page shows as text.
 */

import { randomIdOf } from './telegram-send.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

export const CODES = {
  USER_PRIVACY_RESTRICTED: 'privacy',
  USER_NOT_MUTUAL_CONTACT: 'not-mutual',
  USERS_TOO_MUCH: 'users-too-much',
  USER_CHANNELS_TOO_MUCH: 'user-channels-too-much',
  CHANNELS_TOO_MUCH: 'too-many-chats',
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_ADMIN_INVITE_REQUIRED: 'not-admin',
  CHAT_WRITE_FORBIDDEN: 'not-admin',
  RIGHT_FORBIDDEN: 'right-forbidden',
  USER_KICKED: 'kicked',
  USER_BANNED_IN_CHANNEL: 'kicked',
  BOT_GROUPS_BLOCKED: 'bot-blocked',
  BOTS_TOO_MUCH: 'bots-too-much',
  ADMINS_TOO_MUCH: 'admins-too-much',
  ADMIN_RANK_INVALID: 'rank-invalid',
  ADMIN_RANK_EMOJI_NOT_ALLOWED: 'rank-invalid',
  USER_CREATOR: 'user-creator',
  USER_ID_INVALID: 'no-user',
  USER_NOT_PARTICIPANT: 'not-member',
  USER_ALREADY_PARTICIPANT: 'already',
  CHAT_NOT_MODIFIED: 'not-modified',
  CHAT_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  PEER_FLOOD: 'flood',
  USER_RESTRICTED: 'restricted',
};

const asFailure = failureOf(CODES);
/** Telegram's error as `{ ok: false, code }`; "not modified" is no failure. */
export const failure = (error) => {
  const out = asFailure(error);
  return out.code === 'not-modified' ? { ok: true } : out;
};
export const bad = (code) => ({ ok: false, error: code, code });
export const codeOf = (error) => asFailure(error).code;

export const CHAT = /^-\d{1,20}$/;
const USER = /^\d{1,20}$/;
const MAX_USERS = 200;
const FWD_LIMIT = 100;
const PRIVACY = new Set(['privacy', 'not-mutual']);

export const isChannel = (chat) => chat.startsWith('-100');
export const textOf = (value) => String(value?.value ?? value);
export const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

/** Whether `users` is a short list of distinct user ids. */
export const validUsers = (users) =>
  Array.isArray(users) &&
  users.length > 0 &&
  users.length <= MAX_USERS &&
  users.every((u) => USER.test(String(u))) &&
  new Set(users.map(String)).size === users.length;

/** Remembers the users an answer carried (their access hashes). */
export const remember = (known, users = []) => {
  for (const user of users) {
    if (user?.id !== undefined && !user.bot) {
      known.set(textOf(user.id), user);
    }
  }
};

/** The input user for an id: a known one, else what GramJS has, else bare. */
export const inputUserOf = async (c, known, id) => {
  const user = known.get(id);
  if (user) {
    return new c.Api.InputUser({
      userId: user.id,
      accessHash: user.accessHash ?? c.zero,
    });
  }
  const entity = await Promise.resolve()
    .then(() => c.client.getInputEntity?.(c.helpers.returnBigInt(id)))
    .catch(() => null);
  return new c.Api.InputUser({
    userId: entity?.userId ?? c.helpers.returnBigInt(id),
    accessHash: entity?.accessHash ?? c.zero,
  });
};

const createCandidates =
  (env, userClient, known) =>
  async (req = {}) => {
    if (!CHAT.test(String(req.chat ?? ''))) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      const people = new Map();
      const take = (users, contact) => {
        remember(known, users);
        for (const u of users ?? []) {
          const id = u ? textOf(u.id) : '';
          if (u && !u.self && !u.bot && !u.deleted && !people.has(id)) {
            people.set(id, {
              id,
              name: nameOf(u) || id,
              username: u.username ?? null,
              contact,
            });
          }
        }
      };
      const contacts = await runIn(env, 'contacts:list', () =>
        c.client.invoke(new c.Api.contacts.GetContacts({ hash: c.zero }))
      );
      take(contacts?.users, true);
      // The people written to most (without them the contacts still show).
      const top = await c.client
        .invoke(
          new c.Api.contacts.GetTopPeers({
            correspondents: true,
            offset: 0,
            limit: 30,
            hash: c.zero,
          })
        )
        .catch(() => null);
      take(top?.users, false);
      return {
        ok: true,
        people: [...people.values()].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      };
    });
  };

const missingIds = (answer) =>
  (answer?.missingInvitees ?? []).map((m) => textOf(m.userId));

// A basic group takes one person a request.
const addToGroup = async (c, env, known, chat, ids) => {
  const out = { added: [], missing: [], failed: [], updates: [] };
  for (const id of ids) {
    try {
      const answer = await runIn(env, `member-add:${chat}:${id}`, async () =>
        c.client.invoke(
          new c.Api.messages.AddChatUser({
            chatId: c.helpers.returnBigInt(chat.slice(1)),
            userId: await inputUserOf(c, known, id),
            fwdLimit: FWD_LIMIT,
          })
        )
      );
      (missingIds(answer).length > 0 ? out.missing : out.added).push(id);
      out.updates.push(answer?.updates);
    } catch (error) {
      const code = codeOf(error);
      if (PRIVACY.has(code)) {
        out.missing.push(id);
      } else {
        out.failed.push({ id, code });
      }
    }
  }
  return out;
};

const addToChannel = async (c, env, known, chat, ids) => {
  const users = await Promise.all(ids.map((id) => inputUserOf(c, known, id)));
  const answer = await runIn(env, `member-add:${chat}`, () =>
    env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(
        new c.Api.channels.InviteToChannel({ channel: peer, users })
      )
    )
  );
  const missing = missingIds(answer);
  return {
    added: ids.filter((id) => !missing.includes(id)),
    missing,
    failed: [],
    updates: [answer?.updates],
  };
};

const createAddMembers =
  (env, { userClient, apply }, known) =>
  async (req = {}) => {
    const chat = String(req.chat ?? '');
    if (!CHAT.test(chat) || !validUsers(req.users)) {
      return bad('bad-request');
    }
    const ids = req.users.map(String);
    return connected(env, userClient, failure, async (c) => {
      const ask = isChannel(chat) ? addToChannel : addToGroup;
      const found = await ask(c, env, known, chat, ids);
      for (const updates of found.updates) {
        if (updates && typeof updates === 'object') {
          await apply(c.client, updates);
        }
      }
      const [first] = found.failed;
      if (first && found.added.length + found.missing.length === 0) {
        return bad(first.code);
      }
      return {
        ok: true,
        added: found.added,
        missing: found.missing.map((id) => ({
          id,
          name: nameOf(known.get(id)) || id,
        })),
        failed: found.failed,
      };
    });
  };

// The chat's primary link, sent to each of the people as a message.
const createSendLink =
  (env, { userClient, apply }, known) =>
  async (req = {}) => {
    const chat = String(req.chat ?? '');
    if (!CHAT.test(chat) || !validUsers(req.users)) {
      return bad('bad-request');
    }
    const ids = req.users.map(String);
    return connected(env, userClient, failure, async (c) => {
      const invite = await runIn(env, `invite-primary:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(new c.Api.messages.ExportChatInvite({ peer }))
        )
      );
      if (typeof invite?.link !== 'string') {
        return bad('failed');
      }
      const out = { sent: [], failed: [] };
      for (const [index, id] of ids.entries()) {
        try {
          const user = await inputUserOf(c, known, id);
          const sent = await c.client.invoke(
            new c.Api.messages.SendMessage({
              peer: new c.Api.InputPeerUser({
                userId: user.userId,
                accessHash: user.accessHash,
              }),
              message: invite.link,
              randomId: randomIdOf(null, index, c.helpers),
            })
          );
          await apply(c.client, sent);
          out.sent.push(id);
        } catch {
          out.failed.push(id);
        }
      }
      return out.sent.length === 0 ? bad('failed') : { ok: true, ...out };
    });
  };

export const createAddMembersActions = (env, context, known) => ({
  addCandidates: createCandidates(env, context.userClient, known),
  addMembers: createAddMembers(env, context, known),
  sendInviteLink: createSendLink(env, context, known),
});
