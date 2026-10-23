/**
 * Universal Links Access interface.
 *
 * Every storage backend (text-only `.lino`, binary doublets, dual store,
 * or a remote HTTP client) implements the same API so callers do not
 * care which substrate is underneath. This is requirement R-F8.
 *
 * A "link" is `{ id: string, tokens: string[], children?: string[] }`.
 * `tokens` are the human-readable payload; `children` is an optional
 * list of child link IDs for hierarchical structures.
 */

/**
 * @typedef {Object} Link
 * @property {string} id
 * @property {string[]} tokens
 * @property {string[]} [children]
 */

/**
 * @typedef {Object} UniversalLinksAccess
 * @property {(link: Link) => Promise<Link>} put
 * @property {(links: Link[]) => Promise<Link[]>} [putMany] bulk put; file
 *   backed stores write once for the whole batch
 * @property {(id: string) => Promise<Link | null>} get
 * @property {(id: string) => Promise<boolean>} delete
 * @property {(filter?: (l: Link) => boolean) => Promise<Link[]>} query
 * @property {(handler: (event: {type: string, link: Link}) => void) => () => void} subscribe
 */

export const createMemoryStore = () => {
  const data = new Map();
  const handlers = new Set();
  const emit = (event) => handlers.forEach((h) => h(event));

  const put = (link) => {
    if (!link || typeof link.id !== 'string') {
      throw new Error('link.id is required');
    }
    data.set(link.id, { ...link });
    emit({ type: 'put', link });
    return link;
  };

  return {
    async put(link) {
      return put(link);
    },
    async putMany(links) {
      return links.map(put);
    },
    async get(id) {
      const v = data.get(id);
      return v ? { ...v } : null;
    },
    async delete(id) {
      const existed = data.has(id);
      const link = data.get(id);
      data.delete(id);
      if (existed) {
        emit({ type: 'delete', link });
      }
      return existed;
    },
    // Only the matches are copied: a query for a few links of a large
    // store (graphs, secrets) does not copy every message first. The
    // filter reads the stored link; it must not change it.
    async query(filter) {
      const out = [];
      for (const link of data.values()) {
        if (!filter || filter(link)) {
          out.push({ ...link });
        }
      }
      return out;
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    /** How many links are held. */
    size: () => data.size,
    /**
     * The matching links in batches of `batchSize` copies, each handed to
     * `onBatch` (awaited) before the next is gathered: a pass over a large
     * store holds one batch, not every match (R-Z17). Writes made by
     * `onBatch` are safe (a link written again keeps its place). Resolves
     * to how many links were looked at.
     */
    async scan(filter, batchSize, onBatch) {
      let batch = [];
      let looked = 0;
      for (const link of data.values()) {
        looked += 1;
        if (!filter || filter(link)) {
          batch.push({ ...link });
          if (batch.length >= batchSize) {
            const full = batch;
            batch = [];
            await onBatch(full);
          }
        }
      }
      if (batch.length > 0) {
        await onBatch(batch);
      }
      return looked;
    },
  };
};

/**
 * Put a batch through `putMany` when the store offers it (file-backed
 * stores then write once), else one `put` at a time.
 */
export const putAll = async (store, links) => {
  if (typeof store.putMany === 'function') {
    await store.putMany(links);
    return links.length;
  }
  for (const link of links) {
    await store.put(link);
  }
  return links.length;
};
