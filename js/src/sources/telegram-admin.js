/**
 * A group's permissions, slow mode and recent actions, as Telegram
 * Desktop's admin screens (R-Y133; learned, never copied):
 * - `chatPermissions({ chat })` — what members may do, the slow mode and
 *   whether the user may change them → `{ ok, rights, slowMode, canEdit }`;
 *   `rights` are positive: `true` is allowed (Telegram's flags say what is
 *   forbidden);
 * - `setPermissions({ chat, rights })` — the rights changed
 *   (messages.editChatDefaultBannedRights); rights not named stay as they
 *   are;
 * - `setSlowMode({ chat, seconds })` — a supergroup's slow mode
 *   (channels.toggleSlowMode);
 * - `adminLog({ chat, maxId? })` — a supergroup's or channel's recent
 *   actions, newest first, a page at a time (channels.getAdminLog) →
 *   `{ ok, events: [{ id, date, user, userName, kind, text?, msgId? }],
 *   next }`; `msgId` is a deleted message's id (R-Y200).
 * Telegram's errors become codes the page shows as text.
 */

import { canBanIn } from './telegram-chat-info.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'not-modified',
  SECONDS_INVALID: 'seconds-invalid',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
};

const asFailure = failureOf(CODES);
// Nothing to change is no failure.
const failure = (error) => {
  const out = asFailure(error);
  return out.code === 'not-modified' ? { ok: true } : out;
};
const bad = (code) => ({ ok: false, error: code, code });

const CHAT = /^-\d{1,20}$/;
const isChannel = (chat) => chat.startsWith('-100');
export const SLOW_MODES = Object.freeze([0, 10, 30, 60, 300, 900, 3600]);
const PAGE = 50;

// Each right the page shows, and the flags that forbid it.
const RIGHTS = {
  sendMessages: ['sendMessages'],
  sendMedia: [
    'sendMedia',
    'sendPhotos',
    'sendVideos',
    'sendDocs',
    'sendAudios',
    'sendVoices',
    'sendRoundvideos',
    'sendStickers',
    'sendGifs',
    'sendPolls',
  ],
  embedLinks: ['embedLinks'],
  inviteUsers: ['inviteUsers'],
  pinMessages: ['pinMessages'],
  changeInfo: ['changeInfo'],
  manageTopics: ['manageTopics'],
};
export const RIGHT_KEYS = Object.freeze(Object.keys(RIGHTS));

const textOf = (value) => String(value?.value ?? value);

/** Positive rights from a chat's default banned rights (none: all allowed). */
export const rightsOf = (banned = {}) =>
  Object.fromEntries(
    RIGHT_KEYS.map((key) => [key, !RIGHTS[key].some((flag) => banned?.[flag])])
  );

// Flags to ban for the rights that are not allowed.
const flagsOf = (rights) =>
  Object.fromEntries(
    RIGHT_KEYS.filter((key) => key in rights).flatMap((key) =>
      RIGHTS[key].map((flag) => [flag, !rights[key]])
    )
  );

// The full chat: a channel's or a basic group's, as telegram-chat-info.
const readChat = async (env, c, chat) => {
  if (isChannel(chat)) {
    const answer = await env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(new c.Api.channels.GetFullChannel({ channel: peer }))
    );
    const entity = (answer?.chats ?? []).find(Boolean) ?? {};
    return {
      ok: true,
      rights: rightsOf(entity.defaultBannedRights),
      slowMode: Number(answer?.fullChat?.slowmodeSeconds ?? 0),
      canEdit: canBanIn(entity) && !entity.broadcast,
    };
  }
  const answer = await c.client.invoke(
    new c.Api.messages.GetFullChat({
      chatId: c.helpers.returnBigInt(chat.slice(1)),
    })
  );
  const entity = (answer?.chats ?? []).find(Boolean) ?? {};
  return {
    ok: true,
    rights: rightsOf(entity.defaultBannedRights),
    slowMode: 0,
    canEdit: canBanIn(entity),
  };
};

const createPermissions =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHAT.test(chat)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, (c) =>
      runIn(env, `admin:perms:${chat}`, () => readChat(env, c, chat))
    );
  };

