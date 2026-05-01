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
 * @property {(id: string) => Promise<Link | null>} get
 * @property {(id: string) => Promise<boolean>} delete
 * @property {(filter?: (l: Link) => boolean) => Promise<Link[]>} query
 * @property {(handler: (event: {type: string, link: Link}) => void) => () => void} subscribe
 */

export const createMemoryStore = () => {
  const data = new Map();
  const handlers = new Set();
  const emit = (event) => handlers.forEach((h) => h(event));

  return {
    async put(link) {
      if (!link || typeof link.id !== 'string') {
        throw new Error('link.id is required');
      }
      data.set(link.id, { ...link });
      emit({ type: 'put', link });
      return link;
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
    async query(filter) {
      const all = [...data.values()].map((l) => ({ ...l }));
      return filter ? all.filter(filter) : all;
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
};
