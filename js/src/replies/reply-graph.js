/**
 * Message-to-message reply graph and two-stage autocomplete (issue #31).
 *
 * The graph is learned from history: every time the owner answers a
 * partner's message, the pair (their message → our reply) becomes one
 * reply link, counted. It is learnable from an archive import, from a
 * live pull and in real time (`observe(message)` as messages arrive).
 *
 * Autocomplete then works in three stages, fastest-to-type first:
 *
 *   1. Whole-message replies. The last message in the chat is looked up
 *      in the graph; every reply we ever sent to the same message is
 *      offered once (deduplicated), sorted by how often we used it.
 *      What the user has typed so far narrows the list by prefix.
 *      Before anything is typed only the typical replies show — used
 *      more than once and a good share of all our answers to it — so a
 *      message like "ok", answered a hundred different ways, offers
 *      none. Nothing is offered when there is nothing to answer, or no
 *      reply we know for it.
 *   2. Whole messages. While the user types, every message they sent
 *      before that starts with what is typed, most used first.
 *   3. Word by word. After those, the next word (or the rest of the
 *      current word) is predicted from the words of the conversations —
 *      ours counted three times, the people we talk with once (in chats
 *      we wrote in; broadcast channels left out) — a trigram → bigram →
 *      unigram back-off.
 *
 * The index is plain data (`toLinks`/`fromLinks` round-trip it through
 * the links store), and its lookups are hash-map reads, so suggesting is
 * O(replies for that message) however long the history is. The
 * `link-cli` backend in `./reply-store-clink.js` mirrors the same links
 * into a doublets database for the CLI and the server.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default for "how late can an answer be and still be an answer". */
export const DEFAULT_REPLY_WINDOW_MS = 7 * DAY_MS;

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/**
 * The lookup key of a message: case, punctuation, emoji and spacing do
 * not make "Привет!" and "привет" different messages.
 */
export const normalizeMessage = (text) =>
  (
    String(text ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .match(WORD_RE) ?? []
  ).join(' ');

export const tokenizeWords = (text) =>
  String(text ?? '')
    .normalize('NFKC')
    .match(WORD_RE) ?? [];

const toMs = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(String(value ?? ''));
  return Number.isNaN(parsed) ? null : parsed;
};

// A service note (a join, a pin) is no one's words.
const isMessage = (link) =>
  Boolean(link?.id?.startsWith('msg:')) &&
  typeof link.body === 'string' &&
  !link.service &&
  !link.deleted;

// A broadcast channel's posts are not a conversation's words.
const isBroadcast = (m) =>
  m.chatType === 'channel' || String(m.chatType ?? '').endsWith('_channel');

// Our own words weigh this much more than the other side's.
const SELF_WORD_WEIGHT = 3;
// Whole messages offered while typing, before the word strip.
const MESSAGE_LIMIT = 5;
// Whole-message completion starts at this many typed letters.
const MESSAGE_MIN_TYPED = 2;
// At most this many stored messages are looked at for one prefix.
const MESSAGE_SCAN = 2000;

const defaultIsSelf = (sender) => sender === 'me';

const chatKey = (m) => `${m.source}:${m.chat}`;

const indexMessages = (messages) => {
  const byExternalId = new Map();
  const byChat = new Map();
  for (const m of messages) {
    byExternalId.set(`${m.source}:${m.id.split(':').slice(2).join(':')}`, m);
    const list = byChat.get(chatKey(m)) ?? [];
    list.push(m);
    byChat.set(chatKey(m), list);
  }
  return { byExternalId, byChat };
};

const promptFor = (m, previous, byExternalId, isSelf) => {
  const explicit = m.replyTo
    ? byExternalId.get(`${m.source}:${m.replyTo}`)
    : null;
  if (explicit && !isSelf(explicit.sender)) {
    return explicit;
  }
  return previous && !isSelf(previous.sender) ? previous : null;
};

const withinWindow = (prompt, reply, windowMs) =>
  (toMs(reply.timestamp) ?? 0) - (toMs(prompt.timestamp) ?? 0) <= windowMs;

/**
 * Every (prompt → reply) pair in a history. A reply is the owner's
 * first message after one or more partner messages in the same chat,
 * within `windowMs`; when the adapter recorded an explicit `replyTo`,
 * that message is the prompt instead.
 */
