/**
 * The browser's own copy of the reply index (R-Y70): suggestions while
 * typing come from memory, in the same task as the keystroke, never
 * from a round trip.
 *
 * The copy is links, as everything else in the associative stack: the
 * server's `/api/suggest/model` gives the index as `reply-link`,
 * `sent-link`, `word-link`, `spelling-link`, `chat-link` and
 * `last-link` rows (./reply-graph.js `modelLinks`), pruned to what a
 * suggestion can use, with a version. The copy is kept in the browser's
 * links storage (IndexedDB, or doublets-web when present) as
 * `{ links }` with a `reply-model` link for the version, so a reload
 * suggests at once, before the server answers. After that only the
 * messages the server learned since that version come down (`since`),
 * and are learned here the same way the server learned them; the whole
 * model only when the server rebuilt its index or this copy is too far
 * behind. The live stream says when to ask (`nudge`).
 */

import {
  DEFAULT_REPLY_WINDOW_MS,
  createReplyIndex,
  normalizeMessage,
} from './reply-graph.js';
import { usefulSuggestion } from './suggestion-quality.js';
import {
  MODEL_ID,
  compareReplyVersions,
  replyModel,
} from './reply-persistence.js';
import { createReplyCacheSync } from './reply-cache-sync.js';

// Links learned per task while loading: a long task would stall typing.
const CHUNK = 4000;
// A burst of live messages asks once.
const NUDGE_MS = 400;
// Saved at most this often (a save writes megabytes).
const SAVE_MS = 30_000;

const toMs = (value) => {
  const at = Date.parse(String(value ?? ''));
  return Number.isNaN(at) ? null : at;
};

/** The later of two messages (by timestamp), either may be missing. */
const laterOf = (a, b) => {
  if (!a || !b) {
    return a ?? b ?? null;
  }
  return (toMs(b.timestamp) ?? 0) > (toMs(a.timestamp) ?? 0) ? b : a;
};

// Learn `links` into `index` a chunk at a time, yielding between them.
const learnInChunks = (index, links, chunk) =>
  new Promise((resolve, reject) => {
    let at = 0;
    const step = () => {
      try {
        index.fromLinks(links.slice(at, at + chunk));
        at += chunk;
        if (at < links.length) {
          globalThis.setTimeout(step, 0);
        } else {
          resolve(index);
        }
      } catch (error) {
        reject(error);
      }
    };
    step();
  });

/**
 * `fetchModel({ since })` → the server's answer (or null offline);
 * `driver` `{ load(), save(snapshot) }` keeps the copy between visits.
 */
