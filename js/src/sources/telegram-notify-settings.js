/**
 * Notification settings, as Telegram Desktop's Settings → Notifications
 * and a chat's "Notifications" have them (R-Y157; learned, never copied):
 *
 * - `notifyOverview()` — the account's global settings for private chats,
 *   groups and channels (account.getNotifySettings with InputNotifyUsers,
 *   InputNotifyChats, InputNotifyBroadcasts) and the chats that differ
 *   (account.getNotifyExceptions, sounds not compared) → `{ ok, scopes:
 *   { users | chats | broadcasts: { on, previews, stories } }, exceptions:
 *   [{ chat, name, scope, state: 'muted' | 'unmuted' | 'custom',
 *   muteUntil, forever, previews }] }`;
 * - `notifyScopeSet({ scope, on, previews, stories })` — one change to a
 *   scope (account.updateNotifySettings; off is muted for good, on is
 *   muteUntil 0), the rest of its settings kept → `{ ok, scope, ...row }`;
 * - `notifyChat({ chat })` — one chat's own settings (getNotifySettings
 *   with InputNotifyPeer) → `{ ok, chat, exception, muteUntil, forever,
 *   previews, stories }`;
 * - `notifyChatSet({ chat, mute, previews, reset })` — a chat's own: `mute`
 *   'off', 'forever' or seconds; `previews` 'default', 'on' or 'off';
 *   `reset` sends empty settings so the chat follows the global ones.
 * Layer 225 has no per-chat flag for pinned messages or for mentions, so
 * neither is offered; stories are muted by `storiesMuted`.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';
import { MUTE_FOREVER, muteUntilOf, peerOfChat } from './telegram-dialogs.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const CHAT = /^-?\d{1,20}$/;

export const SCOPES = Object.freeze(['users', 'chats', 'broadcasts']);
const INPUT = {
  users: 'InputNotifyUsers',
  chats: 'InputNotifyChats',
  broadcasts: 'InputNotifyBroadcasts',
};
const BAD = { ok: false, error: 'bad request', code: 'failed' };
// Longer than this left is "for good" in a list.
const FOREVER_MS = 5 * 365 * 24 * 3600 * 1000;

const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const text = (value) => String(value?.value ?? value ?? '');

/** A scope's row for the page, from Telegram's PeerNotifySettings. */
export const rowOf = (settings = {}, nowMs = Date.now()) => ({
  on: !(Number(settings.muteUntil ?? 0) * 1000 > nowMs),
  previews: settings.showPreviews !== false,
  stories: settings.storiesMuted !== true,
});

// The fields of what Telegram has, as an input to write back with
// changes: everything kept that the page does not touch.
const keptFields = (settings = {}) => {
  const fields = {};
  for (const key of ['showPreviews', 'silent', 'storiesMuted']) {
    if (bool(settings[key]) !== undefined) {
      fields[key] = settings[key];
    }
  }
  if (bool(settings.storiesHideSender) !== undefined) {
    fields.storiesHideSender = settings.storiesHideSender;
  }
  if (settings.muteUntil !== undefined) {
    fields.muteUntil = Number(settings.muteUntil);
  }
  if (settings.otherSound) {
    fields.sound = settings.otherSound;
  }
  return fields;
};

const without = (fields, key) =>
  Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key));

// Who an exception is about: a marked chat id.
const idOf = (peer = {}) => {
  if (peer.userId !== undefined) {
    return text(peer.userId);
  }
  if (peer.chatId !== undefined) {
    return `-${text(peer.chatId)}`;
  }
  return peer.channelId === undefined ? null : `-100${text(peer.channelId)}`;
};

const entityName = (e = {}) =>
  e.title ??
  ([e.firstName, e.lastName].filter(Boolean).join(' ') ||
    e.username ||
    text(e.id));

const entityOf = (result, peer) => {
  const key = text(peer.userId ?? peer.chatId ?? peer.channelId);
  const list = peer.userId === undefined ? result.chats : result.users;
  return (list ?? []).find((e) => text(e.id) === key) ?? {};
};

const scopeOfPeer = (peer, entity) => {
  if (peer.userId !== undefined) {
    return 'users';
  }
  return peer.channelId !== undefined && entity.broadcast
    ? 'broadcasts'
    : 'chats';
};

/** One exception from Telegram's UpdateNotifySettings, or null. */
export const exceptionOf = (result, update, nowMs = Date.now()) => {
  const peer = update.peer?.peer;
  const chat = peer ? idOf(peer) : null;
  if (update.peer?.className !== 'NotifyPeer' || !chat) {
    return null;
  }
  const settings = update.notifySettings ?? {};
  const entity = entityOf(result, peer);
  const until = Number(settings.muteUntil ?? 0);
  let state = 'custom';
  if (settings.muteUntil !== undefined) {
    state = until * 1000 > nowMs ? 'muted' : 'unmuted';
  }
  return {
    chat,
    name: entityName(entity),
    scope: scopeOfPeer(peer, entity),
    state,
    muteUntil: state === 'muted' ? until : 0,
    forever: state === 'muted' && until * 1000 - nowMs > FOREVER_MS,
    previews: bool(settings.showPreviews) ?? null,
  };
};

const muteOf = (mute, nowMs) => {
  if (mute === 'off') {
    return 0;
  }
  return mute === 'forever' ? MUTE_FOREVER : muteUntilOf(mute, nowMs);
};

