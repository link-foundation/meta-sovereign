/**
 * Profile extras, as Telegram Desktop has them (R-Y178; learned, never
 * copied): a birthday, a name colour and a profile colour (Premium), a
 * personal channel — the user's own, and other people's on their profiles.
 * - `profileExtras()` → `{ ok, premium, birthday, color, profileColor,
 *   personalChannel }` from users.getFullUser of the user; a colour is
 *   `{ color, emoji }` (the palette index and the background emoji's
 *   document id as a decimal string) or null, a birthday `{ day, month,
 *   year? }`, the personal channel `{ chat, title }`.
 * - `birthdaySave({ day, month, year? } | { remove: true })` —
 *   account.updateBirthday.
 * - `colors()` → `{ ok, name, profile }`: help.getPeerColors and
 *   help.getPeerProfileColors (kept by their hash for the session), each
 *   option `{ id, colors, dark? }` with `#rrggbb` strings.
 * - `colorSave({ forProfile, color?, emoji? })` — account.updateColor;
 *   neither colour nor emoji removes it. Premium only: the code `premium`.
 * - `personalChannels()` → `{ ok, channels }` — channels.getAdminedPublicChannels
 *   with `forPersonal`; `personalChannelSave({ chat } | { remove: true })` —
 *   account.updatePersonalChannel with one of those channels.
 * - `personalChannelCard({ chat })` → `{ ok, card: null | { chat, title,
 *   username, members, message } }` — a person's personal channel with its
 *   latest post (the one UserFull names), read-only.
 * - `birthdays()` → `{ ok, birthdays: [{ chat, name, day, month, year? }] }`
 *   — contacts.getBirthdays, the contacts whose birthday is today or soon.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  BIRTHDAY_INVALID: 'birthday-invalid',
  CHANNEL_INVALID: 'no-channel',
  CHANNELS_ADMIN_PUBLIC_TOO_MUCH: 'no-channel',
  PEER_ID_INVALID: 'no-user',
  USER_ID_INVALID: 'no-user',
  COLOR_INVALID: 'color-invalid',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const bad = (code) => ({ ok: false, error: code, code });
const text = (value) => String(value?.value ?? value);
const USER = /^\d{1,20}$/;
const EMOJI = /^\d{1,20}$/;
export const MAX_COLOR = 20;
export const BIRTHDAY_DAYS = 7;

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Whether `{ day, month, year? }` is a date that can exist. */
export const validBirthday = (b) =>
  Number.isInteger(b?.month) &&
  b.month >= 1 &&
  b.month <= 12 &&
  Number.isInteger(b.day) &&
  b.day >= 1 &&
  b.day <= DAYS[b.month - 1] &&
  (b.year === undefined ||
    (Number.isInteger(b.year) &&
      b.year >= 1900 &&
      b.year <= 2100 &&
      (b.day !== 29 || b.month !== 2 || b.year % 4 === 0)));

/** `{ day, month, year? }` of a Birthday, else null. */
export const birthdayOf = (raw) =>
  Number.isInteger(raw?.day) && Number.isInteger(raw?.month)
    ? {
        day: raw.day,
        month: raw.month,
        ...(Number.isInteger(raw.year) && raw.year > 0
          ? { year: raw.year }
          : {}),
      }
    : null;

/** `{ color, emoji }` of a PeerColor (a collectible has only its emoji). */
export const colorOf = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const color = Number.isInteger(raw.color) ? raw.color : null;
  const emoji =
    raw.backgroundEmojiId === undefined || raw.backgroundEmojiId === null
      ? null
      : text(raw.backgroundEmojiId);
  return color === null && emoji === null ? null : { color, emoji };
};

const hex = (n) => `#${(Number(n) & 0xffffff).toString(16).padStart(6, '0')}`;

// The colours of one set: a name colour's list, a profile colour's
// palette and background colours.
const setColors = (set) => {
  const list = set?.bgColors?.length
    ? set.bgColors
    : (set?.paletteColors ?? set?.colors);
  return Array.isArray(list) && list.length > 0 ? list.map(hex) : null;
};

/** `{ id, colors, dark? }` of the options of help.peerColors; hidden dropped. */
export const optionsOf = (answer) =>
  (answer?.colors ?? [])
    .filter((o) => o && !o.hidden && Number.isInteger(o.colorId))
    .map((o) => {
      const colors = setColors(o.colors);
      const dark = setColors(o.darkColors);
      return colors
        ? { id: o.colorId, colors, ...(dark ? { dark } : {}) }
        : null;
    })
    .filter(Boolean);

