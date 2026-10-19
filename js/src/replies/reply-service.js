/**
 * The reply service: message-to-message autocomplete over a links store
 * (issue #31).
 *
 * It learns the reply graph from the store's history the first time it
 * is asked, then keeps learning in real time from every message the
 * store receives (imports, live adapters, our own sends). Suggestions
 * come in three stages — every reply we used before for the message
 * waiting for an answer (deduplicated, most used first), then whole
 * messages we sent that start with what is typed, then word-by-word
 * completion from the conversations' words.
 *
 * Keystrokes are answered by the in-memory index. When a link-cli
 * (`clink`) reply store is given it is loaded with the same graph and
 * kept up to date as the persisted, queryable mirror; its status is
 * reported but never blocks a suggestion (see reply-store-clink.js).
 */

import { detectSelfIds } from '../crm/reengage.js';
import { buildReplyIndex } from './reply-graph.js';

const isMessage = (l) =>
  l?.id?.startsWith('msg:') &&
  typeof l.body === 'string' &&
  !l.service &&
  !l.deleted;
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
  wordsFrom = 'all',
  log = () => {},
} = {}) => {
  let index = null;
  let building = null;
  let isSelf = () => false;
  // The last message that is not ours in each chat — the one to answer
  // — and the last message of any side: once we answered, there is
  // nothing to answer.
  const lastIncoming = new Map();
  const lastAny = new Map();
  let mirror = clink?.available ? 'off' : 'unavailable';
  let mirrorError = null;

  const keepLater = (map, key, m) => {
    const known = map.get(key);
    if (!known || later(m, known)) {
      map.set(key, m);
    }
  };
  const remember = (m) => {
    const key = chatKey(m.source, m.chat);
    keepLater(lastAny, key, m);
    if (!isSelf(m.sender)) {
      keepLater(lastIncoming, key, m);
    }
  };

  // The message to answer in a chat: its last one, when it is not ours.
  const toAnswer = (source, chat) => {
    const key = chatKey(source, chat);
    const last = lastAny.get(key);
    return last && !isSelf(last.sender) ? last.body : '';
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
    lastAny.clear();
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
     * Suggestions (./reply-graph.js `autocomplete`). `lastMessage`
     * defaults, when `source` and `chat` are given, to the chat's last
     * message if it is the other side's — none once we answered it.
     */
    async autocomplete({ source, chat, lastMessage, typed = '', limit = 8 }) {
      const idx = await ready();
      const last =
        lastMessage ??
        (source && chat !== undefined ? toAnswer(source, chat) : '');
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
