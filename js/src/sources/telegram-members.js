/**
 * A group's members, as Telegram Desktop lists them in the info column
 * (R-Y125; learned, never copied):
 * - `chatMembers({ chat, q, offset, limit })` — a supergroup's page
 *   (channels.getParticipants, the recent ones, or a search by `q`), a
 *   basic group's (messages.getFullChat) → `{ ok, total, members: [{ id,
 *   name, username, role, rank, self }], canBan, canInvite }`; `role` is
 *   creator, admin, member, restricted or banned;
 * - `removeMember({ chat, user })` — "Remove from group": the user banned
 *   and at once unbanned in a supergroup (so they may come back), a basic
 *   group's member deleted (messages.deleteChatUser).
 * Telegram's errors become codes the page shows as text.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  USER_ADMIN_INVALID: 'user-admin',
  USER_NOT_PARTICIPANT: 'not-member',
  PARTICIPANT_ID_INVALID: 'not-member',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
};

const failure = failureOf(CODES);

const CHAT = /^-\d{1,20}$/;
const USER = /^\d{1,20}$/;
const textOf = (value) => String(value?.value ?? value);
const isChannel = (chat) => chat.startsWith('-100');

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

const ROLES = {
  ChannelParticipantCreator: 'creator',
  ChatParticipantCreator: 'creator',
  ChannelParticipantAdmin: 'admin',
  ChatParticipantAdmin: 'admin',
  ChannelParticipantBanned: 'restricted',
};

const roleOf = (participant) => {
  const role = ROLES[participant.className] ?? 'member';
  return role === 'restricted' && participant.bannedRights?.viewMessages
    ? 'banned'
    : role;
};

// The user a participant is: a banned one names a peer, the rest a user id.
const userIdOf = (participant) =>
  participant.userId === undefined && participant.peer?.userId === undefined
    ? ''
    : textOf(participant.userId ?? participant.peer.userId);

const memberOf = (participant, users) => {
  const id = userIdOf(participant);
  const user = users.get(id);
  return {
    id,
    name: nameOf(user) || id,
    username: user?.username ?? null,
    role: roleOf(participant),
    rank: participant.rank ?? null,
    self: Boolean(user?.self),
  };
};

// The user may remove people: the creator, or an admin allowed to ban.
const canBanIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.banUsers);
const canInviteIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.inviteUsers);

const shape = (answer, participants, total, offset = 0) => {
  const users = new Map((answer?.users ?? []).map((u) => [textOf(u.id), u]));
  const entity = (answer?.chats ?? []).find(Boolean) ?? {};
  return {
    ok: true,
    total,
    offset,
    members: participants
      .map((p) => memberOf(p, users))
      .filter((m) => m.id !== ''),
    canBan: canBanIn(entity),
    canInvite: canInviteIn(entity),
  };
};

const readChannel = async (c, env, { chat, q, offset, limit }) => {
  const filter = q
    ? new c.Api.ChannelParticipantsSearch({ q })
    : new c.Api.ChannelParticipantsRecent();
  const answer = await runIn(env, `members:${chat}:${q}:${offset}`, () =>
    env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(
        new c.Api.channels.GetParticipants({
          channel: peer,
          filter,
          offset,
          limit,
          hash: c.zero,
        })
      )
    )
  );
  const found = answer?.participants ?? [];
  return shape(answer, found, Number(answer?.count ?? found.length), offset);
};

const readGroup = async (c, env, { chat, q, offset, limit }) => {
  const answer = await runIn(env, `members:${chat}`, () =>
    c.client.invoke(
      new c.Api.messages.GetFullChat({
        chatId: c.helpers.returnBigInt(chat.slice(1)),
      })
    )
  );
  const all = answer?.fullChat?.participants?.participants ?? [];
  const whole = shape(answer, all, all.length);
  const words = q.toLowerCase();
  const kept = whole.members.filter(
    (m) =>
      !words ||
      m.name.toLowerCase().includes(words) ||
      (m.username ?? '').toLowerCase().includes(words)
  );
  return { ...whole, offset, members: kept.slice(offset, offset + limit) };
};

const createReader =
  (env, userClient) =>
  async (request = {}) => {
    const chat = String(request.chat ?? '');
    if (!CHAT.test(chat)) {
      return { ok: false, error: 'bad chat', code: 'failed' };
    }
    const q = typeof request.q === 'string' ? request.q.trim() : '';
    const offset = Math.max(0, Math.floor(Number(request.offset) || 0));
    const limit = Math.min(200, Math.max(1, Number(request.limit) || 50));
    return connected(env, userClient, failure, async (c) => {
      const ask = isChannel(chat) ? readChannel : readGroup;
      return await ask(c, env, { chat, q, offset, limit });
    });
  };

// The person as an input peer, from what GramJS knows, else by id alone.
const inputPeerOf = async (c, user) => {
  const id = c.helpers.returnBigInt(user);
  const known = await Promise.resolve()
    .then(() => c.client.getInputEntity?.(id))
    .catch(() => null);
  return (
    known ??
    new c.Api.InputPeerUser({
      userId: id,
      accessHash: c.helpers.returnBigInt(0),
    })
  );
};

const rights = (c, on) =>
  new c.Api.ChatBannedRights({
    ...(on ? { viewMessages: true } : {}),
    untilDate: 0,
  });

// Banned and at once let go: out of the group, free to come back.
const removeFromChannel = async (c, peer, participant) => {
  for (const on of [true, false]) {
    await c.client.invoke(
      new c.Api.channels.EditBanned({
        channel: peer,
        participant,
        bannedRights: rights(c, on),
      })
    );
  }
};

const removeFromGroup = (c, chat, participant) =>
  c.client.invoke(
    new c.Api.messages.DeleteChatUser({
      chatId: c.helpers.returnBigInt(chat.slice(1)),
      userId: new c.Api.InputUser({
        userId: participant.userId,
        accessHash: participant.accessHash ?? c.helpers.returnBigInt(0),
      }),
    })
  );

const createRemover =
  (env, userClient) =>
  async (request = {}) => {
    const chat = String(request.chat ?? '');
    const user = String(request.user ?? '');
    if (!CHAT.test(chat) || !USER.test(user)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    return connected(env, userClient, failure, async (c) => {
      const participant = await inputPeerOf(c, user);
      await runIn(env, `member-remove:${chat}:${user}`, () =>
        isChannel(chat)
          ? env.connection.withPeer(c.client, chat, (peer) =>
              removeFromChannel(c, peer, participant)
            )
          : removeFromGroup(c, chat, participant)
      );
      return { ok: true };
    });
  };

export const createMembers = (env, context) => ({
  chatMembers: createReader(env, context.userClient),
  removeMember: createRemover(env, context.userClient),
});
