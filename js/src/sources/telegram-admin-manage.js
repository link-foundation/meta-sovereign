/**
 * A chat's administrators, the history new members see, and upgrading a
 * group, as Telegram Desktop does (R-Y204; learned, never copied):
 * - `chatAdmins({ chat })` — the administrators (channels.getParticipants
 *   with the admins filter, or a basic group's full chat) → `{ ok, admins:
 *   [{ id, name, username, role, rank, rights, promotedBy, promotedByName,
 *   canEdit, self }] }`; `rights` holds every ChatAdminRights flag;
 * - `setAdmin({ chat, user, rights?, rank?, dismiss?, broadcast? })` —
 *   channels.editAdmin with the rights of the chat's kind (no rights at all
 *   dismisses), or in a basic group messages.editChatAdmin (a basic group
 *   has no custom rights or titles: those need an upgrade) → `{ ok }`;
 * - `setHistoryHidden({ chat, hidden })` — what new members see
 *   (channels.togglePreHistoryHidden; a basic group must upgrade first);
 * - `upgradeGroup({ chat })` — messages.migrateChat → `{ ok, chat, title }`
 *   with the supergroup's id; the answer's updates go through the live
 *   handler, which carries the migration service messages.
 * Telegram's errors become codes the page shows as text.
 */

import { markedId } from './telegram-invite.js';
import { connected, runIn } from './telegram-stickers.js';
import {
  ALL_ADMIN_RIGHTS,
  anyRight,
  kindOfChat,
  shapeRights,
  validRank,
  validRights,
} from './telegram-admin-rights.js';
import {
  CHAT,
  bad,
  failure,
  inputUserOf,
  isChannel,
  nameOf,
  remember,
  textOf,
  validUsers,
} from './telegram-add-members.js';

const ROLES = {
  ChannelParticipantCreator: 'creator',
  ChatParticipantCreator: 'creator',
  ChannelParticipantAdmin: 'admin',
  ChatParticipantAdmin: 'admin',
};

const idOf = (value) => (value === undefined ? '' : textOf(value));

const adminOf = (participant, users) => {
  const id = idOf(participant.userId);
  const user = users.get(id);
  const by = idOf(participant.promotedBy ?? participant.inviterId);
  return {
    id,
    name: nameOf(user) || id,
    username: user?.username ?? null,
    role: ROLES[participant.className],
    rank: participant.rank ?? null,
    rights: Object.fromEntries(
      ALL_ADMIN_RIGHTS.map((key) => [
        key,
        ROLES[participant.className] === 'creator' ||
          Boolean(participant.adminRights?.[key]),
      ])
    ),
    promotedBy: by || null,
    promotedByName: by ? nameOf(users.get(by)) || by : null,
    canEdit: Boolean(participant.canEdit),
    self: Boolean(user?.self),
  };
};

const shapeAdmins = (participants, answer, known) => {
  remember(known, answer?.users);
  const users = new Map((answer?.users ?? []).map((u) => [textOf(u.id), u]));
  return participants
    .filter((p) => ROLES[p.className])
    .map((p) => adminOf(p, users))
    .filter((a) => a.id !== '');
};