export const createReplyCache = ({
  fetchModel = async () => null,
  driver = null,
  now = () => Date.now(),
  chunk = CHUNK,
  nudgeMs = NUDGE_MS,
  saveMs = SAVE_MS,
  signal,
  onError,
} = {}) => {
  if (!Number.isSafeInteger(chunk) || chunk <= 0) {
    throw new RangeError(
      'Reply model chunks must be a positive finite integer'
    );
  }
  let index = null;
  let version = '';
  let self = new Set();
  let windowMs = DEFAULT_REPLY_WINDOW_MS;
  let revision = 0;
  const listeners = new Set();

  const changed = () => {
    revision += 1;
    for (const fn of listeners) {
      fn();
    }
  };

  const isSelf = (sender) =>
    self.has(String(sender)) || String(sender) === 'me';

  const build = async (model) => {
    replyModel({
      links: [{ ...model, id: MODEL_ID, links: undefined }, ...model.links],
    });
    const nextSelf = new Set((model.self ?? []).map(String));
    const next = createReplyIndex({
      isSelf: (sender) =>
        nextSelf.has(String(sender)) || String(sender) === 'me',
      windowMs: model.windowMs,
    });
    await learnInChunks(next, model.links ?? [], chunk);
    self = nextSelf;
    windowMs = Number(model.windowMs) || DEFAULT_REPLY_WINDOW_MS;
    index = next;
    version = String(model.version ?? '');
    changed();
  };

  const snapshot = () =>
    index && [
      {
        id: MODEL_ID,
        tokens: [MODEL_ID],
        version,
        self: [...self],
        windowMs,
      },
      ...index.modelLinks(),
    ];
  const header = () => ({ self: [...self], windowMs });

  const apply = async (model) => {
    if (!model?.version) {
      return false;
    }
    if (Array.isArray(model.links)) {
      const order = compareReplyVersions(model.version, version);
      if (order !== null && order < 0) {
        return false;
      }
      await build(model);
      return true;
    }
    if (!index || !Array.isArray(model.changes)) {
      return false;
    }
    const order = compareReplyVersions(model.version, version);
    if (order === null || order !== model.changes.length) {
      throw Object.assign(
        new Error('The reply delta does not continue this model.'),
        {
          code: 'REPLY_CACHE_CONFLICT',
        }
      );
    }
    for (const message of model.changes) {
      index.observe(message);
    }
    const updated = model.version !== version || model.changes.length > 0;
    version = String(model.version);
    if (model.changes.length > 0) {
      changed();
    }
    return updated;
  };

  const lifecycle = createReplyCacheSync({
    driver,
    fetchModel,
    apply,
    snapshot,
    header,
    version: () => version,
    saveMs,
    nudgeMs,
    signal,
    onError,
  });

  const toAnswer = (source, chat, hint) => {
    const last = laterOf(index?.lastIn(source, chat) ?? null, hint);
    if (!last || isSelf(last.sender) || last.service || last.deleted) {
      return '';
    }
    const at = toMs(last.timestamp);
    return at !== null && now() - at > windowMs ? '' : String(last.body);
  };

  const cache = {
    ...lifecycle,
    ready: () => index !== null,
    revision: () => revision,
    version: () => version,
    /** Calls `fn` whenever the copy learns something; returns the undo. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * The message waiting for an answer in a chat: its last message —
     * the later of the one learned and `hint` (the newest the screen
     * shows) — when it is not ours and not long past answering.
     */
    toAnswer: ({ source, chat, hint = null }) => toAnswer(source, chat, hint),
    /**
     * Suggestions as the server gives them (./reply-graph.js
     * `autocomplete`), or null before the copy is loaded.
     */
    autocomplete({
      source,
      chat,
      hint = null,
      typed = '',
      limit = 8,
      lastMessage: given,
    }) {
      if (!index) {
        return null;
      }
      const lastMessage = given ?? toAnswer(source, chat, hint);
      return {
        ...index.autocomplete({ lastMessage, typed, limit }),
        lastMessage,
        backend: 'browser',
      };
    },
    stats: () => ({ ...(index?.stats() ?? {}), version }),
  };
  return cache;
};

/**
 * Local suggestions first, then what the server adds that the copy
 * lacks (it keeps every rare reply, message and word): whole messages
 * in order, then the words — the copy's, or the server's when it knows
 * none — three at most, as the strip shows them.
 */
export const mergeSuggestions = (local, remote, { limit = 8, typed } = {}) => {
  const base = local ?? remote ?? { stage: 'none', suggestions: [] };
  const seen = new Set();
  const unique = (list) =>
    list.filter((suggestion) => {
      const key = normalizeMessage(suggestion.text);
      if (!key || seen.has(key) || !usefulSuggestion(suggestion, typed)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  const localItems = local?.suggestions ?? [];
  const remoteItems = remote?.suggestions ?? [];
  const wholeItems = [...localItems, ...remoteItems].filter(
    (s) => s.kind !== 'word'
  );
  const whole = unique([
    ...wholeItems.filter((s) => s.kind === 'context'),
    ...wholeItems.filter((s) => s.kind !== 'context'),
  ]).slice(0, limit);
  const knownWords = localItems.filter(
    (s) => s.kind === 'word' && usefulSuggestion(s, typed)
  );
  const words = unique(
    knownWords.length
      ? knownWords
      : remoteItems.filter((s) => s.kind === 'word')
  ).slice(0, Math.min(3, limit - whole.length));
  const suggestions = [...whole, ...words];
  return {
    ...base,
    stage: suggestions.length
      ? (suggestions[0]?.kind ?? base.stage ?? 'none')
      : 'none',
    suggestions,
  };
};
