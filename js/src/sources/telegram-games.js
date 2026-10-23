/**
 * HTML5 bot games, as Telegram Desktop shows them (R-Y190; learned, never
 * copied): `gameHighScores({ chat, id })` — a game message's high scores
 * (messages.getGameHighScores, asked as the user themself) →
 * `{ ok, scores: [{ pos, user, name, score, me }] }`, best first. Playing
 * itself is a bot button's press (messages.getBotCallbackAnswer with
 * `game`, in ./telegram-bots.js). Posting a score (setGameScore) is for
 * bots only and is not offered.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  MESSAGE_ID_INVALID: 'not-found',
  USER_BOT_REQUIRED: 'not-found',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
};

const failure = failureOf(CODES);

const CHAT = /^-?\d{1,20}$/;
const textOf = (value) => String(value?.value ?? value);

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

/** The scores of an answer, each named by the users sent along. */
export const scoresOf = (answer) => {
  const users = new Map((answer?.users ?? []).map((u) => [textOf(u.id), u]));
  return (answer?.scores ?? []).map((one) => {
    const user = textOf(one.userId);
    return {
      pos: Number(one.pos) || 0,
      user,
      name: nameOf(users.get(user)) || user,
      score: Number(one.score) || 0,
      me: Boolean(users.get(user)?.self),
    };
  });
};

export const createGames = (env, context) => ({
  gameHighScores: async ({ chat, id } = {}) => {
    if (!CHAT.test(String(chat ?? '')) || !(Number(id) > 0)) {
      return { ok: false, error: 'bad request', code: 'failed' };
    }
    return connected(env, context.userClient, failure, async (c) => {
      const answer = await runIn(env, `game-scores:${chat}:${id}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.GetGameHighScores({
              peer,
              id: Number(id),
              userId: new c.Api.InputUserSelf(),
            })
          )
        )
      );
      return { ok: true, scores: scoresOf(answer) };
    });
  },
});
