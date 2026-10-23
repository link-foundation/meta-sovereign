/**
 * Giveaways, as Telegram Desktop shows them (R-Y184; learned, never
 * copied). Read only: nothing here creates, joins or changes a giveaway.
 * - `giveawayInfo({ chat, id, channels?, winners? })` —
 *   payments.getGiveawayInfo of the giveaway message `id` in `chat` →
 *   `{ ok, ended: false, participating, preparing, startDate,
 *   joinedTooEarlyDate?, disallowedChat?, disallowedCountry? }` while it
 *   runs, or `{ ok, ended: true, winner, refunded, startDate, finishDate,
 *   winnersCount, activatedCount?, slug?, starsPrize? }` when it is over.
 *   `channels` and `winners` are ids from the card; their names come back
 *   as `channelNames` and `winnerNames` where we can read them (an id we
 *   cannot read stays out), at most MAX_NAMES each.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const MAX_NAMES = 100;

const CODES = {
  MESSAGE_ID_INVALID: 'no-message',
  PEER_ID_INVALID: 'no-chat',
  CHANNEL_INVALID: 'no-chat',
  CHANNEL_PRIVATE: 'no-chat',
  GIVEAWAY_NOT_FOUND: 'no-giveaway',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };
const CHAT = /^-?\d{1,20}$/;
const ID = /^\d{1,20}$/;
const text = (value) => String(value?.value ?? value ?? '');
const num = (value) => Number(value?.value ?? value ?? 0) || 0;

/** Whether `list` is absent or an array of at most MAX_NAMES numeric ids. */
export const validIds = (list) =>
  list === undefined ||
  (Array.isArray(list) &&
    list.length <= MAX_NAMES &&
    list.every((id) => ID.test(String(id))));

const endedInfo = (answer) => ({
  ended: true,
  winner: Boolean(answer.winner),
  refunded: Boolean(answer.refunded),
  startDate: num(answer.startDate),
  finishDate: num(answer.finishDate),
  winnersCount: num(answer.winnersCount),
  ...(answer.activatedCount === undefined
    ? {}
    : { activatedCount: num(answer.activatedCount) }),
  ...(answer.giftCodeSlug ? { slug: String(answer.giftCodeSlug) } : {}),
  ...(answer.starsPrize === undefined
    ? {}
    : { starsPrize: num(answer.starsPrize) }),
});

const runningInfo = (answer) => ({
  ended: false,
  participating: Boolean(answer?.participating),
  preparing: Boolean(answer?.preparingResults),
  startDate: num(answer?.startDate),
  ...(answer?.joinedTooEarlyDate
    ? { joinedTooEarlyDate: num(answer.joinedTooEarlyDate) }
    : {}),
  ...(answer?.adminDisallowedChatId
    ? { disallowedChat: `-100${text(answer.adminDisallowedChatId)}` }
    : {}),
  ...(answer?.disallowedCountry
    ? { disallowedCountry: String(answer.disallowedCountry) }
    : {}),
});

/** What Telegram's answer says, in the page's shape. */
export const infoOf = (answer) =>
  /GiveawayInfoResults$/.test(String(answer?.className))
    ? endedInfo(answer)
    : runningInfo(answer);

const nameOf = (entity) =>
  entity?.title ||
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  (entity?.username ? `@${entity.username}` : '');

// The names of ids we already know how to reach; the rest stay out.
const namesOf = async (env, c, ids, channel) => {
  const found = [];
  for (const id of (ids ?? []).slice(0, MAX_NAMES)) {
    try {
      const input = await env.peers.input(channel ? `-100${id}` : String(id));
      if (!input) {
        continue;
      }
      const answer = await c.client.invoke(
        channel
          ? new c.Api.channels.GetChannels({ id: [input] })
          : new c.Api.users.GetUsers({ id: [input] })
      );
      const name = nameOf(channel ? answer?.chats?.[0] : answer?.[0]);
      if (name) {
        found.push({ id: String(id), name });
      }
    } catch {
      // A name we cannot read is left out, never a failure.
    }
  }
  return found;
};

export const createGiveaways = (env, { userClient }) => ({
  giveawayInfo: async ({ chat, id, channels, winners } = {}) =>
    !CHAT.test(String(chat ?? '')) ||
    !Number.isInteger(id) ||
    id <= 0 ||
    !validIds(channels) ||
    !validIds(winners)
      ? BAD
      : connected(env, userClient, failure, async (c) => {
          const answer = await runIn(env, `giveaway:${chat}:${id}`, () =>
            env.connection.withPeer(c.client, String(chat), (peer) =>
              c.client.invoke(
                new c.Api.payments.GetGiveawayInfo({ peer, msgId: id })
              )
            )
          );
          return {
            ok: true,
            ...infoOf(answer),
            channelNames: await namesOf(env, c, channels, true),
            winnerNames: await namesOf(env, c, winners, false),
          };
        }),
});
