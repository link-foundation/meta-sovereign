/**
 * A group's and a channel's settings in Manage group / channel (R-Y165;
 * learned, never copied), as Telegram Desktop has them:
 * - `chatSettingSet({ chat, setting, value })` — one switch, from a strict
 *   allow-list: `signatures` and `signatureProfiles`
 *   (channels.toggleSignatures), `joinToSend` (channels.toggleJoinToSend),
 *   `joinRequest` (channels.toggleJoinRequest), `hideMembers`
 *   (channels.toggleParticipantsHidden), `antiSpam` (channels.toggleAntiSpam)
 *   `autotranslation` (channels.toggleAutotranslation, the channel's owner,
 *   R-Y184) and `noForwards` (messages.toggleNoForwards; a group or a
 *   channel);
 * - `discussionGroups({ chat })` — the supergroups a channel may be linked
 *   to (channels.getGroupsForDiscussion) → `{ ok, groups: [{ id, title }] }`;
 * - `discussionSet({ chat, group })` — links the channel to a group, or
 *   unlinks it with `group: null` (channels.setDiscussionGroup).
 * `settingsInfo(entity, full, chats)` is what the chat's info carries so the
 * page knows the current values and which switches the user may use.
 * Telegram's errors become codes the page shows as words.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'not-modified',
  LINK_NOT_MODIFIED: 'not-modified',
  PARTICIPANTS_TOO_FEW: 'too-few',
  ANTISPAM: 'antispam-unavailable',
  BROADCAST_FORBIDDEN: 'wrong-kind',
  MEGAGROUP_PREHISTORY_HIDDEN: 'prehistory-hidden',
  BROADCAST_ID_INVALID: 'no-access',
  MEGAGROUP_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

// Telegram's errors as codes, where nothing to change is no failure.
export const quietFailureOf = (codes) => {
  const asFailure = failureOf(codes);
  return (error) => {
    const out = asFailure(error);
    return out.code === 'not-modified' ? { ok: true } : out;
  };
};
const failure = quietFailureOf(CODES);
const bad = { ok: false, error: 'bad-request', code: 'bad-request' };

const CHANNEL = /^-100\d{1,20}$/;
const CHAT = /^-\d{1,20}$/;
const textOf = (value) => String(value?.value ?? value);

// Each switch the page may set: whether it needs a channel (not a basic
// group) and the request that sets it.
const SETTINGS = {
  signatures: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleSignatures({
        channel: peer,
        signaturesEnabled: enabled,
        profilesEnabled: false,
      }),
  },
  signatureProfiles: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleSignatures({
        channel: peer,
        signaturesEnabled: true,
        profilesEnabled: enabled,
      }),
  },
  joinToSend: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleJoinToSend({ channel: peer, enabled }),
  },
  joinRequest: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleJoinRequest({ channel: peer, enabled }),
  },
  hideMembers: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleParticipantsHidden({ channel: peer, enabled }),
  },
  antiSpam: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleAntiSpam({ channel: peer, enabled }),
  },
  // Translate the channel's posts for its readers (R-Y184).
  autotranslation: {
    channel: true,
    ask: (c, peer, enabled) =>
      new c.Api.channels.ToggleAutotranslation({ channel: peer, enabled }),
  },
  noForwards: {
    channel: false,
    ask: (c, peer, enabled) =>
      new c.Api.messages.ToggleNoForwards({ peer, enabled }),
  },
};
export const SETTING_KEYS = Object.freeze(Object.keys(SETTINGS));

/** Whether `body` is a valid `{ chat, setting, value }`. */
export const validSetting = (body = {}) => {
  const chat = String(body.chat ?? '');
  const spec = Object.hasOwn(SETTINGS, body.setting)
    ? SETTINGS[body.setting]
    : null;
  return Boolean(
    spec &&
    typeof body.value === 'boolean' &&
    (spec.channel ? CHANNEL.test(chat) : CHAT.test(chat))
  );
};

