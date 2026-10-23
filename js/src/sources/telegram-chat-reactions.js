/**
 * Which reactions a group or channel allows, as Telegram Desktop's
 * "Reactions" in Manage group / channel (R-Y160; learned, never copied):
 * - `availableReactions()` — the emoji reactions Telegram offers
 *   (messages.getAvailableReactions, the inactive ones left out), kept in
 *   memory for ten minutes → `{ ok, reactions: [{ emoji, title, premium }] }`;
 * - `chatReactionsSet({ chat, mode, reactions? })` — the chat's setting
 *   (messages.setChatAvailableReactions): `mode` is 'all', 'some' (with
 *   1 to 100 emoji of at most 16 characters) or 'none' → `{ ok }`.
 * `reactionsOf(full)` reads the setting off a ChatFull / ChannelFull
 * (for the chat info) and `canReactIn(entity)` says who may change it:
 * the chat's creator, or an admin with the right to change info.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'not-modified',
  REACTION_INVALID: 'reaction-invalid',
  REACTIONS_TOO_MANY: 'reaction-invalid',
  PEER_ID_INVALID: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
};

const asFailure = failureOf(CODES);
// Nothing to change is no failure.
const failure = (error) => {
  const out = asFailure(error);
  return out.code === 'not-modified' ? { ok: true } : out;
};
const bad = { ok: false, error: 'bad request', code: 'bad-request' };

export const MODES = Object.freeze(['all', 'some', 'none']);
export const MAX_REACTIONS = 100;
export const MAX_EMOJI_LENGTH = 16;
const CHAT = /^-\d{1,20}$/;
const KEEP_MS = 10 * 60_000;

/** Whether the user may change the chat's reactions (not a person's chat). */
export const canReactIn = (entity = {}) =>
  Boolean(entity.creator || entity.adminRights?.changeInfo);

/**
 * The setting a full chat carries: `{ mode: 'all' }`, `{ mode: 'none' }` or
 * `{ mode: 'some', emojis }`; a chat that says nothing allows all.
 */
export const reactionsOf = (full) => {
  const set = full?.availableReactions;
  if (set?.className === 'ChatReactionsNone') {
    return { mode: 'none' };
  }
  if (set?.className === 'ChatReactionsSome') {
    const emojis = (set.reactions ?? [])
      .filter((r) => typeof r?.emoticon === 'string')
      .map((r) => r.emoticon);
    return { mode: 'some', emojis };
  }
  return { mode: 'all' };
};

/** Whether `emojis` is 1 to 100 distinct short strings. */
export const validEmojis = (emojis) =>
  Array.isArray(emojis) &&
  emojis.length >= 1 &&
  emojis.length <= MAX_REACTIONS &&
  new Set(emojis).size === emojis.length &&
  emojis.every(
    (e) => typeof e === 'string' && e && e.length <= MAX_EMOJI_LENGTH
  );

/** Whether a body is a valid `{ chat, mode, reactions? }`. */
export const validSetting = (body = {}) =>
  CHAT.test(String(body.chat ?? '')) &&
  MODES.includes(body.mode) &&
  (body.mode === 'some'
    ? validEmojis(body.reactions)
    : body.reactions === undefined);

const listOf = (answer) =>
  (answer?.reactions ?? [])
    .filter((r) => !r.inactive && typeof r.reaction === 'string')
    .map((r) => ({
      emoji: r.reaction,
      title: String(r.title ?? ''),
      premium: Boolean(r.premium),
    }));

const createAvailable = (env, userClient, now) => {
  let kept = null; // { at, reactions }
  return async () => {
    if (kept && now() - kept.at < KEEP_MS) {
      return { ok: true, reactions: kept.reactions };
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, 'chat-reactions:available', () =>
        c.client.invoke(new c.Api.messages.GetAvailableReactions({ hash: 0 }))
      );
      const reactions = listOf(answer);
      kept = { at: now(), reactions };
      return { ok: true, reactions };
    });
  };
};

const chatReactionsOf = (c, { mode, reactions }) => {
  if (mode === 'none') {
    return new c.Api.ChatReactionsNone();
  }
  if (mode === 'all') {
    return new c.Api.ChatReactionsAll({ allowCustom: false });
  }
  return new c.Api.ChatReactionsSome({
    reactions: reactions.map(
      (emoticon) => new c.Api.ReactionEmoji({ emoticon })
    ),
  });
};

const createSet = (env, userClient) => async (body) => {
  if (!validSetting(body)) {
    return bad;
  }
  return connected(env, userClient, failure, async (c) => {
    await runIn(env, `chat-reactions:set:${body.chat}`, () =>
      env.connection.withPeer(c.client, body.chat, (peer) =>
        c.client.invoke(
          new c.Api.messages.SetChatAvailableReactions({
            peer,
            availableReactions: chatReactionsOf(c, body),
          })
        )
      )
    );
    return { ok: true };
  });
};

export const createChatReactions = (env, context) => ({
  availableReactions: createAvailable(
    env,
    context.userClient,
    env.now ?? Date.now
  ),
  chatReactionsSet: createSet(env, context.userClient),
});
