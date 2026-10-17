/**
 * Message-to-message reply graph and two-stage autocomplete (issue #31).
 *
 * The graph is learned from history: every time the owner answers a
 * partner's message, the pair (their message → our reply) becomes one
 * reply link, counted. It is learnable from an archive import, from a
 * live pull and in real time (`observe(message)` as messages arrive).
 *
 * Autocomplete then works in two stages, fastest-to-type first:
 *
 *   1. Whole-message replies. The last message in the chat is looked up
 *      in the graph; every reply we ever sent to the same message is
 *      offered once (deduplicated), sorted by how often we used it.
 *      What the user has typed so far narrows the list by prefix.
 *   2. Word by word. When no whole reply matches, the next word (or the
 *      rest of the current word) is predicted from our own messages
 *      only, by default — a trigram → bigram → unigram back-off.
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
  !link.service;

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
      bump(unigrams, lower[i], by);
      if (n > 0) {
        nestedBump(spellings, lower[i], word, by);
      }
      nestedBump(bigrams, lower[i - 1], lower[i], by);
      if (i > 1) {
        nestedBump(trigrams, `${lower[i - 2]} ${lower[i - 1]}`, lower[i], by);
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
        const ranked = [...tier.entries()]
          .filter(
            ([w]) =>
              !seen.has(w) &&
              w.startsWith(lowerPartial) &&
              w.length > lowerPartial.length
          )
          .sort((a, b) => b[1] - a[1]);
        for (const [w, count] of ranked) {
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
  };
};

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
    suggest(prompt, typed, limit) {
      const bucket = replies.get(normalizeMessage(prompt));
      const prefix = normalizeMessage(typed);
      return [...(bucket ?? [])]
        .filter(([answer]) => !prefix || answer.startsWith(prefix))
        .sort(byUse(lastUsed))
        .slice(0, limit)
        .map(([answer, count]) => ({
          kind: 'reply',
          text: original(answer),
          count,
          lastUsed: lastUsed.get(answer) ?? null,
        }));
    },
    toLinks() {
      const out = [];
      for (const [prompt, bucket] of replies) {
        for (const [answer, count] of bucket) {
          out.push({
            id: `reply-link:${out.length + 1}`,
            tokens: ['reply-link', prompt, answer],
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

const isLater = (a, b) => (toMs(a.timestamp) ?? 0) >= (toMs(b.timestamp) ?? 0);

/**
 * Create an empty reply index. `isSelf(sender)` says which messages are
 * the owner's; `wordsFrom` is `'self'` (the default — only our own
 * messages teach the word model) or `'all'`.
 */
export const createReplyIndex = ({
  isSelf = defaultIsSelf,
  windowMs = DEFAULT_REPLY_WINDOW_MS,
  wordsFrom = 'self',
} = {}) => {
  const pairs = createPairStore();
  const words = createWordModel();
  // Real-time learning: the last message seen in each chat.
  const lastInChat = new Map();
  const learnWords = (m) => {
    if (wordsFrom === 'all' || isSelf(m.sender)) {
      words.learn(m.body);
    }
  };
  const index = {
    /** Learn every reply pair and every word in a history. */
    learnFromMessages(links = []) {
      const messages = links.filter(isMessage);
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
      learnWords(message);
      const previous = lastInChat.get(chatKey(message));
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
    /** Word-by-word completion of `typed` from our own messages. */
    suggestWords: (typed = '', { limit = 5 } = {}) =>
      words.suggest(typed, limit),
    /**
     * The two stages together: whole replies to `lastMessage` first,
     * word-by-word over `typed` when none match. Words stop at three,
     * like a phone keyboard's strip: past the top few they are guesses.
     */
    autocomplete({ lastMessage = '', typed = '', limit = 8 } = {}) {
      const whole = lastMessage ? pairs.suggest(lastMessage, typed, limit) : [];
      if (whole.length > 0) {
        return { stage: 'reply', suggestions: whole };
      }
      const byWord = typed
        ? words.suggest(typed, Math.min(limit, WORD_LIMIT))
        : [];
      return {
        stage: byWord.length > 0 ? 'word' : 'none',
        suggestions: byWord,
      };
    },
    stats: () => ({ ...pairs.stats(), words: words.size() }),
    /**
     * The reply graph as links (`reply-link:<n>`), one per distinct
     * (prompt, reply) pair with its count — the format the links store,
     * links notation export and link-cli all take.
     */
    toLinks: () => pairs.toLinks(),
    /** Load pairs exported by `toLinks()` (counts are kept). */
    fromLinks(links = []) {
      for (const l of links) {
        if (l?.id?.startsWith('reply-link:')) {
          pairs.learn({ ...l, count: Number(l.count ?? 1) });
        }
      }
      return index;
    },
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
