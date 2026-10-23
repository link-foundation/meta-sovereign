/**
 * Several usernames, as Telegram Desktop's profile and channel settings
 * show them (R-Y170; learned, never copied). A user or a channel may hold
 * collectible usernames besides the one edited by hand; each is a Username
 * (`editable`, `active`). `usernamesOf(list)` is that list as the page
 * keeps it. The two writes, both only on a click:
 * - `toggleUsername({ username, active, chat? })` — activate or deactivate
 *   one (account.toggleUsername; for a channel the user owns,
 *   channels.toggleUsername);
 * - `reorderUsernames({ order, chat? })` — the active usernames in a new
 *   order (account.reorderUsernames / channels.reorderUsernames).
 * The editable username is changed by the profile and chat editors.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  USERNAME_INVALID: 'username-invalid',
  USERNAMES_ACTIVE_TOO_MUCH: 'too-many',
  USERNAME_PURCHASE_AVAILABLE: 'username-invalid',
  CHAT_ADMIN_REQUIRED: 'no-access',
  CHANNEL_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const NAME = /^[A-Za-z0-9_]{1,32}$/;
export const CHANNEL = /^-100\d{1,20}$/;
export const MAX_NAMES = 100;

/** A Username list as `[{ username, editable, active }]`. */
export const usernamesOf = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((u) => u && typeof u.username === 'string' && u.username)
    .map((u) => ({
      username: u.username,
      editable: Boolean(u.editable),
      active: Boolean(u.active),
    }));

const bad = (code) => ({ ok: false, error: code, code });

// Telegram saying nothing changed is no failure.
const forgiving = (error) =>
  String(error?.errorMessage ?? error?.message ?? '').includes('_NOT_MODIFIED')
    ? { ok: true }
    : failure(error);

/** Whether `chat` is absent or a channel's id. */
const targetOk = (chat) =>
  chat === undefined || chat === null || CHANNEL.test(String(chat));

/** Whether `order` is 1 to 100 distinct usernames. */
export const validOrder = (order) =>
  Array.isArray(order) &&
  order.length >= 1 &&
  order.length <= MAX_NAMES &&
  order.every((n) => typeof n === 'string' && NAME.test(n)) &&
  new Set(order).size === order.length;

export const createUsernames = (env, { userClient }) => {
  // account.* for the user, channels.* for the channel given.
  const send = (c, chat, key, mine, theirs) =>
    runIn(env, key, () =>
      chat
        ? env.connection.withPeer(c.client, String(chat), (channel) =>
            c.client.invoke(theirs(channel))
          )
        : c.client.invoke(mine())
    );

  const toggleUsername = async ({ username, active, chat } = {}) => {
    if (
      !NAME.test(String(username ?? '')) ||
      typeof active !== 'boolean' ||
      !targetOk(chat)
    ) {
      return bad('username-invalid');
    }
    return connected(env, userClient, forgiving, async (c) => {
      await send(
        c,
        chat,
        `usernames:toggle:${chat ?? 'me'}`,
        () => new c.Api.account.ToggleUsername({ username, active }),
        (channel) =>
          new c.Api.channels.ToggleUsername({ channel, username, active })
      );
      return { ok: true };
    });
  };

  const reorderUsernames = async ({ order, chat } = {}) => {
    if (!validOrder(order) || !targetOk(chat)) {
      return bad('username-invalid');
    }
    return connected(env, userClient, forgiving, async (c) => {
      await send(
        c,
        chat,
        `usernames:reorder:${chat ?? 'me'}`,
        () => new c.Api.account.ReorderUsernames({ order }),
        (channel) => new c.Api.channels.ReorderUsernames({ channel, order })
      );
      return { ok: true };
    });
  };

  return { toggleUsername, reorderUsernames };
};