const postOf = (message) => {
  if (!message || message.className === 'MessageEmpty') {
    return null;
  }
  const body = String(message.message ?? '');
  return { id: Number(message.id), text: body.slice(0, 280) };
};

const channelOf = (raw) =>
  raw?.className === 'Channel'
    ? {
        chat: `-100${text(raw.id)}`,
        title: raw.title ?? '',
        username: raw.username ?? '',
        members: Number.isInteger(raw.participantsCount)
          ? raw.participantsCount
          : null,
      }
    : null;

/**
 * Whole days from `now` to the next `day`/`month` (0: today); a 29
 * February in a year without one falls on 1 March, as Date does.
 */
export const daysUntil = (birthday, now) => {
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const days = Math.round(
      (Date.UTC(year, birthday.month - 1, birthday.day) - base) / 86_400_000
    );
    if (days >= 0) {
      return days;
    }
  }
  return Infinity;
};

const ask = (env, c, key, request) =>
  runIn(env, key, () => c.client.invoke(request));

// The full user of `id` with the user entity and the chats named.
const fullOf = async (env, c, id) => {
  const answer = await ask(
    env,
    c,
    'profile-extras:user',
    new c.Api.users.GetFullUser({ id })
  );
  const users = answer?.users ?? [];
  const self = id.className === 'InputUserSelf';
  const user =
    users.find((u) => (self ? u?.self : text(u?.id) === text(id.userId))) ??
    users[0] ??
    {};
  return { full: answer?.fullUser ?? {}, user, chats: answer?.chats ?? [] };
};

const personalOf = (f, chats) =>
  channelOf(chats.find((x) => text(x?.id) === text(f.personalChannelId ?? '')));

const createOwn = (env, userClient) => ({
  profileExtras: async () =>
    connected(env, userClient, failure, async (c) => {
      const {
        full: f,
        user,
        chats,
      } = await fullOf(env, c, new c.Api.InputUserSelf());
      const channel = personalOf(f, chats);
      return {
        ok: true,
        premium: Boolean(user.premium),
        birthday: birthdayOf(f.birthday),
        color: colorOf(user.color),
        profileColor: colorOf(user.profileColor),
        personalChannel: channel
          ? { chat: channel.chat, title: channel.title }
          : null,
      };
    }),
  birthdaySave: async (request = {}) => {
    const remove = request.remove === true;
    if (!remove && !validBirthday(request)) {
      return bad('birthday-invalid');
    }
    return connected(env, userClient, failure, async (c) => {
      const { day, month, year } = request;
      await ask(
        env,
        c,
        'profile-extras:birthday',
        new c.Api.account.UpdateBirthday(
          remove
            ? {}
            : {
                birthday: new c.Api.Birthday({
                  day,
                  month,
                  ...(year === undefined ? {} : { year }),
                }),
              }
        )
      );
      return { ok: true };
    });
  },
});

const colorRefused = ({ forProfile, color, emoji }) =>
  typeof forProfile !== 'boolean' ||
  (color !== undefined &&
    !(Number.isInteger(color) && color >= 0 && color <= MAX_COLOR)) ||
  (emoji !== undefined && !EMOJI.test(String(emoji)));

// The PeerColor to set; nothing when neither colour nor emoji is given.
const peerColorOf = (c, { color, emoji }) =>
  color === undefined && emoji === undefined
    ? {}
    : {
        color: new c.Api.PeerColor({
          ...(color === undefined ? {} : { color }),
          ...(emoji === undefined
            ? {}
            : { backgroundEmojiId: c.helpers.returnBigInt(emoji) }),
        }),
      };

const createColors = (env, userClient) => {
  const kept = { name: null, profile: null };
  const palette = async (c, which) => {
    const Method =
      which === 'name'
        ? c.Api.help.GetPeerColors
        : c.Api.help.GetPeerProfileColors;
    const answer = await ask(
      env,
      c,
      `profile-extras:${which}`,
      new Method({ hash: kept[which]?.hash ?? 0 })
    );
    if (answer?.className === 'help.PeerColorsNotModified' && kept[which]) {
      return kept[which].options;
    }
    const options = optionsOf(answer);
    kept[which] = { hash: Number(answer?.hash) || 0, options };
    return options;
  };
  return {
    profileColors: async () =>
      connected(env, userClient, failure, async (c) => ({
        ok: true,
        name: await palette(c, 'name'),
        profile: await palette(c, 'profile'),
      })),
    colorSave: async (request = {}) =>
      colorRefused(request)
        ? bad('color-invalid')
        : connected(env, userClient, failure, async (c) => {
            await ask(
              env,
              c,
              'profile-extras:color',
              new c.Api.account.UpdateColor({
                ...(request.forProfile ? { forProfile: true } : {}),
                ...peerColorOf(c, request),
              })
            );
            return { ok: true };
          }),
  };
};

