/**
 * The chats in the store, so the page never needs every message
 * (R-Y29). The store keeps every message ever loaded — whole histories
 * once the background download has run — and the page asks for:
 *
 *   heads()            the newest message of each chat (the chat list);
 *   page(key, before)  a page of one chat, older than message `before`
 *                      (the chat the user reads, as they scroll back);
 *                      or newer than message `after`, or around a time
 *                      `at` (a jump to a date, R-Y106).
 *
 * The index holds a few numbers per message (id, time, network id), kept
 * current through the store's change feed. Its own feed marks a message
 * that arrives older than its chat's newest one as `quiet`: history read
 * in the background or ahead of the user, which the live event stream
 * leaves out (the page asks for it by page when it needs it).
 */

import { chatKey, networkMessageId } from '../web/chat-model.js';

const isMessage = (link) =>
  typeof link?.id === 'string' &&
  link.id.startsWith('msg:') &&
  link.chat !== undefined &&
  link.chat !== null;

const entryOf = (link) => ({
  id: link.id,
  ts: String(link.timestamp ?? ''),
  num: networkMessageId(link) ?? 0,
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

export const createChatIndex = (store) => {
  const chats = new Map(); // key -> { entries: Map, sorted, head }
  const listeners = new Set();
  let loaded = false;

  const chatOf = (key) => {
    let chat = chats.get(key);
    if (!chat) {
      chat = { entries: new Map(), sorted: null, head: null };
      chats.set(key, chat);
    }
    return chat;
  };

  const remove = (chat, id) => {
    if (!chat.entries.delete(id)) {
      return;
    }
    chat.sorted = null;
    if (chat.head?.id === id) {
      chat.head = newestOf(chat.entries);
    }
  };

  /** Index one message; `'old'` when it is a new one older than the head. */
  const add = (link) => {
    const chat = chatOf(chatKey(link.source, link.chat));
    const known = chat.entries.has(link.id);
    if (link.deleted) {
      remove(chat, link.id);
      return 'update';
    }
    const entry = entryOf(link);
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
    let quiet = false;
    if (isMessage(link)) {
      if (event.type === 'delete') {
        remove(chatOf(chatKey(link.source, link.chat)), link.id);
      } else {
        quiet = add(link) === 'old' && loaded;
      }
    }
    for (const listener of listeners) {
      listener(quiet ? { ...event, quiet } : event);
    }
  };
  const unsubscribe = store.subscribe?.(onChange) ?? (() => {});

  const ready = (async () => {
    for (const link of await store.query(isMessage)) {
      add(link);
    }
    loaded = true;
  })();

  const linksOf = async (entries) =>
    (await Promise.all(entries.map((e) => store.get(e.id)))).filter(
      (link) => link && !link.deleted
    );

  const sortedOf = (chat) => {
    chat.sorted ??= [...chat.entries.values()].sort(order);
    return chat.sorted;
  };

  // Where a page older than message `before` ends (exclusive).
  const endBefore = async (sorted, before) => {
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

  return {
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
     * ones around it, `target` the first at or after it (null: none).
     */
    async page(
      key,
      { before = null, after = null, at = null, limit = 50 } = {}
    ) {
      await ready;
      const chat = chats.get(key);
      if (!chat) {
        return { messages: [], more: false, newer: false, target: null };
      }
      const sorted = sortedOf(chat);
      let start;
      let end;
      let target;
      if (at) {
        const mark = { ts: String(at), num: 0 };
        const found = sorted.findIndex((e) => order(e, mark) >= 0);
        const from = found < 0 ? sorted.length : found;
        target = found < 0 ? null : sorted[found].id;
        start = Math.max(0, from - Math.floor(limit / 2));
        end = Math.min(sorted.length, start + limit);
      } else if (after) {
        start = await endBefore(sorted, after);
        start += sorted[start]?.id === after ? 1 : 0;
        end = Math.min(sorted.length, start + limit);
      } else {
        end = await endBefore(sorted, before);
        start = Math.max(0, end - limit);
      }
      return {
        messages: await linksOf(sorted.slice(start, end)),
        more: start > 0,
        newer: end < sorted.length,
        ...(at ? { target } : {}),
      };
    },
    /** How many messages of a chat the store holds. */
    count: (key) => chats.get(key)?.entries.size ?? 0,
    close: () => unsubscribe(),
  };
};
