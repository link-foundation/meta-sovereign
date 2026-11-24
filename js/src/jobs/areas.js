import { readHhDictionaryTree } from './industries.js';
import { jobsFailure } from './options.js';

const invalid = () => {
  throw jobsFailure(
    'areas-unavailable',
    'A unique official HH area was not confirmed.'
  );
};
const label = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    invalid();
  }
  return value;
};
/** The complete tree is finite; IDs, rather than translated labels, identify areas. */
export const areaDirectory = (tree) => {
  if (!Array.isArray(tree) || !tree.length) {
    invalid();
  }
  const entries = [];
  const seen = new Set();
  const queue = tree.map((node) => ({ node, parent: '', depth: 0 }));
  for (let index = 0; index < queue.length; index++) {
    const { node, parent, depth } = queue[index];
    if (
      queue.length > 20000 ||
      depth > 12 ||
      typeof node?.id !== 'string' ||
      !/^\d{1,12}$/u.test(node.id) ||
      seen.has(node.id) ||
      !Array.isArray(node.areas)
    ) {
      invalid();
    }
    seen.add(node.id);
    const name = label(node.name);
    entries.push({ id: node.id, name, parent });
    for (const child of node.areas) {
      queue.push({ node: child, parent: name, depth: depth + 1 });
    }
  }
  return entries;
};
export const loadResumeAreas = async ({
  store,
  language,
  signal,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) => {
  if (!['ru', 'en'].includes(language)) {
    invalid();
  }
  const id = `jobs-areas:${language}`;
  const cached = await store.get(id);
  signal?.throwIfAborted();
  if (
    cached?.version === 1 &&
    now() >= cached.fetchedAt &&
    now() - cached.fetchedAt < 86400000
  ) {
    return areaDirectory(cached.tree);
  }
  const { AbortSignal } = globalThis;
  const response = await fetchImpl(
    `https://api.hh.ru/areas?locale=${language.toUpperCase()}`,
    {
      headers: {
        'HH-User-Agent':
          'Meta-Sovereign (https://github.com/link-foundation/meta-sovereign)',
      },
      credentials: 'omit',
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    }
  );
  const tree = await readHhDictionaryTree(response);
  const entries = areaDirectory(tree);
  signal?.throwIfAborted();
  await store.put({ id, version: 1, fetchedAt: now(), tree });
  return entries;
};
const key = (value) =>
  value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
/** Duplicate localized labels are not enough evidence to select a region. */
export const resolveResumeArea = (name, entries) => {
  if (!name) {
    return null;
  }
  const matches = entries.filter((entry) => key(entry.name) === key(name));
  const ids = new Set(matches.map((entry) => entry.id));
  if (ids.size !== 1) {
    invalid();
  }
  return matches[0];
};