const validRights = (rights) =>
  Boolean(rights) &&
  typeof rights === 'object' &&
  !Array.isArray(rights) &&
  Object.keys(rights).length > 0 &&
  Object.entries(rights).every(
    ([key, value]) => RIGHT_KEYS.includes(key) && typeof value === 'boolean'
  );

const createSetPermissions =
  (env, userClient, read) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHAT.test(chat) || !validRights(body.rights)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      // The call replaces every flag: those not named are kept as they are.
      let rights = body.rights;
      if (RIGHT_KEYS.some((key) => !(key in rights))) {
        const was = await read({ chat });
        if (!was.ok) {
          return was;
        }
        rights = { ...was.rights, ...rights };
      }
      await runIn(env, `admin:set:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.EditChatDefaultBannedRights({
              peer,
              bannedRights: new c.Api.ChatBannedRights({
                ...flagsOf(rights),
                untilDate: 0,
              }),
            })
          )
        )
      );
      return { ok: true };
    });
  };

const createSlowMode =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const { seconds } = body;
    if (!CHAT.test(chat) || !isChannel(chat) || !SLOW_MODES.includes(seconds)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `admin:slow:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.ToggleSlowMode({ channel: peer, seconds })
          )
        )
      );
      return { ok: true };
    });
  };

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

// The person a participant record is about.
const partUser = (part) => textOf(part?.userId ?? part?.peer?.userId ?? '');

const messageText = (message) => message?.message || undefined;

// Each action: its kind and the text it carries.
const KINDS = {
  ChangeTitle: (a) => ['title', a.newValue],
  ChangeAbout: (a) => ['about', a.newValue],
  ChangePhoto: () => ['photo'],
  EditMessage: (a) => ['edit', messageText(a.newMessage)],
  DeleteMessage: (a) => ['delete', messageText(a.message)],
  UpdatePinned: (a) => ['pin', messageText(a.message)],
  ParticipantJoin: () => ['join'],
  ParticipantJoinByInvite: () => ['join'],
  ParticipantJoinByRequest: () => ['join'],
  ParticipantLeave: () => ['leave'],
  ParticipantInvite: (a, who) => ['invite', who(a.participant)],
  ParticipantToggleBan: (a, who) => ['ban', who(a.newParticipant)],
  ParticipantToggleAdmin: (a, who) => ['promote', who(a.newParticipant)],
  DefaultBannedRights: () => ['rights'],
  ToggleSlowMode: (a) => ['slowmode', String(a.newValue ?? 0)],
};

const eventOf = (event, names) => {
  const user = textOf(event.userId);
  const action = event.action ?? { className: '' };
  const who = (part) => names.get(partUser(part)) || partUser(part);
  const make =
    KINDS[action.className.replace('ChannelAdminLogEventAction', '')];
  const [kind, text] = make ? make(action, who) : ['other', action.className];
  // A deleted message's id, for "Not spam" (R-Y200).
  const msgId = kind === 'delete' ? action.message?.id : undefined;
  return {
    id: textOf(event.id),
    date: Number(event.date) * 1000,
    user,
    userName: names.get(user) || user,
    kind,
    ...(text ? { text } : {}),
    ...(msgId ? { msgId: Number(msgId) } : {}),
  };
};

const createAdminLog =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const maxId = String(body.maxId ?? '0');
    if (!CHAT.test(chat) || !isChannel(chat) || !/^\d{1,20}$/.test(maxId)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `admin:log:${chat}:${maxId}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.GetAdminLog({
              channel: peer,
              q: '',
              maxId: c.helpers.returnBigInt(maxId),
              minId: c.helpers.returnBigInt(0),
              limit: PAGE,
            })
          )
        )
      );
      const names = new Map(
        (answer?.users ?? []).map((u) => [textOf(u.id), nameOf(u)])
      );
      const events = (answer?.events ?? []).map((e) => eventOf(e, names));
      return {
        ok: true,
        events,
        next: events.length >= PAGE ? events.at(-1).id : null,
      };
    });
  };

export const createAdminActions = (env, context) => {
  const chatPermissions = createPermissions(env, context.userClient);
  return {
    chatPermissions,
    setPermissions: createSetPermissions(
      env,
      context.userClient,
      chatPermissions
    ),
    setSlowMode: createSlowMode(env, context.userClient),
    adminLog: createAdminLog(env, context.userClient),
  };
};