const createAdmins =
  (env, userClient, known) =>
  async (req = {}) => {
    const chat = String(req.chat ?? '');
    if (!CHAT.test(chat)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      if (!isChannel(chat)) {
        const answer = await runIn(env, `admins:${chat}`, () =>
          c.client.invoke(
            new c.Api.messages.GetFullChat({
              chatId: c.helpers.returnBigInt(chat.slice(1)),
            })
          )
        );
        const all = answer?.fullChat?.participants?.participants ?? [];
        return { ok: true, admins: shapeAdmins(all, answer, known) };
      }
      const answer = await runIn(env, `admins:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.GetParticipants({
              channel: peer,
              filter: new c.Api.ChannelParticipantsAdmins(),
              offset: 0,
              limit: 200,
              hash: c.zero,
            })
          )
        )
      );
      const list = answer?.participants ?? [];
      return { ok: true, admins: shapeAdmins(list, answer, known) };
    });
  };

/**
 * What a `setAdmin` request is asked with, or the code that refuses it:
 * `{ ok: true, dismiss, rights, rank }`; rights are shaped to the chat's
 * kind, and a request with none at all dismisses.
 */
const wellFormed = (req, rank) =>
  CHAT.test(String(req.chat ?? '')) &&
  validUsers([req.user]) &&
  (req.rights === undefined || validRights(req.rights)) &&
  validRank(rank) &&
  (req.dismiss === undefined || typeof req.dismiss === 'boolean') &&
  (req.broadcast === undefined || typeof req.broadcast === 'boolean');

export const adminRequest = (req = {}) => {
  const chat = String(req.chat ?? '');
  const rank = req.rank === undefined ? '' : req.rank;
  if (!wellFormed(req, rank)) {
    return bad('bad-request');
  }
  const kind = kindOfChat(chat, req.broadcast === true);
  if (kind === 'group' && (req.rights !== undefined || rank !== '')) {
    return bad('needs-upgrade');
  }
  const rights = shapeRights(req.rights ?? {}, kind);
  const dismiss = req.dismiss === true;
  if (kind !== 'group' && !dismiss && !anyRight(rights)) {
    return bad('no-rights');
  }
  return { ok: true, chat, kind, dismiss, rights, rank };
};

const createSetAdmin =
  (env, { userClient, apply }, known) =>
  async (req = {}) => {
    const asked = adminRequest(req);
    if (!asked.ok) {
      return asked;
    }
    const { chat, kind, dismiss, rights, rank } = asked;
    return connected(env, userClient, failure, async (c) => {
      const user = await inputUserOf(c, known, String(req.user));
      const answer = await runIn(env, `admin-set:${chat}:${req.user}`, () =>
        kind === 'group'
          ? c.client.invoke(
              new c.Api.messages.EditChatAdmin({
                chatId: c.helpers.returnBigInt(chat.slice(1)),
                userId: user,
                isAdmin: !dismiss,
              })
            )
          : env.connection.withPeer(c.client, chat, (peer) =>
              c.client.invoke(
                new c.Api.channels.EditAdmin({
                  channel: peer,
                  userId: user,
                  adminRights: new c.Api.ChatAdminRights(dismiss ? {} : rights),
                  rank: dismiss ? '' : rank,
                })
              )
            )
      );
      if (answer && typeof answer === 'object') {
        await apply(c.client, answer);
      }
      return { ok: true };
    });
  };

const createHistory =
  (env, { userClient, apply }) =>
  async (req = {}) => {
    const chat = String(req.chat ?? '');
    if (!CHAT.test(chat) || typeof req.hidden !== 'boolean') {
      return bad('bad-request');
    }
    if (!isChannel(chat)) {
      return bad('needs-upgrade');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `history-hidden:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.TogglePreHistoryHidden({
              channel: peer,
              enabled: req.hidden,
            })
          )
        )
      );
      if (answer && typeof answer === 'object') {
        await apply(c.client, answer);
      }
      return { ok: true, hidden: req.hidden };
    });
  };

const createUpgrade =
  (env, { userClient, apply }) =>
  async (req = {}) => {
    const chat = String(req.chat ?? '');
    if (!CHAT.test(chat) || isChannel(chat)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `migrate:${chat}`, () =>
        c.client.invoke(
          new c.Api.messages.MigrateChat({
            chatId: c.helpers.returnBigInt(chat.slice(1)),
          })
        )
      );
      const channel = (answer?.chats ?? []).find(
        (x) => x?.className === 'Channel'
      );
      if (answer && typeof answer === 'object') {
        await apply(c.client, answer);
      }
      if (!channel) {
        return bad('failed');
      }
      const id = markedId(channel);
      await Promise.resolve(
        env.peers?.remember?.(id, channel, {
          title: channel.title,
          isGroup: true,
          isChannel: true,
        })
      ).catch(() => {});
      return { ok: true, chat: id, title: channel.title ?? null };
    });
  };

export const createAdminManage = (env, context, known) => ({
  chatAdmins: createAdmins(env, context.userClient, known),
  setAdmin: createSetAdmin(env, context, known),
  setHistoryHidden: createHistory(env, context),
  upgradeGroup: createUpgrade(env, context),
});
