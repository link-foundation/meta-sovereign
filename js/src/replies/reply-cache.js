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

const MODEL_ID = 'reply-model';
// Links learned per task while loading: a long task would stall typing.
const CHUNK = 4000;
// A burst of live messages asks once.
const NUDGE_MS = 400;
// Saved at most this often (a save writes megabytes).
const SAVE_MS = 30_000;

const defer = (fn, ms = 0) => globalThis.setTimeout(fn, ms);

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
  new Promise((resolve) => {
    let at = 0;
    const step = () => {
      index.fromLinks(links.slice(at, at + chunk));
      at += chunk;
      if (at < links.length) {
        defer(step);
      } else {
        resolve(index);
      }
    };
    step();
  });

// The copy kept between visits: `{ links }`, the `reply-model` link
// first (version, owner ids, window), or null.
const readModel = async (driver) => {
  try {
    const links = (await driver?.load())?.links ?? [];
    const header = links.find((l) => l?.id === MODEL_ID);
    return header
      ? { ...header, links: links.filter((l) => l?.id !== MODEL_ID) }
      : null;
  } catch {
    // Nothing kept, or not readable: the server's copy will do.
    return null;
  }
};

// Keeps `snapshot()` with `driver`: a whole model once the browser is
// idle (`soon(true)`); what is learned after it, at most every `saveMs`.
const createSaver = (driver, snapshot, saveMs) => {
  let timer = null;
  const save = async () => {
    timer = null;
    const links = snapshot();
    if (!driver || !links) {
      return;
    }
    try {
      await driver.save({ links });
    } catch {
      // A full disk or a private window: the copy lives until the reload.
    }
  };
  return {
    soon(whole = false) {
      if (whole) {
        globalThis.clearTimeout(timer);
        timer = defer(
          () =>
            globalThis.requestIdleCallback
              ? globalThis.requestIdleCallback(save, { timeout: 5000 })
              : save(),
          0
        );
        return;
      }
      timer ??= defer(save, saveMs);
    },
    flush() {
      globalThis.clearTimeout(timer);
      return save();
    },
  };
};

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
} = {}) => {
  let index = null;
  let version = '';
  let self = new Set();
  let windowMs = DEFAULT_REPLY_WINDOW_MS;
  let revision = 0;
  let syncing = null;
  let again = false;
  let nudgeTimer = null;
  let started = null;
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
    const next = createReplyIndex({ isSelf, windowMs: model.windowMs });
    self = new Set((model.self ?? []).map(String));
    windowMs = Number(model.windowMs) || DEFAULT_REPLY_WINDOW_MS;
    await learnInChunks(next, model.links ?? [], chunk);
    index = next;
    version = String(model.version ?? '');
    changed();
  };

  const saver = createSaver(
    driver,
    () =>
      index && [
        {
          id: MODEL_ID,
          tokens: [MODEL_ID],
          version,
          self: [...self],
          windowMs,
        },
        ...index.modelLinks(),
      ],
    saveMs
  );

  const load = async () => {
    const saved = await readModel(driver);
    if (saved && !index) {
      await build(saved);
    }
  };

  const apply = async (model) => {
    if (!model?.version) {
      return;
    }
    if (Array.isArray(model.links)) {
      await build(model);
      saver.soon(true);
      return;
    }
    if (!index || !Array.isArray(model.changes)) {
      return;
    }
    for (const message of model.changes) {
      index.observe(message);
    }
    version = String(model.version);
    if (model.changes.length > 0) {
      changed();
      saver.soon();
    }
  };

  /** Bring the copy up to the server's (once at a time). */
  const sync = () => {
    if (syncing) {
      again = true;
      return syncing;
    }
    syncing = Promise.resolve()
      .then(() => fetchModel({ since: index ? version : '' }))
      .then(apply, () => {})
      .finally(() => {
        syncing = null;
        if (again) {
          again = false;
          sync();
        }
      });
    return syncing;
  };

  const toAnswer = (source, chat, hint) => {
    const last = laterOf(index?.lastIn(source, chat) ?? null, hint);
    if (!last || isSelf(last.sender) || last.service || last.deleted) {
      return '';
    }
    const at = toMs(last.timestamp);
    return at !== null && now() - at > windowMs ? '' : String(last.body);
  };

  const cache = {
    /** Load the kept copy, then catch up with the server. */
    start() {
      started ??= load().then(sync);
      return started;
    },
    /** Something arrived: ask the server what it learned, soon. */
    nudge() {
      if (!started) {
        return;
      }
      globalThis.clearTimeout(nudgeTimer);
      nudgeTimer = defer(() => sync(), nudgeMs);
    },
    sync,
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
    autocomplete({ source, chat, hint = null, typed = '', limit = 8 }) {
      if (!index) {
        return null;
      }
      const lastMessage = toAnswer(source, chat, hint);
      return {
        ...index.autocomplete({ lastMessage, typed, limit }),
        lastMessage,
        backend: 'browser',
      };
    },
    stats: () => ({ ...(index?.stats() ?? {}), version }),
    /** Save now (a page closing; tests). */
    flush: () => saver.flush(),
  };
  return cache;
};

/**
 * Local suggestions first, then what the server adds that the copy
 * lacks (it keeps every rare reply, message and word): whole messages
 * in order, then the words — the copy's, or the server's when it knows
 * none — three at most, as the strip shows them.
 */
export const mergeSuggestions = (local, remote, { limit = 8 } = {}) => {
  if (!local) {
    return remote ?? { stage: 'none', suggestions: [] };
  }
  if (!remote?.suggestions?.length) {
    return local;
  }
  const whole = (list) => list.filter((s) => s.kind !== 'word');
  const shown = new Set(
    whole(local.suggestions).map((s) => normalizeMessage(s.text))
  );
  const added = whole(remote.suggestions).filter(
    (s) => !shown.has(normalizeMessage(s.text))
  );
  const wholes = [...whole(local.suggestions), ...added].slice(0, limit);
  const taken = new Set(wholes.map((s) => normalizeMessage(s.text)));
  const wordsOf = (result) =>
    result.suggestions.filter(
      (s) => s.kind === 'word' && !taken.has(normalizeMessage(s.text))
    );
  const known = wordsOf(local);
  const words = (known.length > 0 ? known : wordsOf(remote)).slice(
    0,
    Math.min(3, limit - wholes.length)
  );
  const suggestions = [...wholes, ...words];
  return { ...local, stage: suggestions[0]?.kind ?? 'none', suggestions };
};
