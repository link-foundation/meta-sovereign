/**
 * Similar channels, as Telegram Desktop shows them in a channel's info
 * (R-Y166; learned, never copied):
 * - `similarChannels({ chat })` — the channels Telegram recommends beside
 *   a channel (channels.getChannelRecommendations) → `{ ok, channels:
 *   [{ chat (-100…), title, username, members, broadcast }] }`. Read only.
 * - `similarJoin({ chat })` — joins a channel (channels.joinChannel); only
 *   ever asked for by the explicit Join click on a channel's preview →
 *   `{ ok, chat }`.
 * Answers are kept five minutes by channel. Errors become codes.
 */

import { connected, runIn, failureOf } from './telegram-stickers.js';

const CODES = {
  CHANNEL_INVALID: 'not-found',
  CHANNEL_PRIVATE: 'private',
  CHANNELS_TOO_MUCH: 'too-many',
  INVITE_REQUEST_SENT: 'request-sent',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const CHANNEL = /^-100\d{1,15}$/;
const KEEP_MS = 5 * 60_000;

const textOf = (value) => String(value?.value ?? value);

/** A channel Telegram sent as the page lists it; null for any other chat. */
export const similarOf = (raw) =>
  raw?.className === 'Channel'
    ? {
        chat: `-100${textOf(raw.id)}`,
        title: raw.title ?? '',
        username: raw.username ?? null,
        members: raw.participantsCount ?? null,
        broadcast: Boolean(raw.broadcast),
      }
    : null;

export const createSimilarChannels = (env, { userClient }) => {
  const kept = new Map(); // chat -> { at, channels }
  const now = env.now ?? Date.now;

  const similarChannels = async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHANNEL.test(chat)) {
      return BAD;
    }
    const have = kept.get(chat);
    if (have && now() - have.at < KEEP_MS) {
      return { ok: true, channels: have.channels };
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, `similar:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.GetChannelRecommendations({ channel: peer })
          )
        )
      );
      const channels = (answer?.chats ?? []).map(similarOf).filter(Boolean);
      kept.set(chat, { at: now(), channels });
      return { ok: true, channels };
    });
  };

  const similarJoin = async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHANNEL.test(chat)) {
      return BAD;
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `similar-join:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(new c.Api.channels.JoinChannel({ channel: peer }))
        )
      );
      return { ok: true, chat };
    });
  };

  return { similarChannels, similarJoin };
};
