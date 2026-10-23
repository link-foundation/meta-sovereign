/**
 * A forum group's topics, as Telegram's apps show them (R-Y122; Telegram
 * Desktop's forum, learned, never copied):
 *
 * - `forumTopics({ chat })` — `{ ok, forum, topics }`: the topics
 *   (messages.getForumTopics), pinned first, each `{ id, title,
 *   iconColor, iconEmojiId, top, unread, readInboxMaxId, mentions,
 *   pinned, closed,
 *   hidden, at, last }`, `last` the topic's newest message (stored as
 *   any read one is). A group that is not a forum: `forum: false`. Kept
 *   for a little while, so the page can ask as often as it shows them.
 * - `topicHistory({ chat, topic, before, limit })` — `{ written,
 *   complete }`: a topic's newest messages, or the page before message
 *   `before` (messages.getReplies on the topic's first message), stored;
 *   the page reads them from the store by the topic's key.
 */

import { GENERAL_TOPIC } from '../web/forum-topics.js';

const KEEP_MS = 15_000;
const TOPICS_LIMIT = 100;

const text = (value) =>
  value === null || value === undefined ? null : String(value.value ?? value);

const iso = (date) =>
  date ? new Date(Number(date) * 1000).toISOString() : null;

const notForum = (error) =>
  /CHANNEL_FORUM_MISSING|CHANNEL_INVALID|CHAT_ID_INVALID/.test(
    `${error?.errorMessage ?? ''} ${error?.message ?? ''}`
  );

/** One ForumTopic as the page shows it; null for a deleted one. */
export const topicOf = (topic, last = null) => {
  if (topic?.className !== 'ForumTopic') {
    return null;
  }
  const color = Number(topic.iconColor);
  return {
    id: Number(topic.id),
    title: String(topic.title ?? ''),
    iconColor: Number.isFinite(color) ? color : null,
    iconEmojiId: text(topic.iconEmojiId),
    top: Number(topic.topMessage) || 0,
    unread: Number(topic.unreadCount) || 0,
    readInboxMaxId: Number(topic.readInboxMaxId) || 0,
    mentions: Number(topic.unreadMentionsCount) || 0,
    pinned: Boolean(topic.pinned),
    closed: Boolean(topic.closed),
    mine: Boolean(topic.my),
    hidden: Boolean(topic.hidden),
    at: iso(topic.date),
    last,
  };
};

// Telegram's order, the pinned first (as listed among themselves).
const pinnedFirst = (topics) => [
  ...topics.filter((t) => t.pinned),
  ...topics.filter((t) => !t.pinned),
];

// A topic's newest message as the row under its name.
const lastOf = (link) =>
  link
    ? {
        id: link.id,
        body: String(link.body ?? ''),
        at: link.timestamp ?? null,
        mine: link.sender === 'me',
        senderName: link.senderName ?? null,
      }
    : null;

/**
 * `env` is the account's; `userClient()` the user client or null;
 * `dialogOf(chat)` the chat as listed; `tools` its `toLinks` and
 * `writeChanged`.
 */
export const createForum = (
  env,
  { userClient, dialogOf, tools },
  { now = () => Date.now() } = {}
) => {
  const kept = new Map(); // chat -> { at, answer }
  const asking = new Map(); // chat -> the answer coming

  const ask = async (target) => {
    const client = await userClient();
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    let answer;
    try {
      answer = await env.queue.run(`forum-topics:${target}`, 'view', () =>
        env.connection.withPeer(client, target, (peer) =>
          client.invoke(
            new Api.messages.GetForumTopics({
              peer,
              offsetDate: 0,
              offsetId: 0,
              offsetTopic: 0,
              limit: TOPICS_LIMIT,
            })
          )
        )
      );
    } catch (error) {
      if (notForum(error)) {
        const plain = { ok: true, forum: false, topics: [] };
        kept.set(target, { at: now(), answer: plain });
        return plain;
      }
      throw error;
    }
    const messages = [...(answer?.messages ?? [])].filter(
      (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
    );
    const links = tools.toLinks(await dialogOf(target), messages);
    await tools.writeChanged(env.store, links);
    const byId = new Map(links.map((l) => [Number(l.id.split(':').at(-1)), l]));
    const topics = pinnedFirst(
      [...(answer?.topics ?? [])]
        .map((t) => topicOf(t, lastOf(byId.get(Number(t?.topMessage)))))
        .filter(Boolean)
    );
    const result = { ok: true, forum: true, topics };
    kept.set(target, { at: now(), answer: result });
    return result;
  };

  const forumTopics = async ({ chat, fresh = false } = {}) => {
    if (!chat || !String(chat).startsWith('-100')) {
      return { ok: true, forum: false, topics: [] };
    }
    const target = String(chat);
    const entry = kept.get(target);
    if (!fresh && entry && now() - entry.at < KEEP_MS) {
      return entry.answer;
    }
    if (!asking.has(target)) {
      asking.set(
        target,
        ask(target).finally(() => asking.delete(target))
      );
    }
    return asking.get(target);
  };

  const topicHistory = async ({
    chat,
    topic,
    before = null,
    limit = 50,
    priority = 'view',
  } = {}) => {
    const id = Number(topic);
    const client =
      chat && Number.isInteger(id) && id > 0 ? await userClient() : null;
    if (!client) {
      return { written: 0 };
    }
    const target = String(chat);
    const offset = Number(before);
    const page = await env.queue.run(
      `replies:${target}:${id}:${offset || 0}`,
      priority,
      () =>
        env.connection.withPeer(client, target, (peer) =>
          client.getMessages(peer, {
            replyTo: id,
            limit,
            ...(Number.isInteger(offset) && offset > 0
              ? { offsetId: offset }
              : {}),
          })
        )
    );
    const messages = [...(page ?? [])].filter(
      (m) => m && m.id !== undefined && m.className !== 'MessageEmpty'
    );
    const written = await tools.writeChanged(
      env.store,
      tools.toLinks(await dialogOf(target), messages)
    );
    // The topic's first message is its start (General has none: a short
    // page is).
    const reachedStart =
      messages.length < limit ||
      (id !== GENERAL_TOPIC && messages.some((m) => Number(m.id) === id));
    return { written, cached: false, complete: reachedStart };
  };

  return { forumTopics, topicHistory };
};
