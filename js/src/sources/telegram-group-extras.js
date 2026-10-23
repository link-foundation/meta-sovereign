/**
 * A supergroup's own sticker set and emoji pack, and the account's "New
 * contacts joined Telegram" notification, as Telegram Desktop has them
 * (R-Y211; learned, never copied):
 *
 * - `groupStickerSet({ chat, shortName, emojis? })` — channels.setStickers
 *   with the set named by its short name (InputStickerSetShortName), or
 *   InputStickerSetEmpty with `shortName` null to remove it; `emojis`
 *   sets the group's emoji pack instead (channels.setEmojiStickers). The
 *   preview of a set before saving is the sticker box's
 *   (`stickerSetBox({ shortName })`, messages.getStickerSet);
 * - `contactSignUpGet()` — account.getContactSignUpNotification → `{ ok,
 *   on }` (the call answers whether notifications are silenced);
 * - `contactSignUpSet({ on })` — account.setContactSignUpNotification.
 * `groupStickersInfo(entity, full)` is what the chat info says about both.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn } from './telegram-stickers.js';
import { quietFailureOf } from './telegram-chat-settings.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'not-modified',
  STICKERSET_INVALID: 'unknown-set',
  PARTICIPANTS_TOO_FEW: 'too-few',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  BOOSTS_REQUIRED: 'boosts',
  FLOOD_WAIT: 'flood',
};

const failure = quietFailureOf(CODES);
const bad = () => ({ ok: false, error: 'bad-request', code: 'bad-request' });

export const CHANNEL = /^-100\d{1,20}$/;
export const SHORT_NAME = /^[A-Za-z0-9_]{1,64}$/;

const text = (value) => String(value?.value ?? value);

// A StickerSet as the page names it, or null.
const setOf = (set) =>
  set && set.id !== undefined
    ? {
        id: text(set.id),
        shortName: String(set.shortName ?? ''),
        title: String(set.title ?? ''),
        count: Number(set.count ?? 0),
      }
    : null;

/**
 * What a channel's info says about its sticker set and emoji pack: whether
 * the user may set them (the creator, or an admin who may change info, in
 * a supergroup the full channel allows it for) and the sets it has.
 */
export const groupStickersInfo = (entity = {}, full = {}) => {
  const may =
    !entity.broadcast &&
    Boolean(entity.creator || entity.adminRights?.changeInfo);
  return {
    canSetStickers: may && Boolean(full.canSetStickers),
    groupStickers: {
      stickers: setOf(full.stickerset),
      emojis: setOf(full.emojiset),
    },
  };
};

/** Whether `body` names a chat and a set (or none) to set. */
export const validGroupSet = (body = {}) =>
  CHANNEL.test(String(body.chat ?? '')) &&
  (body.shortName === null || SHORT_NAME.test(String(body.shortName))) &&
  (body.emojis === undefined || typeof body.emojis === 'boolean');

const createGroupSet =
  (env, userClient) =>
  async (body = {}) => {
    if (!validGroupSet({ ...body, shortName: body.shortName ?? null })) {
      return bad();
    }
    const chat = String(body.chat);
    const shortName = body.shortName ?? null;
    return connected(env, userClient, failure, async (c) => {
      const stickerset =
        shortName === null
          ? new c.Api.InputStickerSetEmpty()
          : new c.Api.InputStickerSetShortName({ shortName });
      const Request = body.emojis
        ? c.Api.channels.SetEmojiStickers
        : c.Api.channels.SetStickers;
      await runIn(env, `group-stickers:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(new Request({ channel: peer, stickerset }))
        )
      );
      return { ok: true };
    });
  };

export const createGroupExtras = (env, { userClient }) => ({
  groupStickerSet: createGroupSet(env, userClient),
  contactSignUpGet: async () =>
    connected(env, userClient, failure, async (c) => {
      const silent = await runIn(env, 'signup:get', () =>
        c.client.invoke(new c.Api.account.GetContactSignUpNotification())
      );
      return { ok: true, on: silent !== true };
    }),
  contactSignUpSet: async ({ on } = {}) =>
    typeof on !== 'boolean'
      ? bad()
      : connected(env, userClient, failure, async (c) => {
          await runIn(env, 'signup:set', () =>
            c.client.invoke(
              new c.Api.account.SetContactSignUpNotification({ silent: !on })
            )
          );
          return { ok: true, on };
        }),
});
