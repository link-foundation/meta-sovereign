/**
 * Managing a channel or group, as Telegram Desktop's Edit has it (R-Y216;
 * learned, never copied):
 * - `channelUsernameCheck({ chat, username })` — channels.checkUsername
 *   → `{ ok, status: 'available' }`; USERNAME_INVALID, USERNAME_OCCUPIED
 *   and CHANNELS_ADMIN_PUBLIC_TOO_MUCH come back as codes;
 * - `channelUsernameSave({ chat, username })` — channels.updateUsername
 *   (an empty name makes the chat private);
 * - `publicChannels()` — channels.getAdminedPublicChannels → `{ ok,
 *   channels: [{ chat, title, username }] }`, for the limit's "Revoke link";
 * - `publicLinkRevoke({ chat })` — one of those channels made private;
 * - `usernamesDeactivate({ chat })` — channels.deactivateAllUsernames;
 * - `channelColorSave({ chat, forProfile, color?, emoji? })` —
 *   channels.updateColor (name colour or profile colour, with a background
 *   emoji); BOOSTS_REQUIRED comes back as `boosts`;
 * - `channelEmojiStatusSet({ chat, documentId|null, until? })` —
 *   channels.updateEmojiStatus;
 * - `inactiveChannels()` — channels.getInactiveChannels → `{ ok, channels:
 *   [{ chat, title, date, broadcast }] }`, for the "too many channels" case;
 * - `leaveChannels({ chats })` — channels.leaveChannel on the chosen ones,
 *   only those Telegram lists as inactive.
 * Deleting a chat is `removeChat` with the `destroy` action.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, runIn } from './telegram-stickers.js';
import { quietFailureOf } from './telegram-chat-settings.js';

const CODES = {
  USERNAME_INVALID: 'invalid',
  USERNAME_PURCHASE_AVAILABLE: 'taken',
  USERNAME_OCCUPIED: 'taken',
  USERNAME_NOT_MODIFIED: 'not-modified',
  CHANNELS_ADMIN_PUBLIC_TOO_MUCH: 'too-many-public',
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'not-modified',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  BOOSTS_REQUIRED: 'boosts',
  COLOR_INVALID: 'invalid',
  DOCUMENT_INVALID: 'invalid',
  EMOJI_STATUS_INVALID: 'invalid',
  FLOOD_WAIT: 'flood',
};

const failure = quietFailureOf(CODES);
const bad = (code = 'bad-request') => ({ ok: false, error: code, code });

const CHANNEL = /^-100\d{1,20}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]$/;
const EMOJI = /^\d{1,20}$/;
const MAX_COLOR = 20;
const MAX_LEAVE = 100;
const MAX_UNTIL_SECONDS = 366 * 24 * 3600;

const text = (value) => String(value?.value ?? value);
const idOf = (raw) => `-100${text(raw.id)}`;

const nameOk = (username) =>
  typeof username === 'string' && (username === '' || NAME.test(username));

const colorOk = ({ forProfile, color, emoji }) =>
  typeof forProfile === 'boolean' &&
  (color === undefined ||
    (Number.isInteger(color) && color >= 0 && color <= MAX_COLOR)) &&
  (emoji === undefined || EMOJI.test(String(emoji)));

const statusOk = (r, seconds) =>
  (r.documentId === null || EMOJI.test(String(r.documentId))) &&
  (r.until === undefined ||
    (Number.isInteger(r.until) &&
      r.until > seconds &&
      r.until <= seconds + MAX_UNTIL_SECONDS));

const publicOf = (raw) =>
  raw?.className === 'Channel'
    ? { chat: idOf(raw), title: raw.title ?? '', username: raw.username ?? '' }
    : null;

const inactiveOf = (answer) =>
  (answer?.chats ?? [])
    .map((raw, i) => ({ raw, date: Number(answer.dates?.[i]) || 0 }))
    .filter(({ raw }) => raw?.className === 'Channel');

// The shared helpers of the actions below.
const kitOf = (env, userClient) => {
  const ask = (c, key, request) =>
    runIn(env, `channel-manage:${key}`, () => c.client.invoke(request));
  const withChannel = (c, chat, use) =>
    runIn(env, `channel-manage:${chat}`, () =>
      env.connection.withPeer(c.client, chat, use)
    );
  // An action that runs `use(request)(c)` for a request that passed `valid`.
  const guarded = (valid, use) => async (request) =>
    valid(request ?? {})
      ? connected(env, userClient, failure, use(request ?? {}))
      : bad();
  // An action of one request on the chat's channel.
  const onChannel = (valid, make) =>
    guarded(
      (r) => CHANNEL.test(String(r.chat ?? '')) && valid(r),
      (r) => async (c) => {
        await withChannel(c, String(r.chat), (peer) =>
          c.client.invoke(make(c, peer, r))
        );
        return { ok: true };
      }
    );
  const plain = (use) => async () =>
    connected(env, userClient, failure, async (c) => ({
      ok: true,
      ...(await use(c)),
    }));
  const admined = async (c) =>
    (
      (await ask(c, 'admined', new c.Api.channels.GetAdminedPublicChannels({})))
        ?.chats ?? []
    ).filter((x) => x?.className === 'Channel');
  // The inactive channels Telegram lists, with their dates.
  const inactive = async (c) =>
    inactiveOf(
      await ask(c, 'inactive', new c.Api.channels.GetInactiveChannels())
    );
  return { ask, withChannel, guarded, onChannel, plain, admined, inactive };
};

const createPublicLink = ({
  ask,
  withChannel,
  guarded,
  onChannel,
  admined,
  plain,
}) => ({
  channelUsernameCheck: guarded(
    (r) => CHANNEL.test(String(r.chat ?? '')) && NAME.test(r.username ?? ''),
    (r) => async (c) => {
      const free = await withChannel(c, String(r.chat), (peer) =>
        c.client.invoke(
          new c.Api.channels.CheckUsername({
            channel: peer,
            username: r.username,
          })
        )
      );
      return free === false ? bad('taken') : { ok: true, status: 'available' };
    }
  ),
  channelUsernameSave: onChannel(
    (r) => nameOk(r.username),
    (c, peer, r) =>
      new c.Api.channels.UpdateUsername({
        channel: peer,
        username: r.username,
      })
  ),
  publicChannels: plain(async (c) => ({
    channels: (await admined(c)).map(publicOf).filter(Boolean),
  })),
  publicLinkRevoke: guarded(
    (r) => CHANNEL.test(String(r.chat ?? '')),
    (r) => async (c) => {
      const found = (await admined(c)).find((x) => idOf(x) === r.chat);
      if (!found) {
        return bad('no-access');
      }
      await ask(
        c,
        'revoke',
        new c.Api.channels.UpdateUsername({
          channel: new c.Api.InputChannel({
            channelId: found.id,
            accessHash: found.accessHash,
          }),
          username: '',
        })
      );
      return { ok: true };
    }
  ),
  usernamesDeactivate: onChannel(
    () => true,
    (c, peer) => new c.Api.channels.DeactivateAllUsernames({ channel: peer })
  ),
});

const createLook = (env, { onChannel }) => ({
  channelColorSave: onChannel(colorOk, (c, peer, r) => {
    const { forProfile, color, emoji } = r;
    return new c.Api.channels.UpdateColor({
      channel: peer,
      ...(forProfile ? { forProfile: true } : {}),
      ...(color === undefined ? {} : { color }),
      ...(emoji === undefined
        ? {}
        : { backgroundEmojiId: c.helpers.returnBigInt(String(emoji)) }),
    });
  }),
  channelEmojiStatusSet: onChannel(
    (r) => statusOk(r, (env.now ?? Date.now)() / 1000),
    (c, peer, r) =>
      new c.Api.channels.UpdateEmojiStatus({
        channel: peer,
        emojiStatus:
          r.documentId === null
            ? new c.Api.EmojiStatusEmpty()
            : new c.Api.EmojiStatus({
                documentId: c.helpers.returnBigInt(String(r.documentId)),
                ...(r.until === undefined ? {} : { until: r.until }),
              }),
      })
  ),
});

const createInactive = ({ ask, guarded, plain, inactive }) => ({
  inactiveChannels: plain(async (c) => ({
    channels: (await inactive(c)).map(({ raw, date }) => ({
      chat: idOf(raw),
      title: raw.title ?? '',
      date,
      broadcast: Boolean(raw.broadcast),
    })),
  })),
  leaveChannels: guarded(
    (r) =>
      Array.isArray(r.chats) &&
      r.chats.length > 0 &&
      r.chats.length <= MAX_LEAVE &&
      r.chats.every((x) => CHANNEL.test(String(x))),
    (r) => async (c) => {
      const listed = new Map(
        (await inactive(c)).map((x) => [idOf(x.raw), x.raw])
      );
      const left = [];
      for (const chat of new Set(r.chats.map(String))) {
        const raw = listed.get(chat);
        if (raw) {
          await ask(
            c,
            'leave',
            new c.Api.channels.LeaveChannel({
              channel: new c.Api.InputChannel({
                channelId: raw.id,
                accessHash: raw.accessHash,
              }),
            })
          );
          left.push(chat);
        }
      }
      return { ok: true, left };
    }
  ),
});

export const createChannelManage = (env, { userClient }) => {
  const kit = kitOf(env, userClient);
  return {
    ...createPublicLink(kit),
    ...createLook(env, kit),
    ...createInactive(kit),
  };
};
