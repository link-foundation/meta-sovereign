/**
 * Chat invite links, as Telegram Desktop handles them (R-Y123; learned,
 * never copied):
 * - `checkChatInvite({ hash })` — what a link leads to
 *   (messages.checkChatInvite): `{ ok, already, chat }` when the user is in
 *   the chat (open it), else `{ ok, invite: { title, about, members,
 *   channel, broadcast, requestNeeded } }`;
 * - `joinChatInvite({ hash })` — only on the user's press of Join
 *   (messages.importChatInvite); the answer goes through the live handler,
 *   so the chat appears in the list;
 * - `revokeChatInvite({ chat })` — a chat's primary link replaced by a new
 *   one (messages.exportChatInvite with legacyRevokePermanent) →
 *   `{ ok, link }`.
 * Telegram's errors become codes the page shows as text.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';
import {
  telegramJoinedReceipt,
  telegramWriteFailure,
  traceTelegramMembership,
  invokeTelegramWrite,
} from './telegram-membership-receipt.js';

export const INVITE_HASH = /^[A-Za-z0-9_-]{8,64}$/;

const CODES = {
  INVITE_HASH_EXPIRED: 'invite-expired',
  INVITE_HASH_INVALID: 'invite-invalid',
  INVITE_HASH_EMPTY: 'invite-invalid',
  INVITE_REQUEST_SENT: 'invite-request-sent',
  USERS_TOO_MUCH: 'chat-full',
  CHANNELS_TOO_MUCH: 'too-many-chats',
  USER_ALREADY_PARTICIPANT: 'already-member',
  CHAT_ADMIN_REQUIRED: 'not-admin',
};

const failure = failureOf(CODES);

const BAD_HASH = { ok: false, error: 'invite-invalid', code: 'invite-invalid' };

const textOf = (value) => String(value?.value ?? value);
const memberCount = (chat) =>
  Number.isInteger(chat.participantsCount) && chat.participantsCount >= 0
    ? chat.participantsCount
    : null;

// The chat's address in the list: a channel's marked id, a group's.
export const markedId = (chat) =>
  chat.className === 'Channel' || chat.className === 'ChannelForbidden'
    ? `-100${textOf(chat.id)}`
    : `-${textOf(chat.id)}`;

const describe = (found) => {
  if (
    !['ChatInvite', 'ChatInviteAlready', 'ChatInvitePeek'].includes(
      found.className
    )
  ) {
    return { ok: false, code: 'failed' };
  }
  if (found.className === 'ChatInviteAlready' && found.chat) {
    return {
      ok: true,
      already: true,
      chat: markedId(found.chat),
      title: found.chat.title ?? '',
    };
  }
  // Peek grants temporary read access; it does not add the user to the chat.
  const preview =
    found.className === 'ChatInvitePeek' ? (found.chat ?? {}) : found;
  return {
    ok: true,
    already: false,
    invite: {
      title: preview.title ?? '',
      about: preview.about ?? '',
      members: memberCount(preview),
      channel: Boolean(preview.channel || preview.className === 'Channel'),
      broadcast: Boolean(preview.broadcast),
      megagroup: Boolean(preview.megagroup),
      requestNeeded: Boolean(preview.requestNeeded || preview.joinRequest),
    },
  };
};

const createChecker =
  (env, userClient) =>
  async (request = {}) => {
    const hash = String(request.hash ?? '');
    if (!INVITE_HASH.test(hash)) {
      return BAD_HASH;
    }
    return connected(env, userClient, failure, async (c) => {
      const found = await runIn(env, `invite:check:${hash}`, () =>
        c.client.invoke(new c.Api.messages.CheckChatInvite({ hash }))
      );
      return describe(found ?? {});
    });
  };

const createJoiner =
  (env, { userClient, apply }) =>
  async (request = {}) => {
    const hash = String(request.hash ?? '');
    if (!INVITE_HASH.test(hash)) {
      return BAD_HASH;
    }
    return connected(
      env,
      userClient,
      telegramWriteFailure(failure),
      async (c) => {
        const answer = await runIn(env, `invite:join:${hash}`, () =>
          invokeTelegramWrite(
            c.client,
            new c.Api.messages.ImportChatInvite({ hash })
          )
        );
        const receipt = telegramJoinedReceipt(answer);
        traceTelegramMembership(env, 'invite-join', receipt);
        if (!receipt.ok) {
          return receipt;
        }
        await apply(c.client, receipt.updates);
        return { ok: true, chat: receipt.chat };
      }
    );
  };

const createRevoker =
  (env, userClient) =>
  async (request = {}) => {
    const target = String(request.chat ?? '');
    if (!/^-\d{1,20}$/.test(target)) {
      return { ok: false, error: 'bad chat', code: 'failed' };
    }
    return connected(env, userClient, failure, async (c) => {
      const result = await runIn(env, `invite:revoke:${target}`, () =>
        env.connection.withPeer(c.client, target, (peer) =>
          c.client.invoke(
            new c.Api.messages.ExportChatInvite({
              peer,
              legacyRevokePermanent: true,
            })
          )
        )
      );
      const link = (result?.newInvite ?? result?.invite ?? result)?.link;
      return typeof link === 'string' && link
        ? { ok: true, link }
        : { ok: false, error: 'failed', code: 'failed' };
    });
  };

/** `env` is the account's; `apply(client, result)` the live handler. */
export const createInvites = (env, context) => ({
  checkChatInvite: createChecker(env, context.userClient),
  joinChatInvite: createJoiner(env, context),
  revokeChatInvite: createRevoker(env, context.userClient),
});
