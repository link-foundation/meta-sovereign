/**
 * The message-to-message reply graph kept in a link-cli (`clink`)
 * doublets database, for fast whole-message autocomplete (issue #31).
 *
 * Network shape (all values are named points, shared by every link that
 * mentions them; names come from `clinkName`):
 *
 *   q = (ms:prompt P)          P = the normalized incoming message
 *   e = (q R)                  R = the normalized reply — one edge per
 *                                  distinct (prompt, reply) pair
 *   (e ms:n:<count>)           how many times we answered P with R
 *   (e <original text>)        the reply as we typed it
 *   (e ms:t:<iso>)             when we last used it
 *
 * A prompt is wrapped in `q` so a reply equal to its prompt ("привет" →
 * "Привет!") is still its own edge. Suggesting is one join query
 * `($q: ms:prompt P) ($e: $q $r) ($a: $e $v)`; learning updates the
 * count link in place. The whole graph is (re)loaded at once through
 * the binary links notation archive (`clink --import-binary`).
 *
 * link-cli 1.0.0 (Rust) and 4.0.0 (.NET) scan every link per lookup, so
 * a query costs tens to hundreds of milliseconds as the graph grows
 * (experiments/clink-query-scaling.mjs). The reply service therefore
 * answers keystrokes from the in-memory index and keeps this store as
 * the persisted, queryable mirror.
 */

import {
  ClinkError,
  clinkName,
  clinkText,
  findClink,
  importArchive,
  quoteName,
  startClinkServer,
} from '../storage/clink.js';
import { encodeLinksArchive } from '../storage/doublets-archive.js';
import { normalizeMessage } from './reply-graph.js';

const PROMPT = 'ms:prompt';
const countName = (n) => `ms:n:${n}`;
const timeName = (at) => `ms:t:${at}`;

const pairKey = (pair) => ({
  prompt: normalizeMessage(pair.prompt),
  answer: normalizeMessage(pair.reply),
});

/**
 * The doublets network for reply links (`index.toLinks()` rows:
 * `{ prompt, reply, count, at }`), as `{ links, names }` for
 * `encodeLinksArchive`.
 */
export const replyNetwork = (pairs = []) => {
  const links = [];
  const names = new Map();
  const point = (name) => {
    if (!names.has(name)) {
      links.push([links.length + 1, links.length + 1]);
      names.set(name, links.length);
    }
    return names.get(name);
  };
  const pairs2 = new Map();
  const pair = (s, t) => {
    const key = `${s} ${t}`;
    if (!pairs2.has(key)) {
      links.push([s, t]);
      pairs2.set(key, links.length);
    }
    return pairs2.get(key);
  };
  const promptPoint = point(PROMPT);
  for (const row of pairs) {
    const { prompt, answer } = pairKey(row);
    if (!prompt || !answer) {
      continue;
    }
    const q = pair(promptPoint, point(clinkName(prompt)));
    const e = pair(q, point(clinkName(answer)));
    pair(e, point(countName(Number(row.count ?? 1))));
    pair(e, point(clinkName(String(row.reply).trim())));
    if (row.at) {
      pair(e, point(timeName(row.at)));
    }
  }
  return { links, names };
};

const joinQuery = (P, R = '$r') => {
  const pattern = `($q: ${quoteName(PROMPT)} ${P}) ($e: $q ${R}) ($a: $e $v)`;
  return `((${pattern}) (${pattern}))`;
};

/** Group a join answer into `[{ id, answer, count, text, at, attrs }]`. */
const readEdges = (changes) => {
  const found = changes.map((c) => c.after).filter(Boolean);
  const prompts = new Set(
    found.filter((l) => l.source === PROMPT).map((l) => l.id)
  );
  const edges = new Map();
  for (const l of found) {
    if (prompts.has(l.source) && !edges.has(l.id)) {
      edges.set(l.id, {
        id: l.id,
        answer: clinkText(l.target),
        count: 0,
        text: null,
        at: null,
        attrs: {},
      });
    }
  }
  for (const l of found) {
    const edge = edges.get(l.source);
    if (!edge) {
      continue;
    }
    if (l.target.startsWith('ms:n:')) {
      edge.count = Number(l.target.slice(5));
      edge.attrs.count = l;
    } else if (l.target.startsWith('ms:t:')) {
      edge.at = l.target.slice(5);
      edge.attrs.at = l;
    } else if (edge.text === null) {
      edge.text = clinkText(l.target);
    }
  }
  return [...edges.values()];
};