export const extractReplyPairs = (
  links = [],
  { isSelf = defaultIsSelf, windowMs = DEFAULT_REPLY_WINDOW_MS } = {}
) => {
  const { byExternalId, byChat } = indexMessages(links.filter(isMessage));
  const pairs = [];
  for (const list of byChat.values()) {
    list.sort((a, b) => (toMs(a.timestamp) ?? 0) - (toMs(b.timestamp) ?? 0));
    let previous = null;
    for (const m of list) {
      const prompt = isSelf(m.sender)
        ? promptFor(m, previous, byExternalId, isSelf)
        : null;
      if (prompt?.body && m.body && withinWindow(prompt, m, windowMs)) {
        pairs.push({ prompt: prompt.body, reply: m.body, at: m.timestamp });
      }
      previous = m;
    }
  }
  return pairs;
};

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

const nestedBump = (map, outer, inner, by = 1) => {
  const bucket = map.get(outer) ?? new Map();
  bump(bucket, inner, by);
  map.set(outer, bucket);
};

// Each tier's words, most used first, sorted once until it learns more:
// a keystroke reads the top of a list instead of sorting every word.
const rankings = new WeakMap();
const ranked = (map) => {
  let list = rankings.get(map);
  if (!list) {
    list = [...map.entries()].sort((a, b) => b[1] - a[1]);
    rankings.set(map, list);
  }
  return list;
};
const bumpRanked = (map, key, by) => {
  bump(map, key, by);
  rankings.delete(map);
};
const nestedBumpRanked = (map, outer, inner, by) => {
  const bucket = map.get(outer) ?? new Map();
  bumpRanked(bucket, inner, by);
  map.set(outer, bucket);
};

const mostUsed = (options, fallback) =>
  options ? [...options.entries()].sort((a, b) => b[1] - a[1])[0][0] : fallback;

/** One word suggestion: the whole new text plus the part it adds. */
const wordSuggestion = ({ text, partial, spelled, count }) => {
  // Keep the user's own casing for what they already typed.
  const word = partial ? partial + spelled.slice(partial.length) : spelled;
  const head = partial ? text.slice(0, -partial.length) : text;
  const glue = !partial && text && !/\s$/.test(text) ? ' ' : '';
  return {
    kind: 'word',
    text: `${head}${glue}${word}`,
    insert: partial ? word.slice(partial.length) : `${glue}${word}`,
    word,
    count,
  };
};

// Sentences end at . ! ? … or a line break; words never follow each
// other across one, and the first word's capital is not its spelling.
const SENTENCE_END = /[.!?…]+(?=\s|$)|\n+/u;
// The context before the first word of a sentence.
const START = '\u0002';
// A keyboard's suggestion strip holds three words (Gboard, iOS).
const WORD_LIMIT = 3;

const sentences = (text) => String(text ?? '').split(SENTENCE_END);

const capitalize = (word) => word[0].toLocaleUpperCase() + word.slice(1);

/**
 * The word model: counts of words and of the words that follow one or
 * two previous words (or a sentence start), learned from the owner's
 * messages.
 */
