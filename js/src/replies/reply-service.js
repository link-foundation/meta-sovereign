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
 *
 * A browser answers keystrokes itself (./reply-cache.js): `model()`
 * gives it the index as links, pruned to what a suggestion can use, and
 * a version; `model({ since })` then gives only the messages learned
 * since, in order, for the client to learn the same way — or the whole
 * model again when it is too far behind or the index was rebuilt.
 */

import { detectSelfIds } from '../crm/reengage.js';
import { buildReplyIndex, DEFAULT_REPLY_WINDOW_MS } from './reply-graph.js';

const isMessage = (l) =>
  l?.id?.startsWith('msg:') &&
  typeof l.body === 'string' &&
  !l.service &&
  !l.deleted;
const chatKey = (source, chat) => `${source}\u0000${chat}`;
const DAY_MS = 24 * 60 * 60 * 1000;
// Messages kept for clients catching up; further behind, a whole model.
const CHANGES_KEPT = 5000;
// What a browser's copy keeps (megabytes, not the hundreds the whole
// index takes): replies used twice, typical or recent, messages sent
// twice or lately, words used more than once (our own count three
// times), the likeliest after each context, and the last message of each
// chat still waiting for an answer. The server answers the rest.
const recent = (at, days, now) =>
  Boolean(at) && now - Date.parse(at) <= days * DAY_MS;
const clientKeep = (now, windowMs) => ({
  reply: (count, total, at) => count >= 2 || total >= 3 || recent(at, 30, now),
  sent: (count, at) => count >= 2 || recent(at, 60, now),
  word: (count, n) => count >= (n === 3 ? 6 : 4),
  perContext: 8,
  last: (m) => now - Date.parse(m.timestamp ?? '') <= windowMs,
});
// What a client learns from a message.
const learnable = (m) =>
  Object.fromEntries(
    [
      'id',
      'source',
      'chat',
      'sender',
      'body',
      'timestamp',
      'chatType',
      'replyTo',
    ]
      .filter((key) => m[key] !== undefined && m[key] !== null)
      .map((key) => [key, m[key]])
  );

/**
 * The messages learned since the index was built, numbered: a client
 * holding version `<build>.<n>` gets the ones from n on. The oldest go
 * once more than CHANGES_KEPT are held.
 */
const createChangeLog = (now) => {
  let build = '';
  let changes = [];
  let first = 0;
  const version = () => `${build}.${first + changes.length}`;
  return {
    reset() {
      build = `${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      changes = [];
      first = 0;
    },
    add(message) {
      changes.push(learnable(message));
      if (changes.length > CHANGES_KEPT) {
        first += changes.length - CHANGES_KEPT;
        changes = changes.slice(-CHANGES_KEPT);
      }
    },
    version,
    /** The messages after version `since`, or null when it is not ours. */
    since(since) {
      const [sinceBuild, n] = String(since).split('.');
      const from = Number(n);
      const ours =
        sinceBuild === build &&
        Number.isInteger(from) &&
        from >= first &&
        from <= first + changes.length;
      return ours ? changes.slice(from - first) : null;
    },
  };
};

const later = (a, b) =>
  String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')) >= 0;

/**
 * Create a reply service over `store`. `self` lists the owner's sender
 * ids (detected from the history when empty); `clink` is an optional
 * `createClinkReplyStore()` mirror. A message older than `windowMs`
 * (the reply graph's own answer window) waits for no answer.
 */
export const createReplyService = ({
  store,
  self = [],
  clink = null,
  wordsFrom = 'all',
  windowMs = DEFAULT_REPLY_WINDOW_MS,
  now = () => Date.now(),
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
  const learned = createChangeLog(now);
  let selfList = [];
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

  // The message to answer in a chat: its last one, when it is not ours
  // and not long past answering.
  const toAnswer = (source, chat) => {
    const key = chatKey(source, chat);
    const last = lastAny.get(key);
    const at = Date.parse(last?.timestamp ?? '');
    const stale = Number.isFinite(at) && now() - at > windowMs;
    return last && !isSelf(last.sender) && !stale ? last.body : '';
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

  const buildIndex = async () => {
    const messages = (await store.query()).filter(isMessage);
    const selfIds = detectSelfIds(messages, self);
    isSelf = (sender) => selfIds.has(String(sender));
    selfList = [...selfIds];
    lastIncoming.clear();
    lastAny.clear();
    learned.reset();
    index = buildReplyIndex(messages, { isSelf, wordsFrom });
    messages.forEach(remember);
    openMirror();
    return index;
  };

  const ready = () => {
    if (index) {
      return Promise.resolve(index);
    }
    building ??= buildIndex().finally(() => {
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
    learned.add(event.link);
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
    /**
     * The model for a client: `{ version, self, links }`, or — given the
     * `since` version it holds — `{ version, changes }`, the messages
     * learned since in order (none when it is current).
     */
    async model({ since = '' } = {}) {
      const idx = await ready();
      const version = learned.version();
      const changes = learned.since(since);
      if (changes) {
        return { version, changes };
      }
      return {
        version,
        self: selfList,
        windowMs,
        links: idx.modelLinks(clientKeep(now(), windowMs)),
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
