/**
 * Managing a forum group's topics, as Telegram Desktop does (R-Y153;
 * learned, never copied):
 * - `topicIcons()` — the emoji a topic may carry (the default topic icon
 *   stickers, messages.getStickerSet) → `{ ok, icons: [{ id, emoji }] }`;
 * - `createTopic({ chat, title, iconColor, iconEmojiId? })` — a new topic
 *   (messages.createForumTopic);
 * - `editTopic({ chat, topic, title?, iconEmojiId?, closed?, hidden? })` —
 *   rename, change the icon (`'0'` takes it off), close or reopen, hide or
 *   show General (messages.editForumTopic);
 * - `pinTopic({ chat, topic, pinned })` — messages.updatePinnedForumTopic;
 * - `deleteTopic({ chat, topic })` — the topic and its messages
 *   (messages.deleteTopicHistory, until Telegram has nothing left);
 * - `reorderTopics({ chat, order })` — the pinned topics in a new order
 *   (messages.reorderPinnedForumTopics with force, R-Y211);
 * - `toggleForum({ chat, enabled })` — a supergroup's Topics on or off
 *   (channels.toggleForum).
 * Telegram's errors become codes the page shows as text.
 */

import { TOPIC_COLORS } from '../web/forum-topics.js';
import { randomIdOf } from './telegram-send.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  CHAT_NOT_MODIFIED: 'not-modified',
  TOPIC_TITLE_EMPTY: 'title-empty',
  TOPIC_NOT_MODIFIED: 'not-modified',
  TOPIC_ID_INVALID: 'no-topic',
  TOPIC_CLOSED: 'closed',
  CHANNEL_FORUM_MISSING: 'no-forum',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
};

const asFailure = failureOf(CODES);
// Nothing to change is no failure.
const failure = (error) => {
  const out = asFailure(error);
  return out.code === 'not-modified' ? { ok: true } : out;
};
const bad = () => ({ ok: false, error: 'bad-request', code: 'bad-request' });

const CHANNEL = /^-100\d{1,20}$/;
const ID = /^\d{1,20}$/;
export const TITLE_MAX = 128;
export const GENERAL = 1;
export { TOPIC_COLORS };
const MAX_ROUNDS = 50;

const textOf = (value) => String(value?.value ?? value);
const topicId = (value) =>
  Number.isInteger(value) && value > 0 ? value : null;
const titleOf = (value) => {
  const title = typeof value === 'string' ? value.trim() : '';
  return title && Array.from(title).length <= TITLE_MAX ? title : null;
};
const emojiIdOf = (value) =>
  ID.test(String(value ?? '')) ? String(value) : null;

const createIcons = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'topic:icons', () =>
      c.client.invoke(
        new c.Api.messages.GetStickerSet({
          stickerset: new c.Api.InputStickerSetEmojiDefaultTopicIcons(),
          hash: 0,
        })
      )
    );
    const icons = (answer?.documents ?? []).flatMap((doc) => {
      const mark = (doc.attributes ?? []).find((a) => a.alt !== undefined);
      return mark?.alt ? [{ id: textOf(doc.id), emoji: String(mark.alt) }] : [];
    });
    return { ok: true, icons };
  });

const createCreate =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const title = titleOf(body.title);
    const emoji =
      body.iconEmojiId === undefined ? null : emojiIdOf(body.iconEmojiId);
    if (
      !CHANNEL.test(chat) ||
      !title ||
      !TOPIC_COLORS.includes(body.iconColor) ||
      (body.iconEmojiId !== undefined && !emoji)
    ) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `topic:create:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.CreateForumTopic({
              peer,
              title,
              iconColor: body.iconColor,
              ...(emoji ? { iconEmojiId: c.helpers.returnBigInt(emoji) } : {}),
              randomId: randomIdOf(null, 0, c.helpers),
            })
          )
        )
      );
      return { ok: true };
    });
  };

// The fields an edit may carry, each checked; null when one is wrong or
// none is given.
const editFields = (body) => {
  const out = {};
  if (body.title !== undefined) {
    out.title = titleOf(body.title);
  }
  if (body.iconEmojiId !== undefined) {
    out.iconEmojiId = emojiIdOf(body.iconEmojiId);
  }
  for (const key of ['closed', 'hidden']) {
    if (body[key] !== undefined) {
      out[key] = typeof body[key] === 'boolean' ? body[key] : null;
    }
  }
  const values = Object.values(out);
  return values.length > 0 && values.every((v) => v !== null) ? out : null;
};

const createEdit =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const topic = topicId(body.topic);
    const fields = editFields(body);
    if (!CHANNEL.test(chat) || !topic || !fields) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      const { iconEmojiId, ...rest } = fields;
      await runIn(env, `topic:edit:${chat}:${topic}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.EditForumTopic({
              peer,
              topicId: topic,
              ...rest,
              ...(iconEmojiId === undefined
                ? {}
                : { iconEmojiId: c.helpers.returnBigInt(iconEmojiId) }),
            })
          )
        )
      );
      return { ok: true };
    });
  };

const createPin =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const topic = topicId(body.topic);
    if (!CHANNEL.test(chat) || !topic || typeof body.pinned !== 'boolean') {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `topic:pin:${chat}:${topic}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.UpdatePinnedForumTopic({
              peer,
              topicId: topic,
              pinned: body.pinned,
            })
          )
        )
      );
      return { ok: true };
    });
  };

/** The pinned topics' new order: distinct topic ids, 1 to 100, else null. */
export const pinOrderOf = (order) =>
  Array.isArray(order) &&
  order.length > 0 &&
  order.length <= 100 &&
  order.every((id) => topicId(id) && id !== GENERAL) &&
  new Set(order).size === order.length
    ? order
    : null;

const createReorder =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const order = pinOrderOf(body.order);
    if (!CHANNEL.test(chat) || !order) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `topic:reorder:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.messages.ReorderPinnedForumTopics({
              peer,
              order,
              force: true,
            })
          )
        )
      );
      return { ok: true };
    });
  };

const createDelete =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const topic = topicId(body.topic);
    // General cannot be deleted.
    if (!CHANNEL.test(chat) || !topic || topic === GENERAL) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      // Telegram deletes in steps: asked again while it says more is left.
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const answer = await runIn(env, `topic:delete:${chat}:${topic}`, () =>
          env.connection.withPeer(c.client, chat, (peer) =>
            c.client.invoke(
              new c.Api.messages.DeleteTopicHistory({ peer, topMsgId: topic })
            )
          )
        );
        if (!Number(answer?.offset)) {
          break;
        }
      }
      return { ok: true };
    });
  };

const createToggle =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHANNEL.test(chat) || typeof body.enabled !== 'boolean') {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `topic:forum:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.ToggleForum({
              channel: peer,
              enabled: body.enabled,
              tabs: false,
            })
          )
        )
      );
      return { ok: true };
    });
  };

export const createTopicAdmin = (env, { userClient }) => ({
  topicIcons: createIcons(env, userClient),
  createTopic: createCreate(env, userClient),
  editTopic: createEdit(env, userClient),
  pinTopic: createPin(env, userClient),
  reorderTopics: createReorder(env, userClient),
  deleteTopic: createDelete(env, userClient),
  toggleForum: createToggle(env, userClient),
});