const createWordModel = () => {
  const unigrams = new Map();
  const bigrams = new Map();
  const trigrams = new Map();
  // The spelling the owner used most for each lower-cased word inside a
  // sentence: "Аня" stays capitalised, "А" opening a sentence does not.
  const spellings = new Map();
  const candidates = (previous) => {
    // p1 is the last word typed, p2 the one before it (if any).
    const [p1, p2] = previous.slice(-2).reverse();
    return [
      p2 && p1 ? trigrams.get(`${p2} ${p1}`) : null,
      p1 ? bigrams.get(p1) : null,
      unigrams,
    ].filter(Boolean);
  };
  const learnSentence = (sentence, by) => {
    const words = tokenizeWords(sentence);
    const lower = [START, ...words.map((w) => w.toLowerCase())];
    words.forEach((word, n) => {
      const i = n + 1;
      bumpRanked(unigrams, lower[i], by);
      if (n > 0) {
        nestedBump(spellings, lower[i], word, by);
      }
      nestedBumpRanked(bigrams, lower[i - 1], lower[i], by);
      if (i > 1) {
        nestedBumpRanked(
          trigrams,
          `${lower[i - 2]} ${lower[i - 1]}`,
          lower[i],
          by
        );
      }
    });
  };
  return {
    learn(text, by = 1) {
      for (const sentence of sentences(text)) {
        learnSentence(sentence, by);
      }
    },
    /**
     * The rest of the current word when `typed` does not end with a
     * space, else the likeliest next words (trigram → bigram → unigram)
     * within the current sentence.
     */
    suggest(typed, limit) {
      const text = String(typed ?? '');
      const tokens = tokenizeWords(sentences(text).at(-1));
      const partial = /[\p{L}\p{N}'’-]$/u.test(text)
        ? (tokens.pop() ?? '')
        : '';
      const lowerPartial = partial.toLowerCase();
      const previous = [START, ...tokens.map((w) => w.toLowerCase())];
      // "Отлично, отлично" is never what the owner means.
      const seen = new Set([previous.at(-1)]);
      const out = [];
      for (const tier of candidates(previous)) {
        for (const [w, count] of ranked(tier)) {
          if (out.length >= limit) {
            break;
          }
          if (
            seen.has(w) ||
            !w.startsWith(lowerPartial) ||
            w.length <= lowerPartial.length
          ) {
            continue;
          }
          seen.add(w);
          const spelled = mostUsed(spellings.get(w), w);
          out.push(
            wordSuggestion({
              text,
              partial,
              spelled: tokens.length ? spelled : capitalize(spelled),
              count,
            })
          );
        }
      }
      return out.slice(0, limit);
    },
    size: () => unigrams.size,
    /**
     * The model as links: one `word-link` per context — `n` 1 (the
     * words), 2 (after the word `context`) or 3 (after the two words of
     * `context`) — holding its `[word, count]` pairs, most used first,
     * and one `spelling-link` holding `[word, spelling]` for the words
     * not written in lower case. `keep(count, n)` and `perContext` prune.
     */
    toLinks(keep = () => true, perContext = Infinity) {
      const out = [];
      const add = (n, context, entries) => {
        const kept = entries
          .filter(([, count]) => keep(count, n))
          .slice(0, n === 1 ? Infinity : perContext);
        if (kept.length > 0) {
          out.push({
            id: `word-link:${n}:${context}`,
            tokens: ['word-link', String(n), context],
            n,
            context,
            words: kept,
          });
        }
      };
      add(1, '', ranked(unigrams));
      for (const [n, tier] of [
        [2, bigrams],
        [3, trigrams],
      ]) {
        for (const [context, bucket] of tier) {
          add(n, context, ranked(bucket));
        }
      }
      const kept = new Set(out[0]?.words.map(([word]) => word));
      const spelled = [...spellings]
        .map(([word, options]) => [word, mostUsed(options, word)])
        .filter(([word, spelling]) => spelling !== word && kept.has(word));
      return [
        ...out,
        {
          id: 'spelling-link',
          tokens: ['spelling-link'],
          spellings: spelled,
        },
      ];
    },
    fromLink(l) {
      if (l.id === 'spelling-link') {
        for (const [word, spelling] of l.spellings ?? []) {
          nestedBump(spellings, word, spelling, 1);
        }
        return;
      }
      const count = (n) => Number(n ?? 1);
      for (const [word, n] of l.words ?? []) {
        if (l.n === 1) {
          bumpRanked(unigrams, word, count(n));
        } else if (l.n === 2 || l.n === 3) {
          const tier = l.n === 2 ? bigrams : trigrams;
          nestedBumpRanked(tier, l.context, word, count(n));
        }
      }
    },
  };
};

// A typical reply (offered before anything is typed): used at least
// this often, and at least this share of all our answers to the message.
const TYPICAL_MIN_USES = 2;
const TYPICAL_SHARE = 0.2;

/** Sort `[text, count]` entries by count, ties broken by recency. */
const byUse = (lastUsed) => (a, b) =>
  b[1] - a[1] ||
  String(lastUsed.get(b[0]) ?? '').localeCompare(
    String(lastUsed.get(a[0]) ?? '')
  );

/** The reply links themselves: prompt → reply → count. */
const createPairStore = () => {
  // normalized prompt → Map(normalized reply → count)
  const replies = new Map();
  // normalized reply → Map(original text → count), and its last use
  const originals = new Map();
  const lastUsed = new Map();
  let pairCount = 0;
  const original = (answer) => mostUsed(originals.get(answer), answer);
  return {
    learn({ prompt, reply, at = null, count = 1 }) {
      const key = normalizeMessage(prompt);
      const answer = normalizeMessage(reply);
      if (!key || !answer) {
        return false;
      }
      nestedBump(replies, key, answer, count);
      nestedBump(originals, answer, String(reply).trim(), count);
      if (at && String(at) > String(lastUsed.get(answer) ?? '')) {
        lastUsed.set(answer, String(at));
      }
      pairCount += count;
      return true;
    },
    suggest(prompt, typed, limit, { typical = false } = {}) {
      const bucket = [...(replies.get(normalizeMessage(prompt)) ?? [])];
      const prefix = normalizeMessage(typed);
      const total = bucket.reduce((sum, [, count]) => sum + count, 0);
      const isTypical = (count) =>
        count >= TYPICAL_MIN_USES && count >= total * TYPICAL_SHARE;
      return bucket
        .filter(([answer]) => !prefix || answer.startsWith(prefix))
        .filter(([, count]) => !typical || isTypical(count))
        .sort(byUse(lastUsed))
        .slice(0, limit)
        .map(([answer, count]) => ({
          kind: 'reply',
          text: original(answer),
          count,
          lastUsed: lastUsed.get(answer) ?? null,
        }));
    },
    toLinks(keep = () => true, { compact = false } = {}) {
      const out = [];
      for (const [prompt, bucket] of replies) {
        const total = [...bucket.values()].reduce((sum, n) => sum + n, 0);
        for (const [answer, count] of bucket) {
          if (!keep(count, total, lastUsed.get(answer))) {
            continue;
          }
          out.push({
            id: `reply-link:${out.length + 1}`,
            // The words are the fields; the clink mirror wants them here.
            tokens: compact ? ['reply-link'] : ['reply-link', prompt, answer],
            prompt,
            reply: original(answer),
            count,
            ...(lastUsed.has(answer) ? { at: lastUsed.get(answer) } : {}),
          });
        }
      }
      return out;
    },
    stats: () => ({
      prompts: replies.size,
      replies: originals.size,
      pairs: pairCount,
    }),
  };
};

/**
 * Our own sent messages, for completing a whole message from its start:
 * normalized text → how often it was sent, its spelling and last use;
 * prefix lookups binary-search the sorted keys.
 */
const createSentStore = () => {
  const counts = new Map();
  const originals = new Map();
  const lastUsed = new Map();
  let sorted = null;
  const keys = () => (sorted ??= [...counts.keys()].sort());
  const firstAtLeast = (list, prefix) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < prefix) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  };
  return {
    learn(text, at = null) {
      const key = normalizeMessage(text);
      if (!key) {
        return;
      }
      if (!counts.has(key)) {
        sorted = null;
      }
      bump(counts, key);
      nestedBump(originals, key, String(text).trim());
      if (at && String(at) > String(lastUsed.get(key) ?? '')) {
        lastUsed.set(key, String(at));
      }
    },
    /** Messages that start with `typed` (at a word end after a space). */
    complete(typed, limit) {
      const prefix = normalizeMessage(typed);
      if (prefix.length < MESSAGE_MIN_TYPED) {
        return [];
      }
      // "Ну " has finished its word: "нужно" no longer matches.
      const start = /\s$/u.test(String(typed)) ? `${prefix} ` : prefix;
      const list = keys();
      const found = [];
      for (
        let i = firstAtLeast(list, start);
        i < list.length && found.length < MESSAGE_SCAN;
        i += 1
      ) {
        if (!list[i].startsWith(start)) {
          break;
        }
        if (list[i] !== prefix) {
          found.push([list[i], counts.get(list[i])]);
        }
      }
      return found
        .sort(byUse(lastUsed))
        .slice(0, limit)
        .map(([key, count]) => ({
          kind: 'message',
          text: mostUsed(originals.get(key), key),
          count,
          lastUsed: lastUsed.get(key) ?? null,
        }));
    },
    size: () => counts.size,
    /** The sent messages as `sent-link` rows; `keep(count, at)` prunes. */
    toLinks(keep = () => true) {
      const out = [];
      for (const [key, count] of counts) {
        const at = lastUsed.get(key);
        if (keep(count, at)) {
          out.push({
            id: `sent-link:${out.length + 1}`,
            tokens: ['sent-link'],
            text: mostUsed(originals.get(key), key),
            count,
            ...(at ? { at } : {}),
          });
        }
      }
      return out;
    },
    fromLink(l) {
      const key = normalizeMessage(l.text);
      if (!key) {
        return;
      }
      if (!counts.has(key)) {
        sorted = null;
      }
      const count = Number(l.count ?? 1);
      bump(counts, key, count);
      nestedBump(originals, key, String(l.text).trim(), count);
      if (l.at && String(l.at) > String(lastUsed.get(key) ?? '')) {
        lastUsed.set(key, String(l.at));
      }
    },
  };
};

