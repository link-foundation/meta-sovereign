/**
 * The reply service: message-to-message autocomplete over a links store
 * (issue #31).
 *
 * It learns the reply graph from the store's history the first time it
 * is asked, then keeps learning in real time from every message the
 * store receives (imports, live adapters, our own sends). Suggestions
 * come in two stages — every reply we used before for the last incoming
 * message (deduplicated, most used first), then word-by-word completion
 * from our own messages when no whole reply matches.
 *
 * Keystrokes are answered by the in-memory index. When a link-cli
 * (`clink`) reply store is given it is loaded with the same graph and
 * kept up to date as the persisted, queryable mirror; its status is
 * reported but never blocks a suggestion (see reply-store-clink.js).
 */

import { detectSelfIds } from '../crm/reengage.js';
import { buildReplyIndex } from './reply-graph.js';

const isMessage = (l) =>
  l?.id?.startsWith('msg:') && typeof l.body === 'string' && !l.service;
const chatKey = (source, chat) => `${source}\u0000${chat}`;
const later = (a, b) =>
  String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')) >= 0;

/**
 * Create a reply service over `store`. `self` lists the owner's sender
 * ids (detected from the history when empty); `clink` is an optional
 * `createClinkReplyStore()` mirror.
 */
export const createReplyService = ({
  store,
  self = [],
  clink = null,
  wordsFrom = 'self',
  log = () => {},
} = {}) => {
  let index = null;
  let building = null;
  let isSelf = () => false;
  // The last message that is not ours in each chat — the one to answer.
  const lastIncoming = new Map();
  let mirror = clink?.available ? 'off' : 'unavailable';
  let mirrorError = null;

  const remember = (m) => {
    if (isSelf(m.sender)) {
      return;
    }
    const key = chatKey(m.source, m.chat);
    const known = lastIncoming.get(key);
    if (!known || later(m, known)) {
      lastIncoming.set(key, m);
    }
  };

  const openMirror = () => {
    if (!clink?.available || !index) {
      return;
    }
    mirror = 'opening';
    clink
      .open(index.toLinks())
      .then(() => {
        mirror = 'ready';
      })
      .catch((error) => {
        mirror = 'error';
        mirrorError = error.message;
        log({ event: 'reply_mirror_error', error: error.message });
      });
  };

  const build = async () => {
    const messages = (await store.query()).filter(isMessage);
    const selfIds = detectSelfIds(messages, self);
    isSelf = (sender) => selfIds.has(String(sender));
    lastIncoming.clear();
    index = buildReplyIndex(messages, { isSelf, wordsFrom });
    messages.forEach(remember);
    openMirror();
    return index;
  };

  const ready = () => {
    if (index) {
      return Promise.resolve(index);
    }
    building ??= build().finally(() => {
      building = null;
    });
    return building;
  };

  const unsubscribe = store.subscribe?.((event) => {
    if (!isMessage(event?.link) || !index) {
      return;
    }
    if (event.type === 'delete') {
      // Counts cannot be taken back one by one; relearn on next use.
      index = null;
      return;
    }
    remember(event.link);
    const pair = index.observe(event.link);
    if (pair && mirror === 'ready') {
      clink.learn(pair).catch((error) => {
        log({ event: 'reply_mirror_error', error: error.message });
      });
    }
  });

  return {
    ready,
    /** The last incoming message in a chat, or `null`. */
    async lastIncoming({ source, chat }) {
      await ready();
      return lastIncoming.get(chatKey(source, chat)) ?? null;
    },
    /**
     * Two-stage suggestions. `lastMessage` defaults to the chat's last
     * incoming message when `source` and `chat` are given.
     */
    async autocomplete({ source, chat, lastMessage, typed = '', limit = 8 }) {
      const idx = await ready();
      const last =
        lastMessage ??
        (source && chat !== undefined
          ? (lastIncoming.get(chatKey(source, chat))?.body ?? '')
          : '');
      return {
        ...idx.autocomplete({ lastMessage: last, typed, limit }),
        lastMessage: last,
        backend: 'memory',
      };
    },
    /** Index size and the link-cli mirror's state. */
    async stats() {
      const idx = await ready();
      return {
        ...idx.stats(),
        mirror,
        ...(mirrorError ? { mirrorError } : {}),
      };
    },
    /** The reply graph as `reply-link:<n>` rows. */
    async toLinks() {
      return (await ready()).toLinks();
    },
    async close() {
      unsubscribe?.();
      await clink?.close?.();
    },
  };
};
