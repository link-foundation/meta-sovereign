import { jobsFailure } from './options.js';
import { assignmentText } from '../assignments/validation.js';

const invalid = () => {
  throw jobsFailure(
    'industries-unavailable',
    'A unique official company industry could not be verified.'
  );
};
export const industryDirectory = (tree) => {
  if (!Array.isArray(tree) || !tree.length || tree.length > 200) {
    invalid();
  }
  const seen = new Set();
  const unique = (id, pattern) => {
    if (typeof id !== 'string' || !pattern.test(id) || seen.has(id)) {
      invalid();
    }
    seen.add(id);
    return id;
  };
  return tree.flatMap((group) => {
    const parentId = unique(group.id, /^\d{1,8}$/u);
    const parent = assignmentText(group.name, 500, 'industry group');
    if (!Array.isArray(group.industries) || group.industries.length > 500) {
      invalid();
    }
    return group.industries.map((row) => ({
      id: unique(row.id, new RegExp(`^${parentId}\\.\\d{1,8}$`, 'u')),
      name: assignmentText(row.name, 500, 'industry'),
      parent,
    }));
  });
};
const normalized = (value) => value.replace(/\s+/gu, ' ').trim();
export const resolveResumeIndustry = (value, entries) => {
  const matches = entries.filter(
    (entry) =>
      normalized(entry.name) === normalized(value.name) &&
      (!value.parent || normalized(entry.parent) === normalized(value.parent))
  );
  if (matches.length !== 1) {
    invalid();
  }
  return matches[0];
};

const readIndustryTree = async (response) => {
  const limit = 2 * 1024 ** 2;
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get('content-length')) > limit
  ) {
    invalid();
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) {
        break;
      }
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        invalid();
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const tree = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  );
  return tree;
};

/** The localized public dictionary has no account credentials or private values. */
export const loadResumeIndustries = async ({
  store,
  language,
  signal,
  fetchImpl = globalThis.fetch,
  now = Date.now,
}) => {
  const { AbortSignal } = globalThis;
  if (!['ru', 'en'].includes(language)) {
    invalid();
  }
  const id = `jobs-industries:${language}`;
  const cached = await store.get(id);
  signal?.throwIfAborted();
  if (
    cached?.version === 1 &&
    now() - cached.fetchedAt >= 0 &&
    now() - cached.fetchedAt < 86400000
  ) {
    return industryDirectory(cached.tree);
  }
  const url = `https://api.hh.ru/industries?locale=${language.toUpperCase()}`;
  const response = await fetchImpl(url, {
    headers: {
      'HH-User-Agent':
        'Meta-Sovereign (https://github.com/link-foundation/meta-sovereign)',
    },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const tree = await readIndustryTree(response);
  const entries = industryDirectory(tree);
  signal?.throwIfAborted();
  await store.put({ id, version: 1, fetchedAt: now(), tree });
  return entries;
};
