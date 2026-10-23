/**
 * The quick (double-tap) reaction, as Telegram Desktop's Settings → Chat
 * Settings → Quick reaction (R-Y206; learned, never copied):
 * - `quickReaction()` — the account's default reaction, read from
 *   help.getConfig (`reactions_default`) → `{ ok, emoji }`, `emoji` null
 *   when it is a custom emoji or none (the page then uses its own);
 * - `quickReactionSet({ emoji })` — a new one (messages.setDefaultReaction),
 *   remembered at once.
 * The emoji is a short string, as the chat reactions' are.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { MAX_EMOJI_LENGTH } from './telegram-chat-reactions.js';

const CODES = {
  REACTION_INVALID: 'reaction-invalid',
  REACTION_EMPTY: 'reaction-invalid',
};

const failure = failureOf(CODES);

/** The emoji a Reaction names, else null. */
export const emojiOf = (reaction) =>
  reaction?.className === 'ReactionEmoji' &&
  typeof reaction.emoticon === 'string'
    ? reaction.emoticon
    : null;

/** Whether `emoji` is one short string with no spaces. */
export const validEmoji = (emoji) =>
  typeof emoji === 'string' &&
  emoji.length > 0 &&
  emoji.length <= MAX_EMOJI_LENGTH &&
  !/\s/.test(emoji);

export const createQuickReaction = (env, { userClient }) => {
  const kept = { emoji: undefined };

  const quickReaction = async () => {
    if (kept.emoji !== undefined) {
      return { ok: true, emoji: kept.emoji };
    }
    return connected(env, userClient, failure, async (c) => {
      const config = await runIn(env, 'reactions:default', () =>
        c.client.invoke(new c.Api.help.GetConfig())
      );
      kept.emoji = emojiOf(config?.reactionsDefault);
      return { ok: true, emoji: kept.emoji };
    });
  };

  const quickReactionSet = async ({ emoji } = {}) => {
    if (!validEmoji(emoji)) {
      return { ok: false, error: 'bad request', code: 'bad-request' };
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, 'reactions:default-set', () =>
        c.client.invoke(
          new c.Api.messages.SetDefaultReaction({
            reaction: new c.Api.ReactionEmoji({ emoticon: emoji }),
          })
        )
      );
      kept.emoji = emoji;
      return { ok: true, emoji };
    });
  };

  return { quickReaction, quickReactionSet };
};