// What a chat's last message needs to be answered and to learn from.
const lastMessageOf = (m) =>
  Object.fromEntries(
    ['id', 'source', 'chat', 'sender', 'body', 'timestamp', 'chatType']
      .filter((key) => m[key] !== undefined)
      .map((key) => [key, m[key]])
  );

const isLater = (a, b) => (toMs(a.timestamp) ?? 0) >= (toMs(b.timestamp) ?? 0);

/**
 * Create an empty reply index. `isSelf(sender)` says which messages are
 * the owner's; `wordsFrom` is `'all'` (the default — our words and the
 * words of the people we talk with teach the word model, ours weighing
 * more) or `'self'` (only ours).
 */
export const createReplyIndex = ({
  isSelf = defaultIsSelf,
  windowMs = DEFAULT_REPLY_WINDOW_MS,
  wordsFrom = 'all',
} = {}) => {
  const pairs = createPairStore();
  const words = createWordModel();
  const sent = createSentStore();
  // Real-time learning: the last message seen in each chat.
  const lastInChat = new Map();
  // The chats we wrote in: the conversations whose other side's words
  // count (a group we only read, or a channel, teaches none).
  const ourChats = new Set();
  const learnWords = (m) => {
    if (isSelf(m.sender)) {
      ourChats.add(chatKey(m));
      words.learn(m.body, SELF_WORD_WEIGHT);
      sent.learn(m.body, m.timestamp);
    } else if (
      wordsFrom === 'all' &&
      !isBroadcast(m) &&
      ourChats.has(chatKey(m))
    ) {
      words.learn(m.body);
    }
  };
  const index = {
    /** Learn every reply pair and every word in a history. */
    learnFromMessages(links = []) {
      const messages = links.filter(isMessage);
      for (const m of messages) {
        if (isSelf(m.sender)) {
          ourChats.add(chatKey(m));
        }
      }
      for (const pair of extractReplyPairs(messages, { isSelf, windowMs })) {
        pairs.learn(pair);
      }
      for (const m of messages) {
        learnWords(m);
        const known = lastInChat.get(chatKey(m));
        if (!known || isLater(m, known)) {
          lastInChat.set(chatKey(m), m);
        }
      }
      return index;
    },
    learnPair: (pair) => pairs.learn(pair),
    /**
     * Real-time learning: feed messages as they arrive. A message older
     * than the last one seen in its chat teaches words but no pair.
     */
    observe(message) {
      if (!isMessage(message)) {
        return null;
      }
      const previous = lastInChat.get(chatKey(message));
      // The last message again (edited, re-sent by the network): known.
      if (previous?.id === message.id) {
        lastInChat.set(chatKey(message), message);
        return null;
      }
      learnWords(message);
      if (previous && !isLater(message, previous)) {
        return null;
      }
      lastInChat.set(chatKey(message), message);
      const answers =
        previous &&
        isSelf(message.sender) &&
        !isSelf(previous.sender) &&
        withinWindow(previous, message, windowMs);
      if (!answers) {
        return null;
      }
      const pair = {
        prompt: previous.body,
        reply: message.body,
        at: message.timestamp,
      };
      pairs.learn(pair);
      return pair;
    },
    /**
     * Whole-message suggestions for an incoming message: every reply we
     * used for the same message, once, most used first. `typed` keeps
     * only the replies that start with what the user has typed.
     */
    suggestReplies: (prompt, { typed = '', limit = 8 } = {}) =>
      pairs.suggest(prompt, typed, limit),
    /** Word-by-word completion of `typed` from the conversations. */
    suggestWords: (typed = '', { limit = 5 } = {}) =>
      words.suggest(typed, limit),
    /** Whole messages we sent before that start with `typed`. */
    suggestMessages: (typed = '', { limit = MESSAGE_LIMIT } = {}) =>
      sent.complete(typed, limit),
    /**
     * The stages together, in priority order: whole replies to
     * `lastMessage` (narrowed by `typed`), then — while typing — whole
     * messages we sent that start with `typed`, then the next words.
     * Words stop at three, like a phone keyboard's strip. `stage` is the
     * kind of the first suggestion.
     */
    autocomplete({ lastMessage = '', typed = '', limit = 8 } = {}) {
      // Nothing typed yet: only the replies we typically give.
      const replies = lastMessage
        ? pairs.suggest(lastMessage, typed, limit, {
            typical: !normalizeMessage(typed),
          })
        : [];
      const offered = new Set(replies.map((r) => normalizeMessage(r.text)));
      const messages = typed
        ? sent
            .complete(typed, Math.min(limit, MESSAGE_LIMIT) + offered.size)
            .filter((m) => !offered.has(normalizeMessage(m.text)))
        : [];
      const whole = [...replies, ...messages].slice(0, limit);
      // A word that only finishes a whole suggestion repeats it.
      const shown = new Set(whole.map((m) => normalizeMessage(m.text)));
      const room = Math.min(limit - whole.length, WORD_LIMIT);
      const byWord =
        typed && room > 0
          ? words
              .suggest(typed, room + shown.size)
              .filter((w) => !shown.has(normalizeMessage(w.text)))
              .slice(0, room)
          : [];
      const suggestions = [...whole, ...byWord];
      return { stage: suggestions[0]?.kind ?? 'none', suggestions };
    },
    stats: () => ({
      ...pairs.stats(),
      words: words.size(),
      sent: sent.size(),
    }),
    /**
     * The reply graph as links (`reply-link:<n>`), one per distinct
     * (prompt, reply) pair with its count — the format the links store,
     * links notation export and link-cli all take.
     */
    toLinks: () => pairs.toLinks(),
    /**
     * The whole model as links, for a client to answer keystrokes by
     * itself: the reply links, `sent-link` (our messages), `word-link`
     * and `spelling-link` (the word model), `chat-link` (the chats we
     * wrote in, in one link) and `last-link` (each chat's last message). `keep`
     * prunes: `{ reply(count, total, at), sent(count, at), word(count,
     * n), perContext, last(message) }`, each keeping all when absent.
     */
    modelLinks(keep = {}) {
      const all = () => true;
      return [
        ...pairs.toLinks(keep.reply ?? all, { compact: true }),
        ...sent.toLinks(keep.sent ?? all),
        ...words.toLinks(keep.word ?? all, keep.perContext ?? Infinity),
        { id: 'chat-link', tokens: ['chat-link'], chats: [...ourChats] },
        ...[...lastInChat]
          .filter(([, m]) => (keep.last ?? all)(m))
          .map(([key, m]) => ({
            id: `last-link:${key}`,
            tokens: ['last-link', key],
            message: lastMessageOf(m),
          })),
      ];
    },
    /** Load links of `toLinks()` or `modelLinks()` (counts are kept). */
    fromLinks(links = []) {
      for (const l of links) {
        const kind = String(l?.id ?? '').split(':')[0];
        if (kind === 'reply-link') {
          pairs.learn({ ...l, count: Number(l.count ?? 1) });
        } else if (kind === 'sent-link') {
          sent.fromLink(l);
        } else if (kind === 'word-link' || kind === 'spelling-link') {
          words.fromLink(l);
        } else if (kind === 'chat-link') {
          (l.chats ?? []).forEach((key) => ourChats.add(key));
        } else if (kind === 'last-link' && l.message) {
          lastInChat.set(chatKey(l.message), l.message);
        }
      }
      return index;
    },
    /** The last message seen in a chat, or `null`. */
    lastIn: (source, chat) => lastInChat.get(chatKey({ source, chat })) ?? null,
  };
  return index;
};

/**
 * The last message in a chat that is not the owner's — the message the
 * owner is about to answer — or `null`.
 */
export const lastIncomingIn = (
  links,
  { source, chat, isSelf = defaultIsSelf }
) =>
  links
    .filter(
      (l) =>
        isMessage(l) &&
        l.source === source &&
        String(l.chat) === String(chat) &&
        !isSelf(l.sender)
    )
    .sort((a, b) => (toMs(b.timestamp) ?? 0) - (toMs(a.timestamp) ?? 0))[0] ??
  null;

/** Build an index from a store's links in one go. */
export const buildReplyIndex = (links = [], options = {}) =>
  createReplyIndex(options).learnFromMessages(links);