const createChannels = (env, userClient) => {
  const admined = async (c) => {
    const answer = await ask(
      env,
      c,
      'profile-extras:channels',
      new c.Api.channels.GetAdminedPublicChannels({ forPersonal: true })
    );
    return (answer?.chats ?? []).filter((x) => x?.className === 'Channel');
  };
  // The InputChannel of one of the user's public channels, or null.
  const inputOf = async (c, chat) => {
    const found = (await admined(c)).find((x) => `-100${text(x.id)}` === chat);
    return found
      ? new c.Api.InputChannel({
          channelId: found.id,
          accessHash: found.accessHash,
        })
      : null;
  };
  return {
    personalChannels: async () =>
      connected(env, userClient, failure, async (c) => ({
        ok: true,
        channels: (await admined(c)).map(channelOf).filter(Boolean),
      })),
    personalChannelSave: async (request = {}) => {
      const remove = request.remove === true;
      const chat = String(request.chat ?? '');
      if (!remove && !/^-100\d{1,20}$/.test(chat)) {
        return bad('no-channel');
      }
      return connected(env, userClient, failure, async (c) => {
        const channel = remove
          ? new c.Api.InputChannelEmpty()
          : await inputOf(c, chat);
        if (!channel) {
          return bad('no-channel');
        }
        await ask(
          env,
          c,
          'profile-extras:personal',
          new c.Api.account.UpdatePersonalChannel({ channel })
        );
        return { ok: true };
      });
    },
  };
};

// A person's personal channel: its entity, subscribers, the post named.
const cardOf = async (env, c, chat) => {
  const id = await env.connection.withPeer(c.client, chat, (peer) =>
    inputUserOf(c, peer)
  );
  const { full: f, chats } = await fullOf(env, c, id);
  const channel = personalOf(f, chats);
  if (!channel) {
    return null;
  }
  const raw = chats.find((x) => `-100${text(x?.id)}` === channel.chat);
  const input = new c.Api.InputChannel({
    channelId: raw.id,
    accessHash: raw.accessHash,
  });
  const [messages, info] = await Promise.all([
    f.personalChannelMessage
      ? ask(
          env,
          c,
          'profile-extras:post',
          new c.Api.channels.GetMessages({
            channel: input,
            id: [new c.Api.InputMessageID({ id: f.personalChannelMessage })],
          })
        ).catch(() => null)
      : null,
    ask(
      env,
      c,
      'profile-extras:channel',
      new c.Api.channels.GetFullChannel({ channel: input })
    ).catch(() => null),
  ]);
  const members = info?.fullChat?.participantsCount;
  return {
    ...channel,
    members: Number.isInteger(members) ? members : channel.members,
    message: postOf((messages?.messages ?? [])[0]),
  };
};

const nameOfUser = (user, id) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  user.username ||
  id;

// The contacts whose birthday is within a week, nearest first.
const soonOf = (answer, today) => {
  const byId = new Map((answer?.users ?? []).map((u) => [text(u.id), u]));
  return (answer?.contacts ?? [])
    .map((entry) => {
      const birthday = birthdayOf(entry.birthday);
      const id = text(entry.contactId);
      const days = birthday ? daysUntil(birthday, today) : Infinity;
      return birthday && days <= BIRTHDAY_DAYS
        ? {
            chat: id,
            name: nameOfUser(byId.get(id) ?? {}, id),
            ...birthday,
            days,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.days - b.days);
};

const createPeople = (env, userClient) => ({
  personalChannelCard: async (request = {}) => {
    const chat = String(request.chat ?? '');
    if (!USER.test(chat)) {
      return bad('no-user');
    }
    return connected(env, userClient, failure, async (c) => ({
      ok: true,
      card: await cardOf(env, c, chat),
    }));
  },
  contactBirthdays: async () =>
    connected(env, userClient, failure, async (c) => {
      const answer = await ask(
        env,
        c,
        'profile-extras:birthdays',
        new c.Api.contacts.GetBirthdays()
      );
      const today = new Date((env.now ?? Date.now)());
      return { ok: true, birthdays: soonOf(answer, today) };
    }),
});

export const createProfileExtras = (env, { userClient }) => ({
  ...createOwn(env, userClient),
  ...createColors(env, userClient),
  ...createChannels(env, userClient),
  ...createPeople(env, userClient),
});
