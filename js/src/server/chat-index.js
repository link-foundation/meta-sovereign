/**
 * The chats in the store, so the page never needs every message
 * (R-Y29). The store keeps every message ever loaded — whole histories
 * once the background download has run — and the page asks for:
 *
 *   heads()            the newest message of each chat (the chat list);
 *   page(key, before)  a page of one chat, older than message `before`
 *                      (the chat the user reads, as they scroll back);
 *                      or newer than message `after`, or around a time
 *                      `at` (a jump to a date, R-Y106), or around
 *                      message `around` (a jump to a message, R-Y107).
 *                      A key `<chat key>#topic:<id>` pages one forum
 *                      topic's messages alone (R-Y122).
 *
 * The index holds a few numbers per message (id, time, network id), kept
 * current through the store's change feed. Its own feed marks a message
 * that arrives older than its chat's newest one as `quiet`: history read
 * in the background or ahead of the user, which the live event stream
 * leaves out (the page asks for it by page when it needs it).
 */

import { chatKey, networkMessageId } from '../web/chat-model.js';
import { isTombstone } from '../storage/soft-delete.js';
import { storedMessageTopic, storedReactions } from '../storage/raw-packing.js';
import {
  createFeedbackIndex,
  FEEDBACK_AUTHORS_PREFIX,
} from './feedback-index.js';
import { splitTopicKey, topicOfMessage } from '../web/forum-topics.js';

const isMessage = (link) =>
  typeof link?.id === 'string' &&
  link.id.startsWith('msg:') &&
  link.chat !== undefined &&
  link.chat !== null;
const feedbackProjection = (link) => ({
  id: link.id,
  source: link.source,
  chat: link.chat,
  sender: link.sender,
  timestamp: link.timestamp,
  chatType: link.chatType,
  outgoing: link.outgoing,
  deleted: link.deleted,
  feedback:
    link.sender === 'me' || link.outgoing === true
      ? (link.feedback ?? storedReactions(link))
      : null,
});

const entryOf = (link) => ({
  id: link.id,
  ts: String(link.timestamp ?? ''),
  num: networkMessageId(link) ?? 0,
  // Its forum topic (R-Y122): a topic is read by page as a chat is.
  topic: topicOfMessage(link),
});

// The chat's order: by time, then by the network's number (one second).
const order = (a, b) => a.ts.localeCompare(b.ts) || a.num - b.num;

const newestOf = (entries) => {
  let head = null;
  for (const entry of entries.values()) {
    if (!head || order(entry, head) > 0) {
      head = entry;
    }
  }
  return head;
};

// Where a page older than message `before` ends (exclusive).
const endBefore = async (store, sorted, before) => {
  if (!before) {
    return sorted.length;
  }
  const at = sorted.findIndex((e) => e.id === before);
  if (at >= 0) {
    return at;
  }
  const link = await store.get(before);
  if (!link) {
    return sorted.length;
  }
  const mark = entryOf(link);
  const after = sorted.findIndex((e) => order(e, mark) >= 0);
  return after < 0 ? sorted.length : after;
};

// Where a message (or the moment) a page is centred on stands.
const targetOf = async (store, sorted, { at, around }) => {
  if (around) {
    const held = sorted.findIndex((e) => e.id === around);
    if (held >= 0) {
      return held;
    }
    const link = await store.get(around);
    if (!link) {
      return -1;
    }
    return sorted.findIndex((e) => order(e, entryOf(link)) >= 0);
  }
  const mark = { ts: String(at), num: 0 };
  return sorted.findIndex((e) => order(e, mark) >= 0);
};

// `[start, end, target]` of the page asked for.
const boundsOf = async (store, sorted, range, limit) => {
  if (range.at || range.around) {
    const found = await targetOf(store, sorted, range);
    const from = found < 0 ? sorted.length : found;
    // Around a message the page stays full at the chat's end too.
    const last = range.around ? sorted.length - limit : from;
    const start = Math.max(0, Math.min(from - Math.floor(limit / 2), last));
    return [
      start,
      Math.min(sorted.length, start + limit),
      found < 0 ? null : sorted[found].id,
    ];
  }
  if (range.after) {
    let start = await endBefore(store, sorted, range.after);
    start += sorted[start]?.id === range.after ? 1 : 0;
    return [start, Math.min(sorted.length, start + limit)];
  }
  const end = await endBefore(store, sorted, range.before);
  return [Math.max(0, end - limit), end];
};

const indexStoreMessages = async (store, add) => {
  const indexBatch = (links) => links.forEach((link) => add(link));
  if (store.scan) {
    await store.scan(
      (link) => isMessage(link) || link.id?.startsWith(FEEDBACK_AUTHORS_PREFIX),
      500,
      indexBatch,
      (link) =>
        link.id?.startsWith(FEEDBACK_AUTHORS_PREFIX)
          ? link
          : {
              id: link.id,
              source: link.source,
              chat: link.chat,
              timestamp: link.timestamp,
              sender: link.sender,
              outgoing: link.outgoing,
              chatType: link.chatType,
              feedback:
                link.sender === 'me' || link.outgoing === true
                  ? storedReactions(link)
                  : null,
              topic: storedMessageTopic(link),
              deleted: isTombstone(link),
              versionCount: link.versionCount,
            }
    );
  } else {
    indexBatch(
      (
        await store.query(
          (link) =>
            isMessage(link) || link.id?.startsWith(FEEDBACK_AUTHORS_PREFIX)
        )
      ).map((link) =>
        isMessage(link)
          ? {
              ...feedbackProjection(link),
              topic: storedMessageTopic(link),
              versionCount: link.versionCount,
            }
          : link
      )
    );
  }
};