const missingReference = (error) =>
  error instanceof ClinkError && /non-existent link/.test(error.message);

/**
 * A reply store over `clink --serve`. `open(pairs)` loads the graph
 * (replacing the database), `learn(pair)` adds one use, and
 * `suggestReplies(prompt, { typed, limit })` answers like
 * `createReplyIndex().suggestReplies`.
 */
export const createClinkReplyStore = ({
  bin = findClink(),
  db,
  startServer = startClinkServer,
  importImpl = importArchive,
} = {}) => {
  let server = null;
  // Learning takes several queries; one at a time keeps edges unique.
  let writes = Promise.resolve();
  const serial = (task) => {
    const next = writes.then(task);
    writes = next.catch(() => {});
    return next;
  };
  const query = (text) => {
    if (!server) {
      throw new ClinkError('clink reply store is not open');
    }
    return server.query(text);
  };
  const edgesFor = async (P, R) => {
    try {
      return readEdges(await query(joinQuery(P, R)));
    } catch (error) {
      if (missingReference(error)) {
        return [];
      }
      throw error;
    }
  };
  const created = async (text) => {
    const [change] = await query(`(() (${text}))`);
    return change?.after?.id;
  };
  const ensurePoints = (names) =>
    query(
      `(() (${[...new Set(names)]
        .map(quoteName)
        .map((n) => `(${n}: ${n} ${n})`)
        .join(' ')}))`
    );
  const update = async (link, target) => {
    await ensurePoints([target]);
    const before = `(${link.id}: ${link.source} ${quoteName(link.target)})`;
    const after = `(${link.id}: ${link.source} ${quoteName(target)})`;
    await query(`((${before}) (${after}))`);
  };

  const learnOne = async ({ prompt, reply, at = null, count = 1 }) => {
    const { prompt: key, answer } = pairKey({ prompt, reply });
    if (!key || !answer) {
      return false;
    }
    const P = clinkName(key);
    const R = clinkName(answer);
    const [edge] = await edgesFor(quoteName(P), quoteName(R));
    if (edge) {
      await update(edge.attrs.count, countName(edge.count + count));
      if (at && String(at) > String(edge.at ?? '')) {
        if (edge.attrs.at) {
          await update(edge.attrs.at, timeName(at));
        } else {
          await ensurePoints([timeName(at)]);
          await created(`(${edge.id} ${quoteName(timeName(at))})`);
        }
      }
      return true;
    }
    const original = clinkName(String(reply).trim());
    const attrs = [countName(count), original, ...(at ? [timeName(at)] : [])];
    await ensurePoints([PROMPT, P, R, ...attrs]);
    const q = await created(`(${quoteName(PROMPT)} ${quoteName(P)})`);
    const e = await created(`(${q} ${quoteName(R)})`);
    await query(
      `(() (${attrs.map((name) => `(${e} ${quoteName(name)})`).join(' ')}))`
    );
    return true;
  };

  return {
    available: Boolean(bin),
    get ready() {
      return Boolean(server);
    },
    /** Replace the database with `pairs` and start serving it. */
    open: (pairs = []) =>
      serial(async () => {
        if (!bin) {
          throw new ClinkError('clink is not installed');
        }
        await server?.close();
        server = null;
        await importImpl({
          bin,
          db,
          archive: encodeLinksArchive(replyNetwork(pairs)),
        });
        server = await startServer({ bin, db });
        return true;
      }),
    /** Count one more use of `reply` for `prompt`. */
    learn: (pair) => serial(() => learnOne(pair)),
    /**
     * Every reply used for `prompt`, once, most used first (recency
     * breaks ties); `typed` keeps the ones starting with it.
     */
    async suggestReplies(prompt, { typed = '', limit = 8 } = {}) {
      const key = normalizeMessage(prompt);
      if (!key) {
        return [];
      }
      const prefix = normalizeMessage(typed);
      return (await edgesFor(quoteName(clinkName(key))))
        .filter((e) => !prefix || e.answer.startsWith(prefix))
        .sort(
          (a, b) =>
            b.count - a.count ||
            String(b.at ?? '').localeCompare(String(a.at ?? ''))
        )
        .slice(0, limit)
        .map((e) => ({
          kind: 'reply',
          text: e.text ?? e.answer,
          count: e.count,
          lastUsed: e.at,
        }));
    },
    async close() {
      await writes;
      await server?.close();
      server = null;
    },
  };
};