/** A chat's change over what it has: the fields to write. */
export const chatFields = (current, { mute, previews }, nowMs) => {
  let fields = keptFields(current);
  if (mute !== undefined) {
    fields = { ...fields, muteUntil: muteOf(mute, nowMs) };
  }
  if (previews === 'default') {
    fields = without(fields, 'showPreviews');
  } else if (previews !== undefined) {
    fields = { ...fields, showPreviews: previews === 'on' };
  }
  return fields;
};

const validMute = (v) =>
  v === undefined ||
  v === 'off' ||
  v === 'forever' ||
  (Number.isInteger(v) && v > 0);
const validPreviews = (v) =>
  v === undefined || v === 'default' || v === 'on' || v === 'off';

export const validChatChange = (b = {}) =>
  CHAT.test(String(b.chat ?? '')) &&
  (b.reset === undefined || typeof b.reset === 'boolean') &&
  validMute(b.mute) &&
  validPreviews(b.previews) &&
  (b.reset === true || b.mute !== undefined || b.previews !== undefined);

export const validScopeChange = (b = {}) =>
  SCOPES.includes(b.scope) &&
  (b.on === undefined || typeof b.on === 'boolean') &&
  (b.previews === undefined || typeof b.previews === 'boolean') &&
  (b.stories === undefined || typeof b.stories === 'boolean') &&
  (b.on !== undefined || b.previews !== undefined || b.stories !== undefined);

const scopeFields = (current, body) => {
  const fields = keptFields(current);
  if (body.on !== undefined) {
    fields.muteUntil = body.on ? 0 : MUTE_FOREVER;
  }
  if (body.previews !== undefined) {
    fields.showPreviews = body.previews;
  }
  if (body.stories !== undefined) {
    fields.storiesMuted = !body.stories;
  }
  return fields;
};

export const createNotifySettings = (env, { userClient }) => {
  const now = env.now ?? (() => Date.now());
  const read = (c, peer) =>
    c.client.invoke(new c.Api.account.GetNotifySettings({ peer }));
  const write = (c, peer, fields) =>
    c.client.invoke(
      new c.Api.account.UpdateNotifySettings({
        peer,
        settings: new c.Api.InputPeerNotifySettings(fields),
      })
    );

  const notifyOverview = async () =>
    connected(env, userClient, failure, (c) =>
      runIn(env, 'notify-settings', async () => {
        const nowMs = now();
        const scopes = {};
        for (const scope of SCOPES) {
          scopes[scope] = rowOf(
            await read(c, new c.Api[INPUT[scope]]()),
            nowMs
          );
        }
        const result = await c.client.invoke(
          new c.Api.account.GetNotifyExceptions({ compareSound: false })
        );
        const exceptions = (result?.updates ?? [])
          .filter((u) => u.className === 'UpdateNotifySettings')
          .map((u) => exceptionOf(result, u, nowMs))
          .filter(Boolean);
        return { ok: true, scopes, exceptions };
      })
    );

  const notifyScopeSet = async (body = {}) => {
    if (!validScopeChange(body)) {
      return BAD;
    }
    return connected(env, userClient, failure, (c) =>
      runIn(env, `notify-scope:${body.scope}`, async () => {
        const peer = new c.Api[INPUT[body.scope]]();
        const fields = scopeFields(await read(c, peer), body);
        await write(c, peer, fields);
        return { ok: true, scope: body.scope, ...rowOf(fields, now()) };
      })
    );
  };

  const chatRow = (chat, settings, nowMs) => {
    const until = Number(settings.muteUntil ?? 0);
    return {
      ok: true,
      chat,
      exception:
        settings.showPreviews !== undefined ||
        settings.muteUntil !== undefined ||
        settings.silent !== undefined,
      muteUntil: until * 1000 > nowMs ? until : 0,
      forever: until * 1000 - nowMs > FOREVER_MS,
      previews: bool(settings.showPreviews) ?? null,
      stories: settings.storiesMuted !== true,
    };
  };

  const withNotifyPeer = (c, chat, use) =>
    env.connection.withPeer(c.client, chat, (peer) =>
      use(new c.Api.InputNotifyPeer({ peer }))
    );

  const notifyChat = async ({ chat } = {}) => {
    if (!CHAT.test(String(chat ?? ''))) {
      return BAD;
    }
    const id = String(chat);
    return connected(env, userClient, failure, (c) =>
      runIn(env, `notify-chat:${id}`, async () =>
        chatRow(id, await withNotifyPeer(c, id, (peer) => read(c, peer)), now())
      )
    );
  };

  const notifyChatSet = async (body = {}) => {
    if (!validChatChange(body)) {
      return BAD;
    }
    const id = String(body.chat);
    return connected(env, userClient, failure, (c) =>
      runIn(env, `notify-chat:${id}`, async () => {
        const nowMs = now();
        const fields = await withNotifyPeer(c, id, async (peer) => {
          const next = body.reset
            ? {}
            : chatFields(await read(c, peer), body, nowMs);
          await write(c, peer, next);
          return next;
        });
        // The list follows at once, as it does for a mute from its menu.
        await env.live?.handle?.(c.client, {
          className: 'UpdateNotifySettings',
          peer: { className: 'NotifyPeer', peer: peerOfChat(id) },
          notifySettings: { muteUntil: fields.muteUntil ?? 0 },
        });
        return chatRow(id, fields, nowMs);
      })
    );
  };

  return { notifyOverview, notifyScopeSet, notifyChat, notifyChatSet };
};