const sortedOf = (chat) => {
  chat.sorted ??= [...chat.entries.values()].sort(order);
  return chat.sorted;
};

// One topic's messages in order, kept until the chat changes.
const topicSortedOf = (chat, topic) => {
  const sorted = sortedOf(chat);
  if (chat.topicsOf !== sorted) {
    chat.topicsOf = sorted;
    chat.topics = new Map();
  }
  if (!chat.topics.has(topic)) {
    chat.topics.set(
      topic,
      sorted.filter((e) => e.topic === topic)
    );
  }
  return chat.topics.get(topic);
};

export const createChatIndex = (store, { log } = {}) => {
  const feedback = createFeedbackIndex(store, log);
  const chats = new Map(); // key -> { entries: Map, sorted, head }
  const listeners = new Set();
  let loaded = false;

  const chatOf = (key) => {
    let chat = chats.get(key);
    if (!chat) {
      chat = {
        entries: new Map(),
        sorted: null,
        head: null,
        gone: new Set(),
        edited: new Map(),
        revision: 0,
      };
      chats.set(key, chat);
    }
    return chat;
  };

  const remove = (chat, id) => {
    chat.gone.delete(id);
    chat.edited.delete(id);
    if (!chat.entries.delete(id)) {
      return;
    }
    chat.revision += 1;
    chat.sorted = null;
    if (chat.head?.id === id) {
      chat.head = newestOf(chat.entries);
    }
  };

  /** Index one message; `'old'` when it is a new one older than the head. */
  const add = (link, live = false) => {
    feedback.observe(
      isMessage(link) ? feedbackProjection(link) : link,
      false,
      live
    );
    if (!isMessage(link)) {
      return 'update';
    }
    const chat = chatOf(chatKey(link.source, link.chat));
    chat.revision += 1;
    const known = chat.entries.has(link.id);
    if (isTombstone(link)) {
      remove(chat, link.id);
      // Kept apart for the "deleted messages" view (R-Z7).
      chat.gone.add(link.id);
      if (Number(link.versionCount) > 1) {
        chat.edited.set(link.id, entryOf(link));
      }
      return 'update';
    }
    chat.gone.delete(link.id);
    const entry = entryOf(link);
    if (Number(link.versionCount) > 1) {
      chat.edited.set(link.id, entry);
    } else {
      chat.edited.delete(link.id);
    }
    chat.entries.set(link.id, entry);
    chat.sorted = null;
    if (!chat.head || order(entry, chat.head) >= 0) {
      chat.head = entry;
    } else if (chat.head.id === link.id) {
      chat.head = newestOf(chat.entries);
    }
    if (known) {
      return 'update';
    }
    return chat.head.id === link.id ? 'new' : 'old';
  };

  const onChange = (event) => {
    const link = event?.link;
    if (link?.id?.startsWith(FEEDBACK_AUTHORS_PREFIX)) {
      feedback.observe(link, event.type === 'delete');
    }
    let quiet = String(link?.id ?? '').startsWith('message-version:');
    if (isMessage(link)) {
      if (event.type === 'delete') {
        feedback.observe(feedbackProjection(link), true, true);
        remove(chatOf(chatKey(link.source, link.chat)), link.id);
      } else {
        quiet = add(link, true) === 'old' && loaded;
      }
    }
    for (const listener of listeners) {
      listener(quiet ? { ...event, quiet } : event);
    }
  };
  const unsubscribe = store.subscribe?.(onChange) ?? (() => {});

  const ready = (async () => {
    await indexStoreMessages(store, add);
    loaded = true;
  })();

  const linksOf = async (entries, project) =>
    (await Promise.all(entries.map((e) => store.get(e.id, project)))).filter(
      (link) => link && !isTombstone(link)
    );

  return {
    feedback,
    ready: () => ready,
    /** The store's change feed, with `quiet` on history read ahead. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The newest message of every chat. */
    async heads() {
      await ready;
      return linksOf(
        [...chats.values()].map((chat) => chat.head).filter(Boolean)
      );
    },
    /**
     * Up to `limit` messages of a chat, oldest first, older than message
     * `before` (the newest ones without it); `more` when the store holds
     * older ones still, `newer` when it holds newer ones. With `after`,
     * the ones newer than that message; with `at` (an ISO time), the
     * ones around it, `target` the first at or after it (null: none);
     * with `around` (a message's id), the ones around that message,
     * `target` it (or the first after it when the store lacks it).
     */
    async page(asked, range = {}) {
      await ready;
      const { key, topic } = splitTopicKey(asked);
      const chat = chats.get(key);
      if (!chat) {
        return { messages: [], more: false, newer: false, target: null };
      }
      const sorted = topic ? topicSortedOf(chat, topic) : sortedOf(chat);
      const limit = range.limit ?? 50;
      const [start, end, target] = await boundsOf(store, sorted, range, limit);
      return {
        messages: await linksOf(sorted.slice(start, end), range.project),
        more: start > 0,
        newer: end < sorted.length,
        ...(range.at || range.around ? { target } : {}),
      };
    },
    /** The ids of a chat's deleted (tombstoned) messages (R-Z7). */
    async deleted(key) {
      await ready;
      return [...(chats.get(key)?.gone ?? [])];
    },
    async edited(asked) {
      await ready;
      const { key, topic } = splitTopicKey(asked);
      return [...(chats.get(key)?.edited.values() ?? [])]
        .filter((entry) => !topic || String(entry.topic) === String(topic))
        .sort(order)
        .reverse()
        .map((entry) => entry.id);
    },
    /** How many messages of a chat the store holds. */
    count: (key) => chats.get(key)?.entries.size ?? 0,
    revision: (key) => chats.get(key)?.revision ?? 0,
    close: () => {
      unsubscribe();
      feedback.close();
    },
  };
};
