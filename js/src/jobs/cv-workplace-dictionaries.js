import { loadResumeIndustries, readHhDictionaryTree } from './industries.js';
import { cvPrepareFailure } from './cv-prepare-record.js';

const invalid = () => {
  throw cvPrepareFailure('dictionary');
};
const label = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    invalid();
  }
  return value;
};
/** Iterative, finite traversal; duplicate identities never become guessed labels. */
export const cvAreaDirectory = (tree) => {
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
const areas = async ({ store, language, signal, fetchImpl, now }) => {
  const id = `jobs-areas:${language}`;
  const cached = await store.get(id);
  signal?.throwIfAborted();
  if (
    cached?.version === 1 &&
    now() >= cached.fetchedAt &&
    now() - cached.fetchedAt < 86400000
  ) {
    return cvAreaDirectory(cached.tree);
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
  const entries = cvAreaDirectory(tree);
  signal?.throwIfAborted();
  await store.put({ id, version: 1, fetchedAt: now(), tree });
  return entries;
};
/** Public localized dictionaries only; never attach to an owner's browser. */
export const loadCvWorkplaceDictionaries = async ({
  store,
  signal,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) => {
  const result = { areas: {}, industries: {} };
  for (const language of ['ru', 'en']) {
    result.areas[language] = await areas({
      store,
      language,
      signal,
      fetchImpl,
      now,
    });
    result.industries[language] = await loadResumeIndustries({
      store,
      language,
      signal,
      fetchImpl,
      now,
    });
  }
  return result;
};
const key = (value) =>
  value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
export const cvAreaIdentity = (name, dictionaries) => {
  if (!name) {
    return null;
  }
  const matches = new Set(
    ['ru', 'en'].flatMap((language) =>
      dictionaries.areas[language]
        .filter((row) => key(row.name) === key(name))
        .map((row) => row.id)
    )
  );
  if (matches.size !== 1) {
    invalid();
  }
  return [...matches][0];
};
export const cvLocalizedEntry = (section, id) => {
  const result = { id };
  for (const language of ['ru', 'en']) {
    const matches = section[language].filter((row) => row.id === id);
    if (matches.length !== 1) {
      invalid();
    }
    if (
      section[language].filter((row) => key(row.name) === key(matches[0].name))
        .length !== 1
    ) {
      invalid();
    }
    result[language] = {
      name: label(matches[0].name),
      parent: matches[0].parent,
    };
  }
  return result;
};
