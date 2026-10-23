/**
 * Reaction tags of Saved Messages, as Telegram Desktop has them (R-Y151;
 * learned, never copied): a saved message tagged with a reaction can be
 * found by it, and Premium accounts name the tags.
 * - `savedTags()` — messages.getSavedReactionTags → `{ ok, premium, tags:
 *   [{ reaction, title, count }] }`; a `reaction` is `{ emoji }` or
 *   `{ custom }` (a custom emoji's document id); `premium` says the
 *   account may rename tags;
 * - `savedTagSearch({ chat, reaction, offsetId? })` — the saved messages
 *   with that reaction (messages.search in the account's own chat,
 *   savedReaction, no filter), a page of 50, as the page's message links
 *   of the Saved Messages chat `chat`, oldest first → `{ ok, messages,
 *   more }`;
 * - `savedTagRename({ reaction, title })` — messages.updateSavedReactionTag
 *   (an empty title removes the name; at most TITLE_MAX characters;
 *   Premium only).
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

export const TITLE_MAX = 12;
export const TAG_PAGE = 50;

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  REACTION_INVALID: 'bad-reaction',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'bad-request' };
const text = (value) => String(value?.value ?? value ?? '');

/** Whether the page's reaction is `{ emoji }` or `{ custom }` and sane. */
export const validReaction = (r) =>
  Boolean(r) &&
  typeof r === 'object' &&
  ((typeof r.emoji === 'string' &&
    r.emoji.length > 0 &&
    r.emoji.length <= 32 &&
    r.custom === undefined) ||
    (typeof r.custom === 'string' &&
      /^\d{1,20}$/.test(r.custom) &&
      r.emoji === undefined));

const inputOf = (c, r) =>
  r.emoji === undefined
    ? new c.Api.ReactionCustomEmoji({
        documentId: c.helpers.returnBigInt(r.custom),
      })
    : new c.Api.ReactionEmoji({ emoticon: r.emoji });

// Telegram's reaction as the page's.
const shapeReaction = (reaction) => {
  if (reaction?.className === 'ReactionCustomEmoji') {
    return { custom: text(reaction.documentId) };
  }
  return reaction?.className === 'ReactionEmoji'
    ? { emoji: String(reaction.emoticon) }
    : null;
};

/** Telegram's tags as the page's list. */
export const tagsOf = (answer) =>
  (answer?.tags ?? [])
    .map((tag) => ({
      reaction: shapeReaction(tag.reaction),
      title: String(tag.title ?? ''),
      count: Number(tag.count ?? 0) || 0,
    }))
    .filter((tag) => tag.reaction);

const usable = (m) => m && m.id !== undefined && m.className !== 'MessageEmpty';

export const createSavedTags = (env, { userClient, tools }) => {
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));

  const savedTags = async () =>
    doing('saved-tags', async (c) => {
      const answer = await c.client.invoke(
        new c.Api.messages.GetSavedReactionTags({ hash: c.zero })
      );
      const me = await c.client.getMe?.().catch(() => null);
      return {
        ok: true,
        premium: Boolean(me?.premium),
        tags: tagsOf(answer),
      };
    });

  const savedTagSearch = async ({ chat, reaction, offsetId = 0 } = {}) =>
    !/^\d{1,20}$/.test(String(chat ?? '')) || !validReaction(reaction)
      ? BAD
      : doing(`saved-tag-search:${chat}`, async (c) => {
          const answer = await c.client.invoke(
            new c.Api.messages.Search({
              peer: new c.Api.InputPeerSelf(),
              q: '',
              savedReaction: [inputOf(c, reaction)],
              filter: new c.Api.InputMessagesFilterEmpty(),
              minDate: 0,
              maxDate: 0,
              offsetId,
              addOffset: 0,
              limit: TAG_PAGE,
              maxId: 0,
              minId: 0,
              hash: c.zero,
            })
          );
          const found = [...(answer?.messages ?? [])].filter(usable);
          const messages = found.sort((a, b) => Number(a.id) - Number(b.id));
          return {
            ok: true,
            messages: tools.toLinks(
              { id: String(chat), isUser: true },
              messages
            ),
            more: found.length >= TAG_PAGE,
          };
        });

  const savedTagRename = async ({ reaction, title } = {}) => {
    const name = typeof title === 'string' ? title.trim() : null;
    return name === null || name.length > TITLE_MAX || !validReaction(reaction)
      ? BAD
      : doing('saved-tag-rename', async (c) => {
          await c.client.invoke(
            new c.Api.messages.UpdateSavedReactionTag({
              reaction: inputOf(c, reaction),
              ...(name ? { title: name } : {}),
            })
          );
          return { ok: true, title: name };
        });
  };

  return { savedTags, savedTagSearch, savedTagRename };
};