// The group a channel is linked to, as { id, title }, or null.
const linkedOf = (full, chats) => {
  if (full.linkedChatId === undefined || full.linkedChatId === null) {
    return null;
  }
  const id = textOf(full.linkedChatId);
  const found = chats.find((one) => one && textOf(one.id) === id);
  return { id: `-100${id}`, title: found?.title ?? '' };
};

// The switches this user may use in this chat.
const shownIn = (entity, linked, full = {}) => {
  const owner = Boolean(entity.creator);
  const admin = owner || Boolean(entity.adminRights?.changeInfo);
  const shown = [];
  if (admin && entity.broadcast) {
    shown.push('signatures', 'discussion');
  }
  if (admin && entity.megagroup) {
    if (entity.username || linked) {
      shown.push('joinToSend', 'joinRequest');
    }
    shown.push('hideMembers', 'antiSpam');
    // What a message costs: only where Telegram offers it (R-Y184).
    if (full.paidMessagesAvailable) {
      shown.push('paidMessages');
    }
  }
  if (owner) {
    shown.push('noForwards');
    if (entity.broadcast) {
      shown.push('autotranslation');
    }
  }
  return shown;
};

/**
 * What a chat's info carries about these settings: `shown`, the switches
 * this user may use (the creator or an admin who may change info; Restrict
 * saving is the creator's; Join to send and Approve new members only where
 * the group is public or linked to a channel, as Desktop shows them),
 * their current `values` and the linked discussion group.
 */
export const settingsInfo = (entity = {}, full = {}, chats = []) => {
  const linked = linkedOf(full, chats);
  return {
    shown: shownIn(entity, linked, full),
    values: {
      signatures: Boolean(entity.signatures),
      signatureProfiles: Boolean(entity.signatureProfiles),
      joinToSend: Boolean(entity.joinToSend),
      joinRequest: Boolean(entity.joinRequest),
      hideMembers: Boolean(full.participantsHidden),
      antiSpam: Boolean(full.antispam),
      noForwards: Boolean(entity.noforwards),
      autotranslation: Boolean(entity.autotranslation),
    },
    // Stars one message to the group costs its members (R-Y184).
    paidStars:
      Number(
        full.sendPaidMessagesStars?.value ?? full.sendPaidMessagesStars ?? 0
      ) || 0,
    linked,
  };
};

const createSet = (env, userClient) => async (body) => {
  if (!validSetting(body)) {
    return bad;
  }
  return connected(env, userClient, failure, async (c) => {
    await runIn(env, `chat-settings:${body.chat}`, () =>
      env.connection.withPeer(c.client, body.chat, (peer) =>
        c.client.invoke(SETTINGS[body.setting].ask(c, peer, body.value))
      )
    );
    return { ok: true };
  });
};

const createGroups =
  (env, userClient) =>
  async (body = {}) => {
    if (!CHANNEL.test(String(body.chat ?? ''))) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `chat-settings:groups:${body.chat}`, () =>
        c.client.invoke(new c.Api.channels.GetGroupsForDiscussion())
      );
      const groups = (answer?.chats ?? [])
        .filter((one) => one?.id !== undefined)
        .map((one) => ({
          id: `-100${textOf(one.id)}`,
          title: one.title ?? '',
        }));
      return { ok: true, groups };
    });
  };

const createDiscussion =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const group = body.group ?? null;
    if (
      !CHANNEL.test(chat) ||
      (group !== null && !CHANNEL.test(String(group)))
    ) {
      return bad;
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `chat-settings:discussion:${chat}`, () =>
        env.connection.withPeer(c.client, chat, async (broadcast) => {
          const target =
            group === null
              ? new c.Api.InputChannelEmpty()
              : await env.connection.withPeer(
                  c.client,
                  String(group),
                  async (peer) => peer
                );
          return c.client.invoke(
            new c.Api.channels.SetDiscussionGroup({ broadcast, group: target })
          );
        })
      );
      return { ok: true };
    });
  };

export const createChatSettings = (env, context) => ({
  chatSettingSet: createSet(env, context.userClient),
  discussionGroups: createGroups(env, context.userClient),
  discussionSet: createDiscussion(env, context.userClient),
});
